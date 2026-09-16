import { dayKey } from '../tracking/engine.js';
import { summarize, dateRange } from './summary.js';
import { renderSummary, renderSites, renderActivity } from './components.js';

// Static shell contains no external data. Dynamic components use textContent.
document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="dashboard.html" target="_blank"><span class="brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 6.5V12h5"/></svg></span> MinuteTrail</a>
    <span class="local-tag">On-device only</span>
  </header>
  <section class="intro">
    <p class="eyebrow">A LITTLE MORE AWARENESS</p>
    <h1>Your time, in perspective.</h1>
    <p class="subtitle">See where your attention goes, one website at a time.</p>
  </section>
  <div id="error" role="alert" hidden></div>
  <p id="warning" role="status" hidden></p>
  <section class="toolbar" aria-label="Tracking controls">
    <span id="status" role="status">Connecting to tracker…</span>
    <button id="pause" disabled>Pause tracking</button>
  </section>
  <p id="probe-note" class="muted" hidden>Page fullscreen detection is unavailable. Refresh the website; restricted pages may not support it.</p>
  <div class="section-heading"><h2>Your overview</h2><label class="date-label">Day <input id="date" type="date"></label></div>
  <section id="summary" class="summary" aria-label="Daily totals"></section>
  <div class="columns">
    <section class="panel"><div class="panel-heading"><h2>Where your time went</h2><span class="muted">By website</span></div><ul id="sites" class="list"></ul></section>
    <section class="panel activity-panel"><div class="panel-heading"><h2>Recent activity</h2><span class="muted">Latest 30 sessions</span></div><ul id="activity" class="list"></ul></section>
  </div>
  <footer><p>Only the focused website counts. Tracking pauses after 60s of inactivity.<br>Fullscreen time is included in your total. History is kept for 30 days.<br>Each browser profile keeps separate history.</p><a class="dashboard-link" href="dashboard.html" target="_blank">Open dashboard ↗</a></footer>
`;

const $ = selector => document.querySelector(selector);
if (!document.body.classList.contains('popup')) $('.brand').removeAttribute('target');
const STATUS = {
  unfocused: 'Paused · browser not focused', idle: 'Paused · no input for 60s',
  locked: 'Paused · screen locked', 'non-web': 'Not tracking · this tab is not a website',
  ambiguous: 'Paused · waiting for a focused pane', unavailable: 'Paused · browser context unavailable; retrying',
};
const date = $('#date');
date.value = dayKey(Date.now());
date.max = date.value;
let state;
let busy = false;

function render() {
  const { min, max } = dateRange(Date.now());
  const wasToday = date.value === date.max;
  date.min = min;
  date.max = max;
  if (wasToday || date.value > max) date.value = max;
  if (date.value < min) date.value = min;
  const summary = summarize(state.days[date.value]);
  renderSummary($('#summary'), summary);
  renderSites($('#sites'), summary.sites);
  renderActivity($('#activity'), state.recent.filter(item => dayKey(item.start) === date.value), summary.totalMs > 0);
  $('#status').textContent = state.paused ? 'Tracking paused' : state.active
    ? `Tracking ${state.active.domain}${state.active.fullscreen ? ' · Fullscreen' : ''}`
    : STATUS[state.reason] ?? 'Ready · waiting for a focused website';
  $('#probe-note').hidden = state.paused || state.probe !== 'missing';
  $('#warning').textContent = typeof state.warning === 'string' ? state.warning : '';
  $('#warning').hidden = !$('#warning').textContent;
  $('#status').className = state.active ? 'status active' : 'status';
  $('#pause').textContent = state.paused ? 'Resume tracking' : 'Pause tracking';
  $('#pause').disabled = false;
}

async function request(command = { type: 'snapshot' }) {
  try {
    if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('Load this folder as an extension to start tracking.');
    const response = await chrome.runtime.sendMessage(command);
    if (!response?.ok) throw new Error(response?.error ?? 'Tracker unavailable. Reload the extension and try again.');
    state = response.state;
    $('#error').hidden = true;
    render();
    return true;
  } catch (error) {
    $('#error').textContent = error.message;
    $('#error').hidden = false;
    $('#status').textContent = 'Tracker unavailable';
    $('#pause').disabled = true;
    return false;
  }
}

date.addEventListener('change', () => { if (state) render(); });
$('#pause').addEventListener('click', async () => {
  if (busy || !state) return;
  busy = true;
  await request({ type: 'toggle' });
  busy = false;
});
await request();
// UI polling checkpoints the current snapshot; it never owns the tracking timer.
setInterval(() => { if (!document.hidden && !busy) void request(); }, 5000);
