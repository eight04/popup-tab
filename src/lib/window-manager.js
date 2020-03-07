/* eslint-env webextensions, browser */
import EventLite from "event-lite";

export const events = new EventLite;

const windowList = new Map;

browser.windows.getAll({windowTypes: ["normal", "popup"]}).then(ws => {
  ws.forEach(addWindow);
  events.emit("ready");
});

browser.windows.onFocusChanged.addListener(windowId => {
  const win = windowList.get(windowId);
  if (!win) return;
  
  win.lastActive = performance.now();
  events.emit("focusChanged");
});

browser.windows.onRemoved.addListener(removeWindow);
browser.windows.onCreated.addListener(addWindow);
  
function addWindow(win) {
  windowList.set(win.id, win);
  win.lastActive = performance.now();
}

function removeWindow(windowId) {
  windowList.delete(windowId);
}

export function getLastFocusedWindow(includePopup = false) {
  let result;
  for (const win of windowList.values()) {
    if (!includePopup && win.type === "popup") {
      continue;
    }
    if (!result || result.lastActive < win.lastActive) {
      result = win;
    }
  }
  return result;
}

export function isCurrentWindowPopup() {
  const win = getLastFocusedWindow(true);
  return win && win.type === "popup";
}
