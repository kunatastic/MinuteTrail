import { duration } from './summary.js';

/** Website data is always text, never interpreted as HTML. */
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderSummary(root, summary) {
  root.replaceChildren(...[
    ['Focused browsing', duration(summary.totalMs), 'Time in your foreground website'],
    ['Websites visited', String(summary.sites.length), 'Unique domains on this day'],
    ['In fullscreen', duration(summary.fullscreenMs), 'Included in focused browsing'],
  ].map(([label, value, note]) => {
    const card = element('article', 'metric');
    card.append(element('p', 'eyebrow', label), element('p', 'metric-value', value), element('p', 'muted', note));
    return card;
  }));
}

export function renderSites(root, sites) {
  if (!sites.length) {
    root.replaceChildren(element('p', 'empty', 'No browsing time yet. Visit a website and keep its window focused to start.'));
    return;
  }
  root.replaceChildren(...sites.map((site, index) => {
    const row = element('li', 'site');
    const icon = element('span', `site-icon color-${index % 4}`, site.domain[0].toUpperCase());
    icon.setAttribute('aria-hidden', 'true');
    const info = element('div', 'site-info');
    const heading = element('div', 'site-heading');
    heading.append(element('span', 'domain', site.domain), element('strong', '', duration(site.totalMs)));
    const bar = element('div', 'bar');
    const fill = element('span', 'bar-fill');
    fill.style.width = `${site.share * 100}%`;
    bar.append(fill);
    const detail = `${Math.round(site.share * 100)}% of your time${site.fullscreenMs ? ` · ${duration(site.fullscreenMs)} fullscreen` : ''}`;
    info.append(heading, bar, element('p', 'muted', detail));
    row.append(icon, info);
    return row;
  }));
}

export function renderActivity(root, activity, hasTotals = false) {
  const time = stamp => new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!activity.length) {
    root.replaceChildren(element('p', 'empty', hasTotals
      ? 'Detailed sessions for this day are no longer kept. Only the latest 200 sessions are retained.'
      : 'Your recent focused sessions will appear here.'));
    return;
  }
  root.replaceChildren(...activity.slice().reverse().slice(0, 30).map(item => {
    const row = element('li', 'activity-row');
    const info = element('div');
    info.append(element('p', 'domain', item.domain),
      element('p', 'muted', `${time(item.start)} – ${time(item.end)}${item.fullscreen ? ' · Fullscreen' : ''}`));
    row.append(info, element('span', 'activity-duration', duration(item.end - item.start)));
    return row;
  }));
}
