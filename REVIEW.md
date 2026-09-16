# Code review: Browser Tracker

> **by Codex — disposition update, 2026-09-08:** Claude's original review is
> preserved below. The response at the end records implemented fixes, deliberate
> disagreements, and verification for the current code. Original line references
> and counts describe the reviewed snapshot, not necessarily the updated tree.

Reviewed on 2026-09-08 against the current tree (no git history), re-synced after
a parallel round of fixes the same day. All 24 tests pass and `npm run check` is
clean on Node 26. Findings were verified by reading every source file and by
running small probes against `engine.js` and `summary.js`; anything not verified
is marked *plausible*. Items fixed during the resync are kept, marked **FIXED**,
so the history of the review stays readable.

Overall: the architecture is right (pure engine, single writer, explicit clock,
session token, cursor+totals in one write). Most problems are at the Chrome
boundary in `context.js` / `worker.js`, and in states the UI cannot distinguish.

Status after resync: M5 and M8 fixed, M3 partially fixed. Open, in priority
order: M1 (popup pauses tracking), M2 (hung tab stalls the queue), M4 (corrupted
storage fails forever), M9 (event storms), M6/M7 (UI empty state, `NaN`), M10, M11.

---

## 1. Mistakes

Ranked by user impact. `file:line` points at the current code.

### M1. The popup pauses tracking, so "Tracking example.com" is unreachable from the popup
`src/background/context.js:25` returns `null` whenever the page probe reports
`focused: false`. Opening the action popup moves focus off the page, so every
5-second poll from the popup sees an unfocused page and settles the cursor.
Consequences:
- The popup's status line almost always reads "Ready · waiting for a focused website" even while you are on a site. The one state the popup exists to show is never shown there.
- Time spent with the popup open is not counted.
- Typing in the omnibox, using Find (Ctrl/Cmd+F), or focusing DevTools also stops counting. Reading a page while the find bar is open is a normal activity.

The guard exists for Arc split view, which the README itself says is unverified.
An unverified guard is causing verified breakage.

**Fix (recommended, smallest):** delete the `page?.focused === false` check and the
`focused` field from the probe until Arc testing proves a split-view problem.
Keep `document.fullscreenElement`.
**Fix (if the guard must stay):** have the popup send `{ type: 'snapshot', ui: 'popup' }`;
the worker keeps an in-memory `uiOpenUntil = now + 6000` and `readContext` ignores
`focused: false` while `now < uiOpenUntil`. Omnibox / find-bar loss remains.

### M2. One hung tab stalls all tracking and every UI command
`src/background/context.js:19` awaits `tabs.sendMessage` with no timeout, inside the
serialized queue (`tracker.js:36`). A page whose main thread is busy (infinite
loop, "Page unresponsive" dialog) never answers. Every later alarm, tab event and
popup request queues behind it. The popup shows "Connecting to tracker…" forever
and the badge never updates. *Plausible* (needs a real hung tab to reproduce).

**Fix:**
```js
const probe = api.tabs.sendMessage(tab.id, { type: 'probe' }, { frameId: 0 });
const timeout = new Promise(resolve => setTimeout(resolve, 500, null));
page = await Promise.race([probe, timeout]).catch(() => null);
```

### M3. Chrome API rejections in `readContext` skip settlement and show a false storage error — PARTIALLY FIXED
`src/background/tracker.js:17` calls `readContext` before `transition`, so any
rejection aborts the run before the cursor is settled. `worker.js:11-14` then
reports a storage failure that did not happen, and once the cursor passes 90 s
that time is discarded.

The resync added `context.js:6-10`: `getLastFocused` rejections whose message
matches `/no .*window/i` now return `null`, with tests in `context.test.js` and
`tracker.test.js` ("closing the last window …"). Still open:
- `tabs.query` and `idle.queryState` rejections propagate.
- The fix keys on Chrome's error *text*. Chrome's message today is "No last-focused window"; a wording change silently reopens the bug and the test would still pass because it uses the same guessed string.

**Fix (remaining):** replace the regex with a blanket rule in `tracker.js`:
`const context = await readContext(api).catch(() => null);`
An unreadable context means "not eligible", not "failure". Keep the two new tests;
they pass unchanged with the blanket catch, and drop the text matching.

### M4. Corrupted or partial storage makes the extension fail forever
Verified with probes: a saved value of `{ version: 1 }` or one with `recent: null`
throws `TypeError` inside `transition`. `tracker.js:14` only checks `version`.
Every run throws, the badge stays `!`, and the message tells the user to check
"available storage". The version-mismatch path has the same misleading message.

**Fix:**
```js
const valid = saved?.version === 1 && saved.days && typeof saved.days === 'object' && Array.isArray(saved.recent);
let state = valid ? saved : createState();
```
Optionally stash the bad blob under `tracker_backup` before replacing it. Give the
version-mismatch error its own text so a future migration bug is diagnosable.

### M5. The full tracking history was sent back to every web page's content script — FIXED
`worker.js:35` now replies `{ ok }` only, and `worker.test.js:37` asserts it.
Previously the reply carried the whole `state`. The worker calls
`setAccessLevel('TRUSTED_CONTEXTS')` because Chrome exposes `storage.local` to
content scripts by default, so the leak contradicted that intent. Nothing left
to do here beyond an optional micro-optimisation: `void refresh(); return false;`
avoids holding the channel open at all.

### M6. Wrong empty state for older days
`state.recent` is capped at 200 segments across all days (`engine.js:55`). A heavy
tab switcher fills that in an hour. Selecting yesterday then shows totals in the
summary but "Your recent focused sessions will appear here." in the activity
panel, which reads as a bug.

**Fix:** in `renderActivity`, when the day has totals but no segments, say
"Detailed sessions for this day are no longer kept (last 200 only)."
Or cap per day instead of globally.

### M7. `duration()` renders `NaNh NaNm`
Verified: `duration(NaN)` and `duration(undefined)` return `NaNh NaNm`. Reachable
whenever a stored total is missing or malformed (see M4).
**Fix:** `if (!Number.isFinite(ms)) return '0s';`

### M8. Dashboard left open across midnight could not select today — FIXED
`app.js:43-48` now recomputes bounds from `dateRange()` on every render and
advances the selection when it was on "today". `date-range.test.js` covers the
pure part. The advance/clamp logic itself (`wasToday`, the two clamps) lives in
DOM code and is untested; if it ever grows, move it into `summary.js` as
`nextSelection(current, previousMax, range)` and test it there. Not worth it at
three lines.

### M9. Event storms
- `worker.js:20-22` refreshes on `status === 'complete'` for every tab, including background tabs. Session restore with 50 tabs queues 50 storage read/write cycles plus 50 probes. Use the third listener argument: `if (tab.active && (change.url || change.status === 'complete'))`.
- `worker.js:26` `onBoundsChanged` fires continuously while a window is dragged or resized; each event is a full storage round trip. Debounce ~250 ms, or compare `window.state` and refresh only when it changes.

### M10. Checkpoint alarm depends on an unrelated call succeeding
`worker.js:45-52`: if `setAccessLevel` rejects for any reason, `initialize()`
aborts before creating the alarm and before the first refresh. Without the 30 s
alarm the 90 s gap rule discards every long single-site session. Chrome docs list
`setAccessLevel` on `storage.local` since Chrome 102, so this should not trigger
on Chrome 120+, but the coupling buys nothing.
**Fix:** create the alarm first, wrap `setAccessLevel` in its own `try`.

### M11. Small correctness nits
- `tracker.js:21` `paused: !state.paused` is sent from a possibly stale snapshot; popup and dashboard open together can flip twice. A `toggle` command or an `expected` field fixes it. Low priority.
- `tracker.js:24` `String(command.label)` turns a non-string into `"[object Object]"`. Only extension pages can send it, so cosmetic. `typeof label === 'string' ? label : ''`.
- `hostname()` (`engine.js:11`): `a.com.` (trailing dot) is a separate bucket from `a.com`; ports are dropped so `localhost:3000` and `localhost:8080` merge; IDN hosts display as punycode (`xn--mnchen-3ya.de`). Strip the trailing dot; the rest is a product call.
- `app.js:8` the brand link on the dashboard opens another dashboard tab (`target="_blank"`). Drop the target when `!document.body.classList.contains('popup')`.
- `manifest.json` has no `icons`; the toolbar shows a generic placeholder.
- `app.js:85` "Label saved" never clears.

---

## 2. Scope for improvement

Ordered by value per line of code.

1. **Return a reason, not `null`, from `readContext`** (see section 5). Unlocks every missing UI state with one field.
2. **Fullscreen video should not idle out.** `design.md` deliberately says fullscreen does not bypass idle. That is defensible, but fullscreen video is the main reason the fullscreen metric exists, and it currently stops counting after 60 s of no input. Minimal change in `readContext`: query idle after the probe, and accept `idle === 'idle'` (never `'locked'`) when `page.fullscreen === true`. Add a test.
3. **Surface silent undercounting.** Gaps over 90 s and restart discards are invisible. Accumulate `state.discardedMs` per day in `transition` and show "Xm not counted (sleep or delayed checkpoint)" when non-zero. Two lines in the engine, one in the UI.
4. **Badge shows today's total** (`setBadgeText` with `1h 12m` shortened to `1h`) instead of empty. Makes the popup optional for the common question.
5. **Dark mode.** `styles.css` pins `color-scheme: light`. A `@media (prefers-color-scheme: dark)` block redefining the five custom properties covers it.
6. **Debounce/filter events** (M9) before adding features; it is the cheapest performance win.
7. **Keyboard shortcut for pause** via the `commands` manifest key and `chrome.commands.onCommand`, calling the same `pause` command.
8. **Extend the worker boundary test.** `worker.test.js` (added in the resync) covers authorization, the private `page-state` reply, alarm creation and cursor settlement. Still missing: the failure path (`setBadgeText('!')` and the `ok: false` reply when storage throws), and the `onUpdated` filter once M9 is fixed.

Skip for now (YAGNI, no evidence of need): a migration framework beyond the
version check, per-site favicons, sync across profiles.

---

## 3. Edge cases the code already handles (credit where due)

Verified by the existing tests or by probes in this review.

| Case | Where | Note |
| --- | --- | --- |
| Interval allocated exactly once across site switches | `engine.js:22-49`, `engine.test.js:8` | |
| Fullscreen as a subset of total, never additive | `engine.js:38` | |
| Local midnight split, including DST-length days | `engine.js:28` | Uses local `Date` constructor, so 23/25-hour days are right |
| Backwards clock and gaps over 90 s discard rather than inflate | `engine.js:24` | Boundary: exactly 90 000 ms counts, 90 001 does not, matching "exceeding 90 seconds" |
| Browser restart discards stale cursor via session token | `tracker.js:8-16` | Covers shutdown shorter than 90 s too |
| Cursor and totals persisted in one write | `tracker.js:31` | No double count after worker suspension |
| Concurrent events serialized | `tracker.js:34-40` | Queue survives a rejected run |
| Storage write failure is recoverable and visible | `worker.js:11-14` | Badge `!`, UI alert |
| Hostnames `__proto__` and `constructor` as object keys | `engine.js:31-36` | Verified through a JSON round trip, both directions |
| `www.` stripped, credentials/path/query dropped, non-HTTP(S) rejected | `engine.js:11-19` | |
| Incognito tab rejected even though manifest disallows incognito | `context.js:14` | Defensive |
| Missing content script falls back to window fullscreen only | `context.js:18-22` | |
| Content script survives extension reload | `fullscreen.js:6-7` | try/catch around a dead `chrome.runtime` |
| Message authorization by sender id and extension URL prefix | `worker.js:33-40` | |
| Label trimmed and bounded to 60 chars, survives clear | `tracker.js:24-27` | |
| Retention by calendar day and by segment count | `engine.js:51-55` | |
| Pause while a site is active settles first | `tracker.js:20-23` | Second `transition` is a zero-length no-op |
| UI renders all site data with `textContent` | `components.js` | No HTML injection surface |
| Not-loaded-as-extension error in the UI | `app.js:60` | |

---

## 4. Cases that are missing

### Accounting / tracking
| Case | Current behaviour | Why it matters |
| --- | --- | --- |
| Hung active tab | Queue stalls (M2) | Everything stops silently |
| Chrome API rejection while reading context | Run fails, false storage error (M3) | Time lost, wrong diagnosis |
| Corrupted storage | Fails forever (M4) | Reinstall is the only exit |
| Fullscreen video with no input > 60 s | Stops counting | Main fullscreen use case |
| Picture-in-Picture while another app is focused | Not counted | Arguably attention; at least a separate metric |
| Audio playing in an unfocused tab | Not counted | Could be a "background media" metric |
| Popup open / omnibox / find bar / DevTools focus | Not counted (M1) | Normal browsing |
| Discarded gaps (> 90 s) and restart discards | Silent | User sees undercount with no explanation |
| Dashboard open over midnight | Stale date bounds (M8) | |
| Timezone change | New buckets only, old days not rebucketed | Documented, acceptable |
| Trailing-dot hostname, ports, IDN | Separate/merged/punycode (M11) | Minor |
| Multiple `active` tabs per window (Arc split view, Chrome side-by-side) | Unknown; `tabs.query` takes `[tab]` only | Needs real Arc test; see M1 |

### UI states the user cannot distinguish
All of these render as "Ready · waiting for a focused website":

- window not focused
- system idle (60 s)
- screen locked
- active tab is not a website (`chrome://`, new tab, extension page, PDF viewer without script)
- page probe says unfocused
- no window at all

Also invisible: content script missing on the current tab (fullscreen detection
silently degraded until the tab is refreshed); gap discarded; first run vs a day
with no data (same empty text).

### Features commonly expected from a time tracker
Not bugs; listed so the gap is explicit.

- Export (JSON/CSV) and import
- Ignore list for domains (banking, internal tools)
- Per-hour distribution for a day
- Week / range view
- Daily limit per site with a notification
- Badge showing today's total
- Keyboard shortcut for pause
- Dark mode
- Configurable idle threshold and retention
- Icons in the manifest

---

## 5. How to enable the missing states

The single highest-leverage change: make eligibility return *why*, then thread
that one field through.

### 5.1 `readContext` returns a reason

```js
// context.js
export async function readContext(api) {
  let window, idle;
  try { [window, idle] = await Promise.all([api.windows.getLastFocused(), api.idle.queryState(60)]); }
  catch { return { reason: 'no-window' }; }
  if (!window.focused || window.state === 'minimized') return { reason: 'unfocused' };
  if (idle === 'locked') return { reason: 'locked' };
  const [tab] = await api.tabs.query({ active: true, windowId: window.id }).catch(() => []);
  if (!tab || tab.incognito) return { reason: 'unfocused' };
  const domain = hostname(tab.url);
  if (!domain) return { reason: 'non-web' };
  const page = await Promise.race([
    api.tabs.sendMessage(tab.id, { type: 'probe' }, { frameId: 0 }),
    new Promise(resolve => setTimeout(resolve, 500, undefined)),
  ]).catch(() => undefined);
  const fullscreen = window.state === 'fullscreen' || page?.fullscreen === true;
  if (idle === 'idle' && !fullscreen) return { reason: 'idle' };
  return { domain, tabId: tab.id, fullscreen, probe: page === undefined ? 'missing' : 'ok' };
}
```

`tracker.js` then does `const observed = await readContext(api); const context = observed.domain ? observed : null; state.reason = observed.reason ?? null; state.probe = observed.probe ?? null;`.
The engine is unchanged. `reason` and `probe` ride along in the persisted state
(two short strings) so the popup gets them for free from `snapshot`.

Adjust `context.test.js` expectations from `null` to `{ reason: ... }`, and add a
test per reason; that is the only churn.

### 5.2 UI status text from `reason`

```js
const STATUS = {
  unfocused: 'Paused · browser not focused',
  idle: 'Paused · no input for 60s',
  locked: 'Paused · screen locked',
  'non-web': 'Not tracking · this tab is not a website',
  'no-window': 'Paused · no browser window',
};
$('#status').textContent = state.paused ? 'Tracking paused'
  : state.active ? `Tracking ${state.active.domain}${state.active.fullscreen ? ' · Fullscreen' : ''}`
  : STATUS[state.reason] ?? 'Ready · waiting for a focused website';
```

Add one line under the status when `state.probe === 'missing'`:
"Fullscreen detection unavailable on this tab until it is refreshed."

### 5.3 Discarded time

```js
// engine.js, inside transition, before the `if (previous && ...)`
if (previous && now - previous.since > 90000) {
  (state.days[dayKey(previous.since)] ??= {});
  state.discarded = (state.discarded ?? 0) + (now - previous.since);
}
```

Show `duration(state.discarded)` as "not counted since last checkpoint" when
non-zero; reset it on `clear`. If per-day accuracy matters, store it under
`days[day].__discarded` instead. Add a test: a 5-minute gap yields
`discarded === 300000` and no site time.

### 5.4 Fullscreen video keeps counting while idle
Already in 5.1: `idle === 'idle' && !fullscreen`. `locked` still stops. Update
`design.md` and the README sentence "Fullscreen does not bypass idle detection".
Test: `idle: 'idle'` with `sendMessage → { fullscreen: true }` returns a context.

### 5.5 Popup no longer pauses tracking
Delete the `focused` guard (M1, recommended). If keeping it, the popup sends
`ui: 'popup'` and the worker holds `uiOpenUntil` in memory; `readContext` gets
`ignorePageFocus` as a second argument.

### 5.6 Badge with today's total
In `worker.js` `refresh`, after a successful run:
```js
const total = summarize(state.days[dayKey(Date.now())]).totalMs;
await chrome.action.setBadgeText({ text: state.paused ? 'Ⅱ' : total >= 3600000 ? `${Math.floor(total / 3600000)}h` : total >= 60000 ? `${Math.floor(total / 60000)}m` : '' });
```
`summary.js` and `engine.js` are already DOM-free, so the worker can import them.

### 5.7 Export
One button in the dashboard: `URL.createObjectURL(new Blob([JSON.stringify(state.days)], { type: 'application/json' }))` on an `<a download>`. No new permission. CSV is a 5-line `map/join` if wanted.

### 5.8 Ignore list
`state.ignored = ['bank.example']` set by a `label`-style command; in
`tracker.js`, `if (context && state.ignored?.includes(context.domain)) context = null` with `reason = 'ignored'`. Existing history is untouched, which should be stated in the UI.

### 5.9 Everything else
- **Dark mode:** a `prefers-color-scheme: dark` block redefining `--ink`, `--muted`, `--green`, `--line`, `--paper`, plus the hard-coded `white` / `#eaf0e4` backgrounds moved to variables.
- **Keyboard shortcut:** `"commands": { "toggle-pause": { "suggested_key": { "default": "Alt+Shift+P" }, "description": "Pause or resume tracking" } }` and `chrome.commands.onCommand.addListener(() => refresh({ type: 'pause', paused: !current.paused }))`, where `current` is the last state returned by `refresh`.
- **Per-hour breakdown:** `recent` already has `start`/`end`; bucket by `new Date(start).getHours()` in `summary.js`. Only covers the retained 200 segments, so pair it with per-day segment caps or accept "recent only".

---

## 6. Test review and gaps

### 6.1 Review of the tests added in the resync

| Test | Verdict | Notes |
| --- | --- | --- |
| `worker.test.js` "keeps notification replies private and authorizes dashboard commands" | Good | Real boundary test: imports the actual worker against a captured-listener fake, proves `page-state` gets `{ ok }` only, foreign `sender.id` and content-script `clear` are rejected, the alarm is 0.5 min, and a focus event settles a stored cursor. One test doing six things is fine at this size. Uses the real clock (`Date.now() - 1000`, asserts `>= 1000`), which is stable. Only the happy path: no assertion on the `!` badge or `ok: false` when `storage.local.set` throws. |
| `date-range.test.js` | Good | Two hand-picked instants either side of midnight. Depends on machine timezone only through local `Date`, same as the engine tests. |
| `context.test.js` "closing the last window yields no eligible website" | Weak | Passes because the fake throws the same guessed message the regex expects. It cannot catch a Chrome wording change or a `tabs.query` rejection. Becomes robust for free once M3 uses a blanket catch. |
| `tracker.test.js` "closing the last window excludes the gap before opening another" | Good | Verifies the accounting consequence (10 s counted, 30 s gap excluded), which is the thing users care about. Same text-coupling caveat as above. |

### 6.2 Still missing

Existing tests are well chosen (hand-calculated intervals, external fake at the
API boundary). Missing:

- `worker.js` failure path: `setBadgeText('!')` and `{ ok: false }` when `tracker.run` rejects; unknown message type from a UI page returns `false`.
- `readContext` when `tabs.query` rejects, when `getLastFocused` rejects with a different message (M3), and when `sendMessage` never resolves (M2).
- `tracker.js` with corrupted saved state and with `version: 2` (M4).
- `transition` across a DST change day (spring forward and fall back) to lock in the midnight arithmetic.
- `recent` merging across a checkpoint but *not* across a focus gap (verified manually here: focus loss and regain yields two segments).
- `duration` with `NaN` / `undefined` (M7).
- `pause` with `paused: 'yes'` or missing is treated as `false`.
- Content script `probe` response shape. A 10-line `document`/`chrome` stub is enough.
- `summarize` with `undefined` (default parameter) and with a site whose `fullscreenMs > totalMs` (should never happen; a regression guard).

---

## 7. What was run for this review

```sh
npm test        # 24 passed, 0 failed (20 on the first pass; 4 added in the resync)
npm run check   # manifest entry points exist; syntax OK
```

Resync delta (files changed between passes): `worker.js` (private `page-state`
reply), `context.js` (zero-window catch), `app.js` + `summary.js` (`dateRange`,
bounds recomputed per render), new `tests/worker.test.js`,
`tests/date-range.test.js`, one new test each in `context.test.js` and
`tracker.test.js`. `engine.js`, `tracker.js`, `fullscreen.js`, `components.js`
are unchanged, so M1, M2, M4, M6, M7, M9, M10 and M11 stand as written.

Probes executed against the engine and summary modules (not committed):
hostname edge cases, JSON round trip of `__proto__` / `constructor` keys, corrupted
state shapes, `duration(NaN)`, 90 000 vs 90 001 ms gap boundary, segment merging
after focus regain, `paused` with an eligible context.

Not verified here and requiring an interactive browser: M2 (hung tab), M3
(zero-window `getLastFocused`), popup focus behaviour on Arc, Arc split view.

---

## 8. Response by Codex

### Requested feature removal

**by Codex:** Removed clear-history and profile-label controls from both the
dashboard and popup, removed their message commands and handlers, and removed
their unused styles. Pause/resume remains. Existing recorded history is not
deleted by this change; automatic 30-day retention remains. Old stored labels
are inert and no longer rendered or editable.

### Mistake dispositions

| Item | by Codex |
| --- | --- |
| M1 | Fixed for a sole active tab: popup/omnibox page-focus loss no longer pauses it. Disagree with deleting the focus signal entirely: the user explicitly requires unfocused panes not to count. When Chrome/Arc reports multiple active tabs, select a positively focused pane instead of blindly taking the first. If none is positively focused, pause conservatively. Arc's actual API reporting still needs interactive verification. |
| M2 | Accepted. All browser-context calls now have bounded waits; a missing/hung content-script probe falls back after 500ms. Timers are cleared when calls finish. Added an unresolved-promise regression; other context calls also cannot indefinitely block this queue. |
| M3 | Accepted, with a reason-preserving implementation. Context failures now return unavailable/ineligible and permit normal settlement; no error-message regex is required. UI says browser context is unavailable instead of claiming storage is full. Tests cover failures in window, idle and tab queries. |
| M4 | Accepted corruption handling, **disagree with silently resetting unknown versions**. Full version-1 shapes are validated, including totals, segments and cursor. Malformed snapshots are backed up as `tracker_backup` in the same storage write as recovery, and the UI shows a warning. Unknown integer versions stay untouched with an actionable compatibility error. If the backup/recovery write fails, the original remains; recovery is not falsely reported as successful. |
| M5 | Already fixed; retained acknowledgement-only replies. Inactive content-script notifications are now acknowledged without a tracking write. |
| M6 | Accepted. A day with totals but no retained activity now explains the global 200-session retention instead of promising sessions will appear later. |
| M7 | Accepted. Non-finite/undefined duration inputs render `0s`; malformed stored totals are rejected at the storage boundary. |
| M8 | Already fixed; retained range refresh and selection behavior. |
| M9 | Accepted. Background tab load notifications no longer trigger refreshes. Same-state window resize/drag notifications are ignored; transitions between normal/fullscreen/minimized still refresh. Background content-script notifications are filtered too. Tests verify bounded write counts. |
| M10 | Accepted. Alarm creation happens independently before access-level configuration, and a rejected access-level call is logged without preventing initial refresh. A worker regression exercises the failure. This is degradation, not a claim that trusted-context storage restriction succeeded on that browser. |
| M11: stale pause | Replaced UI read/negate/write with a queued `toggle` command. Each toggle uses the current persisted value; a concurrent-toggle test verifies it. The original claim that two identical explicit pause requests necessarily "flip twice" is inaccurate—explicit assignments are idempotent—but stale UI intent is a valid concern. |
| M11: label coercion/status | Removed with the requested profile-tagging feature. |
| M11: hostnames | Strip trailing DNS dot. Keep hostname-level grouping without ports, and ASCII IDN display; these are consistent with the declared hostname grouping and avoid unnecessary product changes. |
| M11: brand link | Dashboard brand navigation stays in the same tab; popup can still open the full dashboard. |
| M11: icons | Deferred cosmetic suggestion. A branded toolbar icon is not required for tracking correctness; the generic icon remains for this MVP. |

### Scope and technical disagreements

**by Codex — accepted:** Added distinct status reasons and a missing page-probe
notice. The reason for an arbitrary browser API failure is `unavailable`, not
`no-window`: an idle API rejection does not prove there are no windows. Expanded
worker tests cover removed/unknown/foreign commands, failure reply and error badge,
access-level setup failure, and background-load/resize filtering.

**by Codex — not changing fullscreen idle policy:** Being fullscreen alone does
not prove video is playing or being watched. Bypassing idle for every fullscreen
page/window would count unattended pages. Keep the documented 60-second idle
policy, including video, until a separate media policy is agreed. The current
limitation remains clearly documented.

**by Codex — not adding discardedMs as proposed:** An unobserved gap is not known
active browsing time. Labeling all sleep/closed-browser time as "not counted"
would imply more knowledge than the tracker has. A `days[day].__discarded` number
would also violate the existing domain-to-totals map and summary contract. Keep
the documented accuracy limitation rather than mix diagnostic data with sites.

**by Codex — deferred optional features:** Export/import, ignore lists, badges
with totals, shortcuts, dark mode, ranges, limits and hourly breakdowns are
feature ideas rather than defects. They are outside this lean review-fix pass.
Background audio and Picture-in-Picture in an unfocused app are intentionally
not counted because the user asked not to count unfocused tabs. No migration
framework, sync service, or extra runtime dependency was added.

### Verification by Codex

- `npm test`: 30 passing tests, zero failures.
- `npm run check`: syntax and manifest entry-point checks pass.
- Browser smoke uses an isolated Chrome for Testing profile and a local website;
  its assertions cover focused and DOM-fullscreen time, tracking state after
  `action.openPopup()`, dashboard/popup rendering, persisted pause, and absence of
  the removed controls. Native popup targets are not exposed as ordinary pages
  by this headless browser; the test checks its tracking effect via saved state.
- Real unresponsive renderer behavior, native popup visuals, Arc profiles/Spaces,
  physical multiple screens, OS lock/sleep and browser-window fullscreen remain
  interactive acceptance checks. The timeout unit test proves an unresolved
  promise cannot block forever, not every possible browser-hang behavior.
