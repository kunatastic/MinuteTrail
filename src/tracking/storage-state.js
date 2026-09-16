import { createState } from './engine.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const amount = value => Number.isFinite(value) && value >= 0;
const site = value => record(value) && typeof value.domain === 'string' && value.domain.length > 0
  && Number.isInteger(value.tabId) && typeof value.fullscreen === 'boolean';

/** Validate persisted input at the boundary, before arithmetic or DOM rendering. */
function valid(state) {
  return record(state) && state.version === 1 && typeof state.paused === 'boolean'
    && record(state.days) && Object.entries(state.days).every(([day, sites]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(day) && record(sites) && Object.values(sites).every(total =>
        record(total) && amount(total.totalMs) && amount(total.fullscreenMs) && total.fullscreenMs <= total.totalMs))
    && Array.isArray(state.recent) && state.recent.every(item => site(item)
      && amount(item.start) && amount(item.end) && item.end >= item.start)
    && (state.active === null || (site(state.active) && amount(state.active.since)));
}

/** Bad version-1 data is backed up by the caller atomically with recovery. */
export function restoreState(saved) {
  if (saved === undefined) return { state: createState(), backup: false };
  if (record(saved) && Number.isInteger(saved.version) && saved.version !== 1) {
    throw new Error('History uses a different storage version. Use a compatible or newer extension; your data was not changed.');
  }
  if (valid(saved)) return { state: saved, backup: false };
  const state = createState();
  state.paused = saved?.paused === true;
  state.warning = 'Damaged history was moved to a local backup (tracker_backup). Tracking history has restarted.';
  return { state, backup: true };
}
