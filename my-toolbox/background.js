// Auto-close is per tab: a tab only has a countdown if you switched it on.
// New tabs never get one on their own.
//
// Pending closes live in session storage, which is cleared when the browser
// restarts. That is right because tab IDs are only valid for one session.

async function getClosers() {
  const { closers = {} } = await chrome.storage.session.get("closers");
  return closers;
}
const setClosers = (closers) => chrome.storage.session.set({ closers });

// All changes to the closers list run one at a time so they can't overwrite each other.
let queue = Promise.resolve();
function serial(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

const addCloser = (tabId, when) =>
  serial(async () => {
    const closers = await getClosers();
    closers[tabId] = { when };
    await setClosers(closers);
    await chrome.alarms.create(`close-${tabId}`, { when });
  });

const dropCloser = (tabId) =>
  serial(async () => {
    const closers = await getClosers();
    if (closers[tabId]) {
      delete closers[tabId];
      await setClosers(closers);
    }
    await chrome.alarms.clear(`close-${tabId}`);
  });

async function closeTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    // Closing the last tab of a window would close the window (or Chrome).
    // Open a blank tab first so the window survives.
    const siblings = await chrome.tabs.query({ windowId: tab.windowId });
    if (siblings.length === 1) await chrome.tabs.create({ windowId: tab.windowId });
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab is already gone.
  }
}

// Clean up leftovers from earlier versions (old global switch and timers).
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(["closers", "autoClose"]);
});

// The countdown ended: close the tab.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("close-")) return;
  const tabId = Number(alarm.name.slice("close-".length));
  serial(async () => {
    const closers = await getClosers();
    if (!closers[tabId]) return; // stale alarm from an earlier session
    delete closers[tabId];
    await setClosers(closers);
    await closeTab(tabId);
  });
});

// Tab closed by hand: forget its countdown.
chrome.tabs.onRemoved.addListener((tabId) => {
  dropCloser(tabId);
});

// Requests from the popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "schedule") {
    addCloser(msg.tabId, msg.when).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "cancel") {
    dropCloser(msg.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
});
