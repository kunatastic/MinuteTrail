import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRange } from '../src/ui/summary.js';

test('date bounds advance at local midnight and retain 30 calendar days', () => {
  assert.deepEqual(dateRange(new Date(2026, 8, 8, 23, 59).getTime()), { min: '2026-08-10', max: '2026-09-08' });
  assert.deepEqual(dateRange(new Date(2026, 8, 9, 0, 1).getTime()), { min: '2026-08-11', max: '2026-09-09' });
});
