/* eslint-env webextensions */
import {getLastFocusedWindow} from "./window-manager.js";

const popups = new Map;

browser.windows.onRemoved.addListener(windowId => {
  popups.delete(windowId);
});

trackPopupSize();

function getOrigin(url) {
  const match = url.match(/^[^:]+:(\/{2,3})?[^/]+/);
  if (!match) {
    console.warn(`cannot find origin for ${url}`);
    return;
  }
  return match[0];
}

async function trackPopupSize() {
  for (const [windowId, info] of popups.entries()) {
    if (!info.origin) continue;
    
    const {width, height} = await browser.windows.get(windowId);
    await browser.storage.local.set({
      [`popup/size/${info.origin}`]: {width, height}
    });
  }
  setTimeout(trackPopupSize, 60 * 1000);
}

async function createWindow(options) {
  let origin;
  if (options.url) {
    origin = getOrigin(options.url);
    if (origin) {
      const key = `popup/size/${origin}`;
      const result = await browser.storage.local.get(key);
      if (result[key]) {
        ({
          width: options.width,
          height: options.height
        } = result[key]);
      }
    }
  }
  if (options.tabId) {
    delete options.url;
  }
  options.type = "popup";
  const info = await browser.windows.create(options);
  info.origin = origin;
  popups.set(info.id, info);
  return info;
}

export async function createPopup(tab) {
  // popup tab
  const info = await createWindow({
    tabId: tab.id,
    url: tab.url
  });
  info.parent = tab.windowId;
  info.index = tab.index;
}

export async function createPopupFromURL(parentTab, url) {
  const info = await createWindow({url});
  const parentPopup = popups.get(parentTab.windowId);
  if (parentPopup) {
    info.parent = parentPopup.parent;
    info.index = parentPopup.index;
  } else {
    info.parent = parentTab.windowId;
    info.index = parentTab.index + 1;
  }
}

async function moveTab(tabId, windowId, index) {
  // using windows.create allows us to move popup tab to a normal window
  await browser.windows.create({
    tabId,
    left: 9999
  });
  const options = {windowId};
  if (index != null) {
    options.index = index;
  }
  const [tab] = await browser.tabs.move(tabId, options);
  await Promise.all([
    browser.windows.update(tab.windowId, {focused: true}),
    browser.tabs.update(tab.id, {active: true})
  ]);
}

export async function mergePopup(tab) {
  const info = popups.get(tab.windowId);
  try {
    await moveTab(tab.id, info.parent, info.index);
  } catch (err) {
    const win = getLastFocusedWindow();
    if (win) {
      await moveTab(tab.id, win.id);
    } else {
      await browser.windows.create({tabId: tab.id});
    }
  }
  try {
    // Firefox 52 doesn't close window correctly
    await browser.windows.remove(tab.windowId);
  } catch (err) {
    // pass
  }
}
