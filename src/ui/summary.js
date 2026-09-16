import { dayKey } from '../tracking/engine.js';

export function dateRange(now) {
  const oldest = new Date(now);
  oldest.setDate(oldest.getDate() - 29);
  return { min: dayKey(oldest), max: dayKey(now) };
}

/** UI derivations stay independent of the DOM and the Chrome runtime. */
export function summarize(day = {}) {
  const sites = Object.entries(day).map(([domain, totals]) => ({ domain, ...totals }))
    .sort((a, b) => b.totalMs - a.totalMs);
  const totalMs = sites.reduce((sum, site) => sum + site.totalMs, 0);
  const fullscreenMs = sites.reduce((sum, site) => sum + site.fullscreenMs, 0);
  return { totalMs, fullscreenMs, sites: sites.map(site => ({ ...site, share: totalMs ? site.totalMs / totalMs : 0 })) };
}

export function duration(ms) {
  if (!Number.isFinite(ms)) return '0s';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
}
