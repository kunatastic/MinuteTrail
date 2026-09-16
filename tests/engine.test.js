import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, dayKey, hostname } from '../src/tracking/engine.js';

const start = new Date(2026, 8, 8, 10).getTime();
const site = (domain, fullscreen = false) => ({ domain, fullscreen, tabId: 1 });

test('switching websites allocates each interval exactly once', () => {
  const state = createState();
  transition(state, site('a.com'), start);
  transition(state, site('b.com'), start + 10000);
  transition(state, null, start + 30000);
  transition(state, null, start + 40000);
  assert.equal(state.days[dayKey(start)]['a.com'].totalMs, 10000);
  assert.equal(state.days[dayKey(start)]['b.com'].totalMs, 20000);
});

test('fullscreen is a subset; checkpoints merge recent segments', () => {
  const state = createState();
  transition(state, site('a.com'), start);
  transition(state, site('a.com', true), start + 10000);
  transition(state, site('a.com', true), start + 20000);
  transition(state, null, start + 30000);
  assert.deepEqual(state.days[dayKey(start)]['a.com'], { totalMs: 30000, fullscreenMs: 20000 });
  assert.equal(state.recent.length, 2);
});

test('pause settles the current site and excludes subsequent time', () => {
  const state = createState();
  transition(state, site('a.com'), start);
  transition(state, null, start + 5000);
  state.paused = true;
  transition(state, site('a.com'), start + 20000);
  transition(state, null, start + 25000);
  assert.equal(state.days[dayKey(start)]['a.com'].totalMs, 5000);
  assert.equal(state.active, null);
});

test('local midnight splits an interval between two dates', () => {
  const midnight = new Date(2026, 8, 9).getTime();
  const state = createState();
  transition(state, site('a.com'), midnight - 10000);
  transition(state, null, midnight + 20000);
  assert.equal(state.days['2026-09-08']['a.com'].totalMs, 10000);
  assert.equal(state.days['2026-09-09']['a.com'].totalMs, 20000);
});

test('sleep gaps and backwards clocks never create phantom time', () => {
  const state = createState();
  transition(state, site('a.com'), start);
  transition(state, site('a.com'), start + 3600000);
  transition(state, site('a.com'), start + 3500000);
  assert.deepEqual(state.days, {});
});

test('retention removes old dates and limits recent activity', () => {
  const state = createState();
  state.days['2026-08-01'] = {};
  state.days['2026-08-10'] = {};
  for (let i = 0; i < 205; i++) transition(state, site(`${i}.com`), start + i * 1000);
  assert.equal(state.days['2026-08-01'], undefined);
  assert.ok(state.days['2026-08-10']);
  assert.equal(state.recent.length, 200);
});

test('only web hostnames are retained; sensitive URL parts are discarded', () => {
  assert.equal(hostname('https://www.example.com/private?token=secret'), 'example.com');
  assert.equal(hostname('https://docs.example.com/a'), 'docs.example.com');
  assert.equal(hostname('https://www.example.com./a'), 'example.com');
  for (const url of ['chrome://settings', 'file:///tmp/a', 'broken', undefined]) {
    assert.equal(hostname(url), null);
  }
});
