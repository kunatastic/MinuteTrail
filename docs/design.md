# Browser Tracker MVP

Approved scope: a local Chrome extension that measures focused website time,
tab/window changes and fullscreen usage, with a dashboard and no backend.

## Boundaries

- `src/tracking/engine.js`: browser-independent accounting and retention.
- `src/background/context.js`: translate Chrome state into a tracking context.
- `src/background/worker.js`: serialize events and persist one state snapshot.
- `src/content/fullscreen.js`: report DOM fullscreen state; no page content read.
- `src/ui/`: shared dashboard/popup with small rendering components.

Use Manifest V3, native ES modules, and Node's built-in test runner. No runtime
dependencies, build tooling, accounts, telemetry, or remote resources.

## Tracking contract

Only HTTP(S) sites in the focused, non-incognito Chrome window count. Group by
hostname (strip `www.`; retain other subdomains). Store no paths, page titles,
query strings, or page content. Pause on loss of focus, lock, or 60 seconds of
system inactivity. Fullscreen is a subset of total time, never extra time.
Fullscreen does not bypass idle detection, so passive video watching can pause.

Settle elapsed intervals on events and 30-second alarm checkpoints. Persist the
active cursor with totals in one local-storage value; a session-storage token
prevents attributing browser-closed time after restart. Discard gaps longer than
90 seconds conservatively because alarms can be delayed during sleep. This can
undercount when Chrome throttles the worker. Split intervals at local midnight.
Retain 30 calendar days of totals and at most 200 recent activity segments.

Arc is an additional target. Each profile installs the extension separately and
keeps its own local history. No cross-profile aggregation or manual labeling.
Focused window and active-tab selection control counting across screens. When
multiple active panes are reported, page focus must identify one eligible pane.
A sole active tab remains eligible while its popup or omnibox has focus.

## Interface and controls

Toolbar popup and full dashboard share components: status, daily summary,
ranked website list, recent activity, date selection, and pause/resume. Clear
history and profile tagging are removed at the user's request. Empty, pruned
activity, context-unavailable and storage-error states must be explicit.

## Verification

Unit tests exercise exact time allocation, focus loss, fullscreen, midnight,
restart, sleep gaps, retention, URL filtering and browser-context selection.
An integration test drives the worker through a fake Chrome API at the external
boundary. Manually verify installation, tab/window switching, DOM and browser
fullscreen, idle/lock, browser restart and persisted history in Chrome.
