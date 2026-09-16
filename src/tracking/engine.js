/** Pure accounting: the caller supplies the clock and observed browser context. */
export function createState() {
  return { version: 1, paused: false, days: {}, recent: [], active: null };
}

export function dayKey(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function hostname(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.hostname.replace(/^www\./, '').replace(/\.$/, '') : null;
  } catch {
    return null;
  }
}

/** Mutates one snapshot so its cursor and aggregates can be persisted together. */
export function transition(state, context, now) {
  const previous = state.active;
  if (previous && now >= previous.since && now - previous.since <= 90000) {
    let cursor = previous.since;
    while (cursor < now) {
      const date = new Date(cursor);
      const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      const end = Math.min(now, midnight);
      const day = state.days[dayKey(cursor)] ??= {};
      // defineProperty safely supports unusual valid single-label hostnames.
      if (!Object.hasOwn(day, previous.domain)) {
        Object.defineProperty(day, previous.domain, {
          value: { totalMs: 0, fullscreenMs: 0 }, enumerable: true, writable: true, configurable: true,
        });
      }
      day[previous.domain].totalMs += end - cursor;
      if (previous.fullscreen) day[previous.domain].fullscreenMs += end - cursor;
      const last = state.recent.at(-1);
      if (last && last.domain === previous.domain && last.fullscreen === previous.fullscreen
          && last.tabId === previous.tabId && last.end === cursor && dayKey(last.start) === dayKey(cursor)) {
        last.end = end;
      } else {
        state.recent.push({ domain: previous.domain, fullscreen: previous.fullscreen,
          tabId: previous.tabId, start: cursor, end });
      }
      cursor = end;
    }
  }
  state.active = context && !state.paused ? { ...context, since: now } : null;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 29);
  const oldest = dayKey(cutoff);
  for (const day of Object.keys(state.days)) if (day < oldest) delete state.days[day];
  state.recent = state.recent.filter(item => dayKey(item.start) >= oldest).slice(-200);
  return state;
}
