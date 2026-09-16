import test from 'node:test';
import assert from 'node:assert/strict';

test('worker keeps notification replies private and authorizes dashboard commands', async () => {
  const listeners = {};
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const local = {};
  const session = {};
  const area = data => ({
    get: async key => ({ [key]: structuredClone(data[key]) }),
    set: async values => Object.assign(data, structuredClone(values)),
    setAccessLevel: async () => {},
  });
  let alarm;
  let writes = 0;
  let badge = '';
  globalThis.chrome = {
    storage: { local: area(local), session: area(session) },
    idle: { queryState: async () => 'active', setDetectionInterval() {}, onStateChanged: event('idle') },
    windows: { getLastFocused: async () => ({ focused: false }),
      onFocusChanged: event('focus'), onBoundsChanged: event('bounds'), onRemoved: event('windowRemove') },
    tabs: { onActivated: event('activate'), onUpdated: event('update'),
      onRemoved: event('remove'), onReplaced: event('replace') },
    alarms: { get: async () => alarm, create: async (name, options) => { alarm = { name, ...options }; },
      onAlarm: event('alarm') },
    action: { setBadgeText: async ({ text }) => { badge = text; } },
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: event('message') },
  };
  const save = chrome.storage.local.set;
  chrome.storage.local.set = async values => { writes++; return save(values); };
  chrome.storage.local.setAccessLevel = async () => { throw new Error('Access setting unavailable'); };
  const originalError = console.error;
  console.error = () => {}; // Expected failures are asserted below, without noisy test output.
  try {
    await import('../src/background/worker.js');
    const send = (message, sender) => new Promise(resolve => {
      const accepted = listeners.message(message, sender, resolve);
      if (!accepted) resolve(undefined);
    });
    const ui = { id: 'test', url: 'chrome-extension://test/src/ui/dashboard.html' };
    const content = { id: 'test', url: 'https://example.com', tab: { id: 1 } };
    const result = await send({ type: 'snapshot' }, ui);
    assert.equal(result.ok, true);
    assert.deepEqual(await send({ type: 'page-state' }, content), { ok: true });
    assert.equal(await send({ type: 'clear' }, content), undefined);
    assert.equal(await send({ type: 'clear' }, { ...ui, id: 'foreign' }), undefined);
    assert.equal(await send({ type: 'clear' }, ui), undefined);
    assert.equal(await send({ type: 'label', label: 'Removed feature' }, ui), undefined);
    assert.equal(await send({ type: 'unknown' }, ui), undefined);
    assert.equal(alarm.periodInMinutes, 0.5);
    await send({ type: 'snapshot' }, ui);
    const before = writes;
    for (let i = 0; i < 50; i++) listeners.update(i, { status: 'complete' }, { active: false });
    await send({ type: 'snapshot' }, ui);
    assert.equal(writes - before, 1, 'background loads should not create extra writes');
    const beforeBackgroundMessage = writes;
    await send({ type: 'page-state' }, { ...content, tab: { id: 5, active: false } });
    await send({ type: 'snapshot' }, ui);
    assert.equal(writes - beforeBackgroundMessage, 1, 'background content notifications should not write');
    const beforeResize = writes;
    for (let i = 0; i < 50; i++) listeners.bounds({ id: 1, state: 'normal' });
    await send({ type: 'snapshot' }, ui);
    assert.ok(writes - beforeResize <= 2, 'same-state resizes should not enqueue repeated writes');
    // Prove an event settles/clears a previously active cursor in storage.
    local.tracker.active = { domain: 'a.com', fullscreen: false, tabId: 1, since: Date.now() - 1000 };
    listeners.focus(-1);
    const settled = await send({ type: 'snapshot' }, ui);
    assert.equal(settled.state.active, null);
    assert.ok(Object.values(settled.state.days).some(day => day['a.com']?.totalMs >= 1000));
    chrome.storage.local.set = async () => { throw new Error('Storage quota exceeded'); };
    const failed = await send({ type: 'snapshot' }, ui);
    assert.equal(failed.ok, false);
    assert.match(failed.error, /Storage quota exceeded/);
    assert.equal(badge, '!');
  } finally {
    console.error = originalError;
    delete globalThis.chrome;
  }
});
