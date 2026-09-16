# MVP review and verification

Reviewed on 2026-09-08. This folder has no Git repository; the review covered the
current source files against `docs/design.md`, README, and the user's requests.

## Review findings addressed

1. **Last window closed:** Chrome can reject `getLastFocused` with a missing-window
   error. This previously left an active cursor and could count the windowless
   gap. The context adapter now treats that condition as no eligible website.
   Two regressions cover missing-window selection and reopening within 90 seconds.
2. **Overnight date picker:** Bounds were set only on page load. Rendering now
   refreshes the 30-day range and follows today across midnight when today was
   selected. Historical selections remain selected while inside retention.
3. **Notification privacy:** Content scripts previously received the complete
   history snapshot in response to a page-state notification. They now receive
   only `{ ok }`. This was unnecessary exposure to content-script contexts, not
   evidence of a website JavaScript data leak.
4. **Worker boundary tests:** Added coverage for content-script command rejection,
   foreign sender rejection, trusted UI commands, notification reply privacy,
   checkpoint setup, and focus-event settlement through the actual worker module.

Independent review found the module boundaries appropriate for a lean MVP; no
additional framework or generalized abstraction was needed.

## Automated evidence

- Latest verification commands and review dispositions are recorded in `review.md`.
- `npm run check`: all JavaScript syntax and manifest entry-point checks pass.
- Optional headless Chrome for Testing smoke: focused website time, DOM
  fullscreen time, dashboard loading, pause state, and popup loading. Later
  review removed clear-history and profile-label controls. This uses a disposable browser
  profile and local test page, not the user's browsing data.

The optional runner is `scripts/browser-smoke.js`. Supply an installed Playwright
`index.mjs` path and a Chrome for Testing executable path as its two arguments.
The runtime extension and normal test suite do not depend on Playwright. Temporary
smoke profiles and screenshots are retained under the operating system temp folder.

## Still requires interactive acceptance

Arc profile/Space/split-view switching, focus across physical monitors and separate
browser applications, browser-window fullscreen, actual OS idle/lock/sleep, and
real browser shutdown/restart must be checked with the README checklist. Headless
Chrome and fake API tests do not establish these desktop-specific behaviors.

## Explicit MVP trade-offs

- Each Chrome/Arc profile has separate totals; there is no combined dashboard.
- No input for 60 seconds pauses tracking, including passive reading or video.
- Long unobserved gaps are discarded, potentially undercounting throttled sessions.
- No keystroke/content tracking or desktop-app tracking.

These are documented design choices, not fixed bugs or verified assumptions about
the user's preferred future behavior.
