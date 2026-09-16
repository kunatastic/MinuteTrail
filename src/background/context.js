import { hostname } from '../tracking/engine.js';

/** Browser calls must never hold the single-writer queue indefinitely. */
async function bounded(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser response timed out')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reasons describe observations, not errors in history storage. */
export async function readObservation(api, timeoutMs = 500) {
  const stopped = reason => ({ context: null, reason, probe: null });
  try {
    const [window, idle] = await bounded(() => Promise.all([
      api.windows.getLastFocused(), api.idle.queryState(60),
    ]), timeoutMs);
    if (!window?.focused || window.state === 'minimized') return stopped('unfocused');
    if (idle !== 'active') return stopped(idle === 'locked' ? 'locked' : 'idle');
    const tabs = await bounded(() => api.tabs.query({ active: true, windowId: window.id }), timeoutMs);
    const candidates = tabs.filter(tab => !tab.incognito && hostname(tab.url));
    if (!candidates.length) return stopped('non-web');
    const observations = await Promise.all(candidates.map(async tab => {
      const page = await bounded(() => api.tabs.sendMessage(tab.id, { type: 'probe' }, { frameId: 0 }), timeoutMs)
        .catch(() => null);
      return { tab, page };
    }));
    // Popup/omnibox focus does not disqualify the sole active tab. Multiple
    // active panes require a positively focused page to avoid double counting.
    const selected = tabs.length === 1 ? observations[0] : observations.find(item => item.page?.focused === true);
    if (!selected) return stopped('ambiguous');
    const current = await bounded(() => api.windows.getLastFocused(), timeoutMs);
    if (!current?.focused || current.id !== window.id) return stopped('unfocused');
    const { tab, page } = selected;
    return { context: { domain: hostname(tab.url), tabId: tab.id,
      fullscreen: current.state === 'fullscreen' || page?.fullscreen === true },
    reason: null, probe: page ? 'ok' : 'missing' };
  } catch {
    // An unavailable context is ineligible. Settle/clear the old cursor normally.
    return stopped('unavailable');
  }
}

export async function readContext(api, timeoutMs) {
  return (await readObservation(api, timeoutMs)).context;
}
