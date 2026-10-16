const $ = (s) => document.querySelector(s);

// The switch belongs to the tab you opened the popup on. It is On only if
// that tab has a countdown running, so every new tab starts Off.
let currentTab = null;
let autoMinutes = 60;
let closers = {};
let flashTimer;
let flashUntil = 0;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const currentEntry = () => (currentTab ? closers[currentTab.id] : undefined);

function describeMinutes(m) {
  return m % 60 === 0 ? `${m / 60} h` : `${m} min`;
}

function clockText(ms) {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Minutes currently typed in the box, or null if invalid.
function readMinutes() {
  const mins = Math.round(Number($("#autoMinutes").value));
  return mins >= 1 && mins <= 1440 ? mins : null;
}

// (Re)start this tab's countdown for the given number of minutes.
function scheduleClose(mins) {
  return chrome.runtime.sendMessage({
    type: "schedule",
    tabId: currentTab.id,
    when: Date.now() + mins * 60_000,
  });
}

// Time left to close, shown big at the top.
function renderCountdown() {
  const entry = currentEntry();
  $("#timeLeft").classList.toggle("off", !entry);
  if (entry) {
    $("#timeLeft").textContent = formatRemaining(entry.when - Date.now());
    $("#timeLabel").textContent = "until this tab closes";
  } else {
    $("#timeLeft").textContent = "--:--";
    $("#timeLabel").textContent = "Auto-close is off for this tab";
  }
}

function renderAuto() {
  const entry = currentEntry();
  $("#autoToggle").checked = Boolean(entry);
  $("#autoBox").classList.toggle("on", Boolean(entry));
  if (document.activeElement !== $("#autoMinutes")) $("#autoMinutes").value = autoMinutes;
  // Don't overwrite a feedback message while it is showing.
  if (Date.now() >= flashUntil) {
    $("#autoState").textContent = entry
      ? `On: closes at ${clockText(entry.when)}`
      : "Off: this tab stays open";
  }
  renderCountdown();
}

// Short feedback message in the switch box, then back to the normal text.
function flash(msg) {
  flashUntil = Date.now() + 2500;
  $("#autoState").textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(renderAuto, 2600);
}

$("#autoToggle").addEventListener("change", async (e) => {
  if (!currentTab) {
    e.target.checked = false;
    return flash("No active tab found");
  }
  if (e.target.checked) {
    // Use the value in the box, even if it was not saved yet.
    const mins = readMinutes();
    if (mins === null) {
      e.target.checked = false;
      $("#autoMinutes").value = autoMinutes;
      return flash("Enter 1 to 1440 minutes");
    }
    if (mins !== autoMinutes) {
      autoMinutes = mins;
      await chrome.storage.local.set({ autoMinutes });
    }
    await scheduleClose(mins);
  } else {
    await chrome.runtime.sendMessage({ type: "cancel", tabId: currentTab.id });
  }
  // The display updates when the background saves the change (storage listener below).
});

// Save the countdown length. If this tab's countdown is running,
// restart it with the new length so the change takes effect right away.
async function saveMinutes() {
  const mins = readMinutes();
  if (mins === null) {
    $("#autoMinutes").value = autoMinutes;
    return flash("Enter 1 to 1440 minutes");
  }
  autoMinutes = mins;
  $("#autoMinutes").value = mins;
  await chrome.storage.local.set({ autoMinutes });
  if (currentTab && currentEntry()) {
    flash(`Saved. Countdown restarted: ${describeMinutes(mins)}`);
    await scheduleClose(mins);
  } else {
    flash(`Saved: ${describeMinutes(mins)} for the next tab you switch On`);
  }
}

$("#saveMinutes").addEventListener("click", saveMinutes);
$("#autoMinutes").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveMinutes();
});

// Refresh when the background saves or clears a countdown.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.closers) {
    closers = changes.closers.newValue || {};
    renderAuto();
  }
});

async function init() {
  currentTab = await activeTab();
  const { autoMinutes: saved } = await chrome.storage.local.get("autoMinutes");
  if (saved >= 1) autoMinutes = saved;
  ({ closers = {} } = await chrome.storage.session.get("closers"));
  renderAuto();
  setInterval(renderCountdown, 1000);
}
init();
