import { transition } from '../tracking/engine.js';
import { restoreState } from '../tracking/storage-state.js';
import { readObservation } from './context.js';

/** Single writer: all events and UI commands use the same recoverable queue. */
export function createTracker(api, clock = Date.now) {
  let queue = Promise.resolve();
  async function execute(command = {}) {
    let { browserSession } = await api.storage.session.get('browserSession');
    if (!browserSession) {
      browserSession = crypto.randomUUID();
      await api.storage.session.set({ browserSession });
    }
    const saved = (await api.storage.local.get('tracker')).tracker;
    const { state, backup } = restoreState(saved);
    if (state.browserSession !== browserSession) state.active = null;
    const { context, reason, probe } = await readObservation(api);
    const now = clock();
    transition(state, context, now);
    if (command.type === 'pause' || command.type === 'toggle') {
      state.paused = command.type === 'toggle' ? !state.paused : command.paused === true;
      transition(state, context, now);
    }
    state.reason = reason;
    state.probe = probe;
    state.browserSession = browserSession;
    await api.storage.local.set(backup ? { tracker_backup: saved, tracker: state } : { tracker: state });
    return state;
  }
  return {
    run(command) {
      const result = queue.then(() => execute(command));
      queue = result.catch(() => {});
      return result;
    },
  };
}
