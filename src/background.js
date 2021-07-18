/* eslint-env webextensions */
import createMenus from "webext-menus";

import {createPopup, createPopupFromURL, mergePopup, savePopupSize} from "./lib/popup.js";
import {isCurrentWindowPopup, events as windowEvents} from "./lib/window-manager.js";

function isTabContextSupported() {
	let id;
	try {
		id = browser.contextMenus.create({title: "test", contexts: ["tab"]});		
    return true;
	} catch (err) {
		return false;
	} finally {
    if (id) {
      browser.contextMenus.remove(id);
    }
  }
}

const SUPPORT_TAB_CONTEXT = isTabContextSupported();

const menus = createMenus([
  {
    title: "Popup This Tab",
    contexts: SUPPORT_TAB_CONTEXT ? ["tab"] : ["page"],
    oncontext: () => SUPPORT_TAB_CONTEXT ? true : !isCurrentWindowPopup(),
    onclick(info, tab) {
      createPopup(tab);
    }
  },
  {
    title: "Open Link in Popup",
    contexts: ["link"],
    onclick(info, tab) {
      createPopupFromURL(tab, info.linkUrl);
    }
  },
  {
    title: "Merge Popup",
    contexts: ["page"],
    oncontext: isCurrentWindowPopup,
    onclick(info, tab) {
      mergePopup(tab);
    }
  },
  {
    title: "Remember window size",
    contexts: ["page"],
    oncontext: isCurrentWindowPopup,
    onclick(info, tab) {
      savePopupSize(tab).catch(console.error);
    }
  }
]);

windowEvents.on("focusChanged", menus.update);
windowEvents.on("ready", menus.update);

browser.commands.onCommand.addListener(async command => {
  if (command === "popupTab") {
    const tabs = await browser.tabs.query({currentWindow: true, active: true});
    if (!tabs.length) {
      return;
    }
    if (isCurrentWindowPopup()) {
      mergePopup(tabs[0]);
    } else {
      createPopup(tabs[0]);
    }
  }
});
