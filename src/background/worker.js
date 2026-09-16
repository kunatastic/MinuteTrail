import { createTracker } from './tracker.js';

const tracker = createTracker(chrome);
const CHECKPOINT = 'tracker-checkpoint';
const windowStates = new Map();

async function refresh(command) {
  try {
    const state = await tracker.run(command);
    await chrome.action.setBadgeText({ text: state.paused ? 'Ⅱ' : '' });
    return { ok: true, state };
  } catch (error) {
    console.error('MinuteTrail could not save activity:', error);
    await chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    return { ok: false, error: `Tracking could not update: ${error.message || 'unknown error'}` };
  }
}

// Register synchronously so events can wake a suspended Manifest V3 worker.
chrome.tabs.onActivated.addListener(() => { void refresh(); });
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) void refresh();
});
chrome.tabs.onRemoved.addListener(() => { void refresh(); });
chrome.tabs.onReplaced.addListener(() => { void refresh(); });
chrome.windows.onFocusChanged.addListener(() => { void refresh(); });
chrome.windows.onBoundsChanged.addListener(window => {
  if (windowStates.get(window.id) === window.state) return;
  windowStates.set(window.id, window.state);
  void refresh();
});
chrome.windows.onRemoved.addListener(id => { windowStates.delete(id); void refresh(); });
chrome.idle.onStateChanged.addListener(() => { void refresh(); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === CHECKPOINT) void refresh();
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'page-state' && sender.tab) {
    if (sender.tab.active === false) {
      respond({ ok: true });
      return false;
    }
    void refresh().then(result => respond({ ok: result.ok }));
    return true;
  }
  // Web content scripts may notify, but only extension pages may issue commands.
  if (!sender.url?.startsWith(chrome.runtime.getURL('src/ui/'))) return false;
  if (!['snapshot', 'toggle'].includes(message?.type)) return false;
  void refresh(message).then(respond);
  return true;
});

async function initialize() {
  chrome.idle.setDetectionInterval(60);
  if (!await chrome.alarms.get(CHECKPOINT)) {
    await chrome.alarms.create(CHECKPOINT, { periodInMinutes: 0.5 });
  }
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (error) {
    console.error('Could not restrict history storage to trusted extension contexts:', error);
  }
  await refresh();
}
void initialize().catch(error => console.error('Tracker initialization failed:', error));
