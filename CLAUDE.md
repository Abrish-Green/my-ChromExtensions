# CLAUDE.md: My Toolbox

Instructions for Claude (or any developer) to rebuild, change, or extend this project. Read this fully before editing. `README.md` has the user-facing documentation.

## What this project is

A personal, free Chrome extension (Manifest V3, plain JavaScript, no build step, no dependencies). Its one job: **a per-tab switch that closes a tab automatically after a countdown.**

### The requirement (from the owner)

1. The owner opens a tab.
2. The extension gives an **On/Off** setting.
3. If **On**, that tab counts down for 1 hour (adjustable, default 60 minutes) and closes automatically.
4. If **Off**, do nothing.
5. **A newly opened tab must always start Off.** The setting must never carry over from another tab. (An earlier global-switch design was a bug for this reason.)
6. The popup shows the **time left** until the tab closes when On, the On/Off switch, and the minutes box with a **Save** button next to it. Nothing else.
7. Saving a new minutes value **while a countdown is running** must change that countdown: it restarts with the new length.

Owner preferences: free to build and run, for personal use, loaded unpacked, minimal UI.

## Hard constraints

- Manifest V3. Plain HTML, CSS, JS. No bundler, no npm, no frameworks, no CDN scripts.
- Permissions: only `storage` and `alarms`. Do not add `tabs`, `activeTab`, `scripting`, `host_permissions` or any other permission unless a new feature truly needs it, and say so in the README.
- No network requests, no analytics, no reading page content, URLs or titles.
- Icons must be original artwork (see "Icons"). Do not copy stock logos or third-party artwork.
- Use `textContent`, never `innerHTML`, when inserting any dynamic text.

## Files to create

```
my-toolbox-project/
├── README.md
├── CLAUDE.md
├── tools/make_icon.py
└── my-toolbox/
    ├── manifest.json
    ├── background.js
    ├── popup.html
    ├── popup.css
    ├── popup.js
    └── icons/icon16.png, icon32.png, icon48.png, icon128.png
```

## Architecture and data model

- **Popup** controls the tab that was active when it opened (`chrome.tabs.query({ active: true, currentWindow: true })`; only the tab `id` is used, which needs no permission).
- **Background service worker** owns all state. The popup only sends messages and re-renders.
- **Message protocol** (popup to background, via `chrome.runtime.sendMessage`, background replies `{ ok: true }` and returns `true` from the listener to keep the channel open):
  - `{ type: "schedule", tabId: <number>, when: <epoch ms> }`
  - `{ type: "cancel", tabId: <number> }`
- **Pending countdowns:** `chrome.storage.session` key `closers` = `{ "<tabId>": { when: <epoch ms> } }`. Session storage is used on purpose: it clears on browser restart, and tab IDs are only valid for one session.
- **Alarms:** one per tab, named `close-<tabId>`, created with `chrome.alarms.create(name, { when })`.
- **Setting:** `chrome.storage.local` key `autoMinutes` (number 1..1440, default 60). It is the length used when a tab is switched On. Saving it also restarts the current tab's countdown if one is running.
- **UI state is derived:** the switch is On if and only if `closers[currentTab.id]` exists. Never store a separate "enabled" flag. That is what keeps new tabs Off.

## Rebuild steps

### 1. `manifest.json`

- `manifest_version: 3`, name `My Toolbox`, version `0.5.1`, short description.
- `icons` and `action.default_icon` map 16, 32, 48, 128 to `icons/iconNN.png`.
- `permissions: ["storage", "alarms"]`.
- `action`: `default_title`, `default_popup: "popup.html"`.
- `background: { "service_worker": "background.js" }` (no `type: module` needed).
- `commands._execute_action` with `suggested_key.default = "Alt+Shift+T"`.

### 2. `background.js`

Implement, in this order:

1. `getClosers()` reads `chrome.storage.session.get("closers")` (default `{}`); `setClosers(obj)` writes it.
2. A **serial queue**: `let queue = Promise.resolve(); function serial(fn) { const r = queue.then(fn); queue = r.catch(() => {}); return r; }`. Every read-modify-write of `closers` goes through it.
3. `addCloser(tabId, when)`: inside `serial`, set `closers[tabId] = { when }`, save, then `chrome.alarms.create("close-" + tabId, { when })`.
4. `dropCloser(tabId)`: inside `serial`, delete the entry if present and save, then `chrome.alarms.clear("close-" + tabId)`.
5. `closeTab(tabId)`: `chrome.tabs.get`, then `chrome.tabs.query({ windowId })`. If that window has only one tab, `chrome.tabs.create({ windowId })` first so the window survives. Then `chrome.tabs.remove(tabId)`. Wrap in try/catch (the tab may already be gone).
6. `chrome.alarms.onAlarm`: ignore names not starting with `close-`. Inside `serial`, if `closers[tabId]` is missing, return (stale alarm). Otherwise delete the entry, save, then `closeTab`.
7. `chrome.tabs.onRemoved`: call `dropCloser(tabId)`.
8. `chrome.runtime.onMessage`: handle `schedule` and `cancel` as in the protocol above.
9. `chrome.runtime.onInstalled`: `chrome.storage.local.remove(["closers", "autoClose"])` to clean up leftovers from old versions.

Never keep countdown state in a top-level variable. The service worker can be stopped at any time.

### 3. `popup.html` and `popup.css`

Markup, top to bottom:

- `<header>` with `#timeLeft` (class `time-left off`, text `--:--`) and `#timeLabel`.
- `.auto` box (`#autoBox`) with two rows. Row 1: a switch (`label.switch` > `input#autoToggle[type=checkbox]` + `span.slider`) and a text block (`strong` title + `span#autoState`). Row 2: a label, `input#autoMinutes[type=number min=1 max=1440 value=60]`, a `min` label, and `button#saveMinutes` (Save).
- `<script src="popup.js">` at the end. No inline scripts (extension pages block them).

CSS: body width 320px; large tabular-number countdown (about 48px) that fades when `.off`; green accent (`#2e9e5b`) when `.auto.on`; CSS-only toggle switch; `color-scheme: light dark`.

### 4. `popup.js`

State: `currentTab`, `autoMinutes = 60`, `closers = {}`.

- `init()`: get the active tab; load `autoMinutes` from local storage; load `closers` from session storage; call `renderAuto()`; start `setInterval(renderCountdown, 1000)`.
- `renderCountdown()`: if the current tab has an entry, show `formatRemaining(when - Date.now())` (`m:ss`, or `h:mm:ss` when an hour or more) and the label "until this tab closes"; else show `--:--`, add the `off` class, and the label "Auto-close is off for this tab".
- `renderAuto()`: set the checkbox and `.on` class from the entry, set `#autoState` to `On: closes at <HH:MM:SS>` or `Off: this tab stays open`, set the minutes input unless it is focused, then call `renderCountdown()`.
- Toggle `change`: On reads the minutes box (validate 1..1440; if invalid, revert the switch and show a message), saves the value if it changed, and sends `schedule` with `when = Date.now() + minutes * 60000`; Off sends `cancel`. Do not update the UI here; wait for the storage listener.
- Save button click (and Enter in the minutes box): round, validate 1..1440 (revert and show a message if invalid), save to `chrome.storage.local`. If the current tab has a running countdown, send `schedule` again with `when = Date.now() + minutes * 60000` (the background overwrites the entry and recreates the same-named alarm) and show "Countdown restarted". Otherwise show "Saved".
- `flash(msg)`: show a message in `#autoState` for about 2.5 seconds, then `renderAuto()`. `renderAuto()` must not overwrite the message while it is showing (track a `flashUntil` timestamp), because the storage change event can arrive after the flash is set.
- `chrome.storage.onChanged` (area `session`, key `closers`): update `closers` and `renderAuto()`.

### 5. Icons

Run `python3 tools/make_icon.py my-toolbox/icons` (needs `pip install pillow`). It draws a white clock on a navy tile with a green countdown arc at 1024px and downsamples to 16, 32, 48, 128. Keep the design original. If the owner supplies their own logo, resize it to those four PNG sizes and replace the files. Do not reproduce any third-party stock logo.

### 6. Check and package

```bash
node --check my-toolbox/popup.js
node --check my-toolbox/background.js
python3 -c "import json; json.load(open('my-toolbox/manifest.json'))"
# every $("#id") used in popup.js must exist as id="..." in popup.html
zip -r my-toolbox.zip my-toolbox
```

Then run the test checklist in `README.md` in a real Chrome (set minutes to 1 to test quickly). Syntax checks do not prove the extension works.

## Pitfalls (learned the hard way)

- **Global switch = bug.** A global On flag made every new tab inherit the old setting. Keep the switch per tab and derived from `closers`.
- **Service worker memory is not reliable.** Keep state in storage; use alarms, not `setTimeout`, for the countdown.
- **Use session storage for `closers`.** Tab IDs are reused after a restart. Always ignore alarms whose tab has no entry.
- **Serialize writes** to `closers`, or simultaneous changes can lose data.
- **Minutes are saved only by the Save button** (or Enter). An edit made while a countdown runs takes effect when saved, by restarting that countdown. An unsaved value is lost when the popup closes. Switching On uses the valid value currently in the box.
- **Last tab in a window:** open a blank tab before closing, or Chrome may quit.
- **Extension reload clears countdowns.** Expected. Tell the owner when handing over updates.
- **File pickers close extension popups** on some systems. Relevant only if a file-upload feature is ever added: open that screen in a full tab instead.
- Chrome alarms can fire a few seconds late. Do not promise second-level accuracy.

## Do and don't

- Do keep the UI to the countdown and the switch unless the owner asks for more.
- Do bump `version` in `manifest.json` and add a row to the README changelog for every change.
- Do tell the owner which steps they must do (reload the extension, accept new permissions).
- Don't add a global enable flag, a build step, external libraries, or extra permissions.
- Don't delete the owner's stored data (older versions saved `notes` and `files` in `chrome.storage.local`) without asking.

## If features are restored later

- **Notes:** `chrome.storage.local.notes` is a string.
- **Stored files:** `chrome.storage.local.files` is an array of `{ name, content, added }`. Add `unlimitedStorage` only if large files are expected.
- **Badge countdown:** use `chrome.action.setBadgeText({ tabId, text })` from the background, refreshed by a periodic alarm (30 seconds or more).
- **Exempt audible tabs or allowlisted sites:** needs the `tabs` permission to read `audible` / URL. Document the added permission warning.
- **Warning notification before closing:** needs the `notifications` permission and a second alarm per tab.

## Version history

0.1 starter (notes, page tools), 0.2 clock/files/timer, 0.3 global switch (bug), 0.3.1 icon, 0.4 per-tab switch, 0.5 minimal popup with time-left display, 0.5.1 Save button (saving while running restarts the countdown). Details are in the README changelog.
