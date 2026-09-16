# Chrome Web Store privacy tab answers

Paste each block into the matching field. Every answer is under the 1,000
character limit and describes only what the shipped code does.

## Single purpose description

```
MinuteTrail has one purpose: to measure how much time the user spends on each website while that website is the focused, foreground tab, and to show those totals back to the user on this device. It records the hostname of the focused site, the seconds it stayed focused, and whether the page was in fullscreen. The results appear in the toolbar popup and a local dashboard as daily totals, a ranked website list, and recent sessions for the last 30 days. Nothing is sent anywhere. There are no accounts, no servers, no analytics, no sync, and no content reading. Every permission below exists solely to detect which site is focused and when the user is away.
```

## tabs justification

```
The "tabs" permission is required to read the URL of the active tab in the focused window so its hostname can be identified and timed. Without it, tab.url is undefined and the extension cannot know which website is in the foreground. Only the hostname is kept (www. is stripped; path, query string, fragment, credentials, and page title are discarded before storage). The extension also listens to tabs.onActivated, onUpdated, onRemoved, and onReplaced so it can stop the timer for the previous site and start it for the new one the moment the user switches. It never opens, closes, moves, or modifies tabs, and never reads tabs in unfocused windows.
```

## storage justification

```
"storage" keeps the user's time totals, recent sessions, pause setting, and an optional profile label in chrome.storage.local so they survive service-worker suspension and browser restarts. It also uses chrome.storage.session for a per-browser-session token that prevents time from being attributed while the browser was closed. All data remains on the device; there is no chrome.storage.sync usage and no upload. Access is restricted to trusted extension contexts via setAccessLevel. The user can delete everything with the Clear history button.
```

## idle justification

```
"idle" is required to stop counting when the user is not actually present. The extension calls idle.queryState and listens to idle.onStateChanged so that time stops accruing when the system reports "idle" (60 seconds without input) or "locked" (screen locked). Without this permission the timer would keep running while the user walks away with a website open, making the totals wrong. Only the three idle states are read; no input events are captured.
```

## alarms justification

```
"alarms" schedules a 30-second checkpoint that saves elapsed time to local storage while the Manifest V3 service worker would otherwise be suspended. Without it, long sessions on a single website would be lost or under-counted because no tab event fires while the user stays on one page. The alarm only triggers the internal accounting routine; it does not open pages, show notifications, or contact any server.
```

## Host permission justification

```
The content script on http://*/* and https://*/* exists only to report two booleans about the current page: whether document.hasFocus() is true and whether document.fullscreenElement is set. This lets the extension detect fullscreen video and avoid counting a page that is visible but not focused (for example in a split view). Broad host access is needed because the user may visit any website and fullscreen can happen on any of them. The script does not read the DOM, page text, forms, cookies, URLs, or titles, does not inject UI, and does not modify pages. It sends nothing except the message "page-state" with no payload to the extension's own background worker. It is 18 lines long and can be inspected in src/content/fullscreen.js.
```

## Are you using remote code?

Select **No, I am not using remote code**. The screenshot shows "Yes" selected;
change it. The package contains no external scripts, no fetch calls, no eval,
and no dynamic imports. The manifest CSP is `script-src 'self'; object-src 'none'`.
With "No" selected the justification box disappears. If the form still shows it:

```
Not applicable. All JavaScript ships inside the package. The manifest content security policy is script-src 'self', so external scripts cannot load, and the code contains no eval, Function constructor, remote import, or fetch.
```

## Data usage

Tick exactly one data type:

| Data type | Tick | Why |
| --- | --- | --- |
| Personally identifiable information | No | No name, email, or ID is ever read |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | Form fields and cookies are never read |
| Personal communications | No | |
| Location | No | No IP, region, or geolocation |
| **Web history** | **Yes** | Hostnames of focused sites plus time spent, stored locally only. This is the honest category even though titles and full URLs are discarded |
| User activity | No | Idle detection uses Chrome's idle API, not click, scroll, or keystroke capture. The content script reports focus and fullscreen booleans, not activity |
| Website content | No | The DOM is never read |

Tick all three certifications. Each is true: no data leaves the device, so
nothing is sold or transferred, nothing is used outside the single purpose, and
nothing relates to creditworthiness.

**Privacy policy URL**: required because Web history is collected. Host the
"Permissions and privacy" section of the README as a public page (a GitHub Pages
or Gist link is enough) and paste its URL.
