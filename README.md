# My Toolbox

A small personal Chrome extension that closes a tab automatically after a countdown.

Open a tab, click the extension icon, flip the switch **On**, and that tab closes when the time runs out (60 minutes by default). New tabs always start **Off**, so nothing closes unless you ask it to.

- **Version:** 0.5.1
- **Platform:** Chrome (Manifest V3), also works in Edge and other Chromium browsers
- **Cost:** free. No account, no server, no build step, no dependencies
- **Use:** loaded unpacked for personal use (not published to the Chrome Web Store)

---

## What it does

| You do | The extension does |
| --- | --- |
| Open the popup on a tab and switch **On** | Starts a countdown for that tab only. The popup shows the time left and the exact closing time. |
| Switch **Off** | Cancels that tab's countdown. The tab stays open. |
| Open a new tab | Nothing. The switch is Off for every new tab. |
| Change the minutes box (1 to 1440) and click **Save** | Saves it as the countdown length. If this tab's countdown is running, it restarts with the new length right away. |
| Press `Alt+Shift+T` | Opens the popup (same as clicking the icon). |
| Do nothing while a countdown runs | At zero, the tab closes. |

The countdown is shown at the top of the popup while the popup is open. When the switch is Off it shows a faded `--:--`.

---

## Install (unpacked)

1. Unzip the project. The extension is the `my-toolbox` folder inside it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `my-toolbox` folder (the one that contains `manifest.json`).
4. Click the puzzle-piece icon in the toolbar and pin **My Toolbox**.

After you edit any file, click the reload icon on the extension's card in `chrome://extensions`.

---

## Using it

1. Open the tab you want closed and click the My Toolbox icon.
2. (Optional) Set the minutes and click **Save** (or press **Enter**). The status text confirms "Saved".
3. Flip the switch **On**. The big number counts down to zero.
4. To keep the tab after all, open the popup on that tab again and flip the switch **Off**.
5. To change the time while a countdown is running, type a new value and click **Save**. The countdown restarts from now with the new length (for example, saving 90 means 90 minutes left from that moment).

The popup always controls the tab you were on when you clicked the icon.

---

## How it works

```
 popup.js  --- message {schedule | cancel, tabId, when} --->  background.js (service worker)
    |                                                              |
    |  reads                                                       |  writes
    v                                                              v
 chrome.storage.session  "closers": { <tabId>: { when } }   +   chrome.alarms "close-<tabId>"
                                                                   |
                                            alarm fires at `when`  v
                                        background.js closes the tab
```

- **Popup** (`popup.html`, `popup.css`, `popup.js`) shows the switch and countdown. It never creates alarms itself. It sends a message to the background worker and re-renders when storage changes.
- **Background service worker** (`background.js`) owns all countdown state. It creates and clears alarms, keeps the list of pending closes, and closes the tab when an alarm fires.
- **State lives in storage, not in memory.** A Manifest V3 service worker is stopped and restarted by Chrome at any time, so nothing important is kept in variables.
- **Pending closes use `chrome.storage.session`.** It is cleared when the browser restarts. That is intentional: tab IDs are only valid for one browser session, so an old ID could point at a different tab later.
- **Changes are serialized.** Every write to the pending list goes through a one-at-a-time queue so two changes can never overwrite each other.
- **Stale alarms are ignored.** When an alarm fires, the worker closes the tab only if it still has an entry in the pending list.
- **Last tab in a window.** Closing it would close the window (or Chrome). The worker opens a blank tab first, then closes the old one.

---

## Project layout

```
my-toolbox-project/
├── README.md              this file
├── CLAUDE.md              guide for rebuilding or extending the project with Claude
├── tools/
│   └── make_icon.py       generates the toolbar icons (needs Pillow)
└── my-toolbox/            the extension: load this folder in Chrome
    ├── manifest.json      Manifest V3 config, permissions, icons, shortcut
    ├── background.js      service worker: alarms, pending list, closing tabs
    ├── popup.html         popup markup: countdown + switch + minutes box with Save button
    ├── popup.css          popup styles (light and dark mode)
    ├── popup.js           popup logic
    └── icons/             icon16.png, icon32.png, icon48.png, icon128.png
```

---

## Permissions and data

| Permission | Why it is needed |
| --- | --- |
| `storage` | Remembers the minutes setting and the pending countdowns. |
| `alarms` | Wakes the background worker at the moment a tab should close. |

There are no host permissions, no content scripts, and no network requests. The extension never reads page content, URLs, or titles, which is why Chrome does not show a "read your browsing history" warning.

**Stored data**

| Where | Key | Value |
| --- | --- | --- |
| `chrome.storage.local` | `autoMinutes` | Number, 1 to 1440. Default 60 when missing. |
| `chrome.storage.session` | `closers` | `{ "<tabId>": { "when": <epoch ms> } }` for tabs with a running countdown. |

Older versions (0.2 to 0.4) also stored `notes` and `files` in `chrome.storage.local`. The current version no longer shows them, but it does not delete them. The shapes were: `notes` is a string, `files` is an array of `{ name, content, added }`.

---

## Behavior details and limits

- **Per tab, not global.** The switch affects only the tab it was set on.
- **Saving a new length while a countdown is running restarts that tab's countdown** with the new length, counted from the moment you click Save. Other tabs are not affected.
- **Countdowns do not survive a browser restart or an extension reload.** Tab IDs change and session storage is cleared. The minutes setting is kept.
- **Timing is approximate.** Chrome alarms can fire a few seconds late. If the computer sleeps through the deadline, the tab closes shortly after it wakes.
- **Unsaved work.** A page with unsaved changes may show a "Leave site?" prompt. The tab can stay open until you answer.
- **Any tab can be scheduled,** including `chrome://` pages, because closing a tab does not need access to the page.
- **Pinned tabs and tabs playing audio are not exempt.**
- **If you close a tab yourself,** its countdown is dropped automatically.
- **Incognito:** the extension is off in incognito windows unless you allow it in the extension's details page.

---

## Testing checklist

Set the minutes box to `1` for these checks, then set it back to `60`.

1. **Install:** the extension card shows version 0.5.0 and no errors.
2. **Popup:** shows `--:--`, "Auto-close is off for this tab", the switch Off, and `60` in the box.
3. **Switch On:** the number counts down from about 1:00 and the line below the switch shows the closing time.
4. **Tab closes:** after about a minute the tab closes.
5. **New tab starts Off:** open another tab, click the icon, and the switch is Off.
6. **Switch Off cancels:** switch a tab On, then Off. The tab stays open past the deadline.
7. **Invalid minutes:** enter `0` or `5000` and click Save. The box reverts and a message appears.
   - **Change while running:** with a countdown running, enter a different value and click Save. The big number jumps to the new length and the message says the countdown restarted.
8. **Last tab in a window:** with one tab in a new window, switch On. The window stays open (a blank tab replaces it).
9. **Manual close:** switch a tab On, close it yourself, open the popup on another tab. No errors in the service worker console.

---

## Troubleshooting and debugging

- **Nothing closes:** on `chrome://extensions`, click **Service worker** on the extension's card to open its console, and look for red errors. You can inspect state there:
  - `await chrome.storage.session.get()` shows the pending countdowns.
  - `await chrome.alarms.getAll()` shows the scheduled alarms.
- **Popup looks wrong or does nothing:** right-click inside the popup and choose **Inspect** to see its console.
- **Switch shows Off after reloading the extension:** expected. Reloading clears the countdowns.
- **The minutes value did not save:** click **Save** (or press Enter in the box). A value typed but not saved is lost when the popup closes. Switching a tab On also uses whatever valid value is in the box.
- **Countdown is a few seconds off:** normal for Chrome alarms.

---

## Icon

The icon is an original design (a white clock face on a navy tile with a green countdown ring). It is generated by `tools/make_icon.py`:

```bash
pip install pillow
python3 tools/make_icon.py my-toolbox/icons
```

It writes `icon16.png`, `icon32.png`, `icon48.png` and `icon128.png`. To use your own logo instead, replace those four files with PNGs of the same sizes. Only use artwork you own or have a license for.

---

## Packaging

To share or back up the extension as a zip:

```bash
cd my-toolbox-project
zip -r my-toolbox.zip my-toolbox
```

Anyone can unzip it and load it with **Load unpacked**. To publish on the Chrome Web Store you would need a developer account (one-time $5 fee) and store listing assets.

---

## Changelog

| Version | Changes |
| --- | --- |
| 0.1.0 | Starter: notes pad, page tools (dark mode, word count, copy link), right-click "save selection". |
| 0.2.0 | Live clock, stored text files, timer to close the current tab. |
| 0.3.0 | Global On/Off switch: every new tab gets a countdown while On. |
| 0.3.1 | Original clock icon added. |
| 0.4.0 | Switch made per tab. New tabs always start Off (fixes the old setting carrying over). |
| 0.5.0 | Popup reduced to the time-left display and the switch. Removed notes, files, page tools, context menu and the extra permissions. |
| 0.5.1 | Added a Save button next to the minutes box. Saving while a countdown is running restarts it with the new length (fixes the running countdown ignoring a changed value). |

---

## Ideas for later

- Show the minutes left as a badge on the toolbar icon, so you can see it without opening the popup.
- Exempt tabs that are playing audio or video.
- Never auto-close certain sites (an allowlist).
- Notification a minute before a tab closes (needs the `notifications` permission).
- Bring back notes and stored text files as a separate screen.
