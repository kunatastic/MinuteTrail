import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../src/background/tracker.js';

function fixture() {
  let time = new Date(2026, 8, 8, 10).getTime();
  let focus = true;
  let domain = 'a.com';
  const local = {};
  const session = {};
  const area = data => ({
    get: async key => ({ [key]: structuredClone(data[key]) }),
    set: async values => Object.assign(data, structuredClone(values)),
  });
  const api = {
    storage: { local: area(local), session: area(session) },
    idle: { queryState: async () => 'active' },
    windows: { getLastFocused: async () => ({ id: 1, focused: focus, state: 'normal' }) },
    tabs: { query: async () => [{ id: 1, url: `https://${domain}` }],
      sendMessage: async () => ({ fullscreen: false, focused: focus }) },
  };
  return { api, local, session, clock: () => time,
    advance: ms => { time += ms; }, focus: value => { focus = value; },
    domain: value => { domain = value; } };
}

test('focus loss stops accounting; worker recreation does not duplicate time', async () => {
  const f = fixture();
  let tracker = createTracker(f.api, f.clock);
  await tracker.run();
  f.advance(10000);
  f.focus(false);
  await tracker.run();
  f.advance(10000);
  tracker = createTracker(f.api, f.clock);
  const state = await tracker.run();
  assert.equal(state.days['2026-09-08']['a.com'].totalMs, 10000);
  assert.equal(state.active, null);
});
test('browser restart discards the old cursor even for a short shutdown', async () => {
  const f = fixture();
  await createTracker(f.api, f.clock).run();
  f.advance(20000);
  delete f.session.browserSession;
  const state = await createTracker(f.api, f.clock).run();
  assert.deepEqual(state.days, {});
});
test('pause/resume persist without resurrecting time', async () => {
  const f = fixture();
  const tracker = createTracker(f.api, f.clock);
  await tracker.run();
  f.advance(10000);
  assert.equal((await tracker.run({ type: 'pause', paused: true })).paused, true);
  f.advance(10000);
  await tracker.run({ type: 'pause', paused: false });
  f.advance(5000);
  const state = await tracker.run();
  assert.equal(state.days['2026-09-08']['a.com'].totalMs, 15000);
});
test('failed storage write rejects and the next request can recover', async () => {
  const f = fixture();
  const tracker = createTracker(f.api, f.clock);
  const save = f.api.storage.local.set;
  f.api.storage.local.set = async () => { throw new Error('Storage full'); };
  await assert.rejects(tracker.run(), /Storage full/);
  f.api.storage.local.set = save;
  assert.equal((await tracker.run()).active.domain, 'a.com');
});
test('concurrent checkpoints serialize without double counting', async () => {
  const f = fixture();
  const tracker = createTracker(f.api, f.clock);
  await tracker.run();
  f.advance(10000);
  await Promise.all([tracker.run(), tracker.run(), tracker.run()]);
  assert.equal(f.local.tracker.days['2026-09-08']['a.com'].totalMs, 10000);
});
test('concurrent toggles act on persisted pause state', async () => {
  const f = fixture();
  const tracker = createTracker(f.api, f.clock);
  const [first, second] = await Promise.all([tracker.run({ type: 'toggle' }), tracker.run({ type: 'toggle' })]);
  assert.equal(first.paused, true);
  assert.equal(second.paused, false);
});
test('malformed state is backed up before recovery, and recovery is visible', async () => {
  for (const broken of [{ version: 1 }, { version: 1, days: {}, recent: null },
    { version: 1, days: { '2026-09-08': { 'a.com': { totalMs: -1, fullscreenMs: 8 } } }, recent: [], paused: false, active: null }]) {
    const f = fixture();
    f.local.tracker = broken;
    const state = await createTracker(f.api, f.clock).run();
    assert.deepEqual(state.days, {});
    assert.match(state.warning, /backup/);
    assert.deepEqual(f.local.tracker_backup, broken);
  }
});
test('unknown storage version is preserved with an actionable error', async () => {
  const f = fixture();
  f.local.tracker = { version: 2, days: { keep: true } };
  await assert.rejects(createTracker(f.api, f.clock).run(), /newer.*not changed/i);
  assert.deepEqual(f.local.tracker, { version: 2, days: { keep: true } });
});
test('closing the last window excludes the gap before opening another', async () => {
  const f = fixture();
  const tracker = createTracker(f.api, f.clock);
  const getWindow = f.api.windows.getLastFocused;
  await tracker.run();
  f.advance(10000);
  f.api.windows.getLastFocused = async () => { throw new Error('No last focused window'); };
  await tracker.run();
  f.advance(30000);
  f.api.windows.getLastFocused = getWindow;
  const state = await tracker.run();
  assert.equal(state.days['2026-09-08']['a.com'].totalMs, 10000);
});
