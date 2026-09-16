# Browser Tracker Implementation Plan

**Goal:** Deliver the approved local-only, componentized extension MVP.
**Architecture:** Pure time accounting, Chrome adapter, serialized persistence,
and shared native DOM UI components.
**Tech Stack:** Manifest V3, JavaScript ES modules, CSS, Node test runner.
**Spec:** `docs/design.md`

## Global constraints

No third-party runtime dependencies or build step. Local data only. Chrome 120+.
Retain 30 days and 200 recent segments; idle after 60 seconds; checkpoint every
30 seconds; discard unobserved gaps over 90 seconds.

## Tasks

- [x] Write `tests/engine.test.js` with hand-calculated intervals; run
  `node --test` to establish missing implementation; implement
  `createState()`, `transition(state, context, now)`, and `dayKey(now)` in
  `src/tracking/engine.js`; repeat until accounting tests pass.
- [x] Test `readContext(api)` with focused, unfocused, private, idle and
  fullscreen contexts in `tests/context.test.js`. Implement Chrome adapter,
  session-aware repository, event queue, fullscreen probe and manifest.
  Exercise worker messages and persisted results with an external API fake.
- [x] Build shared summary/site/activity renderers and popup/dashboard shell.
  Use textContent for website values, accessible controls, empty/error states.
- [x] Document install steps, module ownership, permissions, limitations and
  manual acceptance checks in README. Run `npm test`, syntax/manifest checks
  and available browser verification. Report any unverified browser behavior.

Implementation proceeds inline in this empty project under the user's approval.
No existing git repository or unrelated files need isolation.
