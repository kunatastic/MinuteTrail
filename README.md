# MinuteTrail

A small, local-only Chrome extension for understanding where your browsing time
goes. Native JavaScript modules, no runtime dependencies, and no build step.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**, click **Load unpacked**, and select this folder
   (the folder containing `manifest.json`).
3. Refresh existing website tabs so the fullscreen/focus content script loads.
4. Pin MinuteTrail in the extensions menu. Click it for today's overview;
   choose **Open dashboard** for history and recent sessions.

Chrome 120 or newer is required. No `npm install` is needed to use the extension.
After code changes, click Reload on the extension card and refresh website tabs.

### Arc, profiles and multiple monitors

Arc supports Chrome extensions. Open `arc://extensions` within each profile,
enable Developer mode, and load this folder. Each installation tracks its own
profile automatically; there is no manual profile tagging.

Each browser profile has its own storage: totals are **not combined across
browsers or profiles**. The extension cannot enumerate or name your other
profiles automatically. Arc's profile/Space and split-view behavior must be
checked on your Arc version using the acceptance checklist below.

Only the active tab in the **focused browser window** counts. A website visible
on a second monitor, in a background window, or in an unfocused tab does not
count. When the browser reports multiple active panes, the page-focus probe
selects a positively focused pane; ambiguous panes are not counted. Looking
at another screen without changing keyboard/window focus is not detectable.

References: [Arc extensions](https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open),
[Arc profiles](https://resources.arc.net/hc/en-us/articles/19227964556183-Profiles-Separate-Work-Personal-Browsing).

## What is measured

- Focused HTTP(S) website time, grouped by hostname; `www.` is removed but other
  subdomains stay separate.
- Browser-window fullscreen and webpage fullscreen (including fullscreen video).
  Fullscreen time is a subset of focused time, not added to it again.
- Recent focused segments, with start/end times and fullscreen status.
- Daily totals using the computer's local calendar date.

Tracking pauses when the browser loses focus, when the computer locks, after
60 seconds of system inactivity, or when you press Pause. The first 60 seconds
without input count; passive reading/video playback then pauses, even fullscreen.
Opening the dashboard switches away from the website and pauses its tracking.
Opening the toolbar popup or omnibox keeps a sole active website eligible.
This is an attention estimate, not a record
of keystrokes, clicks, page content, or activity in desktop apps.

### Accuracy and retention

Tab/window/fullscreen events settle elapsed time. A 30-second alarm checkpoints
long sessions. Cursor and totals are saved together to prevent double counting
after service-worker suspension. Browser-session tokens discard stale cursors on
restart. Browser shutdown can lose time since the last successful checkpoint.

Gaps exceeding 90 seconds are discarded to avoid charging sleep time; delayed
alarms can therefore undercount. Short sleep gaps may count until a focus/idle
event arrives. Rapid changes are sampled asynchronously through browser APIs,
so this is not a precision billing timer. Existing tabs need refreshing after
installation to detect DOM fullscreen; browser-window fullscreen still works.
Chrome-restricted sites can lack the page probe and fall back to window focus.

Totals retain the latest 30 calendar days; recent activity retains at most 200
segments, with 30 shown for the selected day. A segment is a continuous stretch
on one tab/domain/fullscreen mode. Changing system timezone affects new buckets;
historical daily totals are not rebucketed. There is no clear-history control;
automatic 30-day retention still applies.

## Code organization

| Module | Responsibility |
| --- | --- |
| `src/tracking/engine.js` | Time arithmetic, midnight splitting, retention, domain normalization |
| `src/tracking/storage-state.js` | Validate stored snapshots and prepare recoverable corruption handling |
| `src/background/context.js` | Focus, idle, private-tab and fullscreen eligibility |
| `src/background/tracker.js` | Serialized commands, session lifecycle, local persistence |
| `src/background/worker.js` | Chrome event registration, message authorization, failure badge |
| `src/content/fullscreen.js` | Page focus/fullscreen signals, without inspecting page content |
| `src/ui/summary.js` | Pure summary derivation and time formatting |
| `src/ui/components.js` | Safe DOM renderers shared by popup and dashboard |
| `src/ui/app.js` | UI shell, pause toggle, date selection and tracking status |

The background worker is the sole writer. UI and browser events enter a single
promise queue. A failed storage write is surfaced in the UI and toolbar badge;
later requests can retry. The engine takes an explicit clock, allowing tests
with hand-calculated results. Keep browser APIs outside the engine, render
website values with `textContent`, and add a regression test when changing
accounting behavior. Storage schema version is 1; future incompatible versions
must add a migration, not silently clear data. Unknown versions remain untouched
and report an actionable error. Malformed version-1 snapshots are saved under
`tracker_backup` atomically with a fresh snapshot; the UI reports this recovery.
The backup holds the latest malformed snapshot and can be inspected in extension
storage. API context reads have bounded waits and fail closed; missing page
probes fall back to browser fullscreen for a sole active tab. Status distinguishes
idle, lock, non-website tabs, ambiguous panes and unavailable browser context.

## Permissions and privacy

`tabs` reads active website URLs; only hostnames are stored. `idle` detects lock
and inactivity. `alarms` checkpoints background tracking. `storage` saves data
locally. HTTP(S) content scripts report only focus and fullscreen booleans, which
requires access to websites at install time. History storage is restricted to
trusted extension contexts. Incognito is disabled.

There is no server, telemetry, external font, favicon request or sync. URLs,
paths, queries, titles, passwords and page contents are not persisted. Records
are in Chrome's local extension storage and are not separately encrypted.

## Development and verification

Use Node 22+:

```sh
npm test
npm run check
```

Tests cover real accounting and summary functions plus the tracker using a fake
of the external Chrome API. Syntax checks verify JavaScript and manifest entry
points. No dependencies are needed for these checks.

### Manual acceptance checklist

- Visit two different sites for about 15 seconds each. Their totals should match
  the time each had focus; background tabs must not grow.
- Put browser windows on two screens. Focus one and then the other, then a
  desktop app. Only the focused website should grow; neither grows in the app.
- Repeat across Chrome, Arc, Arc profiles/Spaces, and Arc split views. Inspect
  each profile's dashboard independently for unintended overlapping time.
- Enter/exit webpage-video fullscreen and browser-window fullscreen. Verify
  fullscreen time grows only while focused and never exceeds total time.
- Leave the computer untouched for over 60 seconds and lock/unlock it. Check
  that tracking stops, then resumes on focused browsing.
- Pause/resume, restart the browser, reopen the dashboard and verify persisted
  totals. Closed-browser time must not appear.
- Choose another day and test keyboard navigation and popup layout. Confirm the
  popup still shows the focused website, and neither UI offers clear history or
  profile labeling.

These OS focus and Arc checks require real interactive browser testing; unit
tests alone cannot establish their behavior on a particular desktop setup.
