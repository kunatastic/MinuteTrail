import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, duration } from '../src/ui/summary.js';

test('summary ranks sites and calculates fullscreen as part of total', () => {
  const result = summarize({ 'a.com': { totalMs: 10000, fullscreenMs: 5000 },
    'b.com': { totalMs: 20000, fullscreenMs: 0 } });
  assert.equal(result.totalMs, 30000);
  assert.equal(result.fullscreenMs, 5000);
  assert.equal(result.sites[0].domain, 'b.com');
  assert.equal(result.sites[0].share, 2 / 3);
  assert.deepEqual(summarize({}), { totalMs: 0, fullscreenMs: 0, sites: [] });
});
test('duration remains readable for seconds, minutes and hours', () => {
  assert.equal(duration(0), '0s');
  assert.equal(duration(59000), '59s');
  assert.equal(duration(61000), '1m 1s');
  assert.equal(duration(3661000), '1h 1m');
  assert.equal(duration(NaN), '0s');
  assert.equal(duration(undefined), '0s');
});
