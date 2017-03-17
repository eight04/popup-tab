/* eslint-env webextensions, browser */
var {windows, contextMenus, tabs} = browser;

var windowList = new Map;

var MERGE_CONTEXT, POPUP_CONTEXT, TAB_CONTEXT;

try {
	// tab context menu only works on Firefox 53+
	TAB_CONTEXT = createTabMenu();
} catch (err) {
	TAB_CONTEXT = false;
}


function createTabMenu() {
	// create context menu on tab bar
	return contextMenus.create({
		title: "Popup this tab",
		contexts: ["tab"],
		onclick(info, tab) {
			createPopup(tab);
		}
	});
}

function createPopup(tab) {
	var windowInfo = {
		parent: tab.windowId,
		index: tab.index
	};
	// popup tab
	windows.create({
		tabId: tab.id,
		type: "popup"
	}).then(window => {
		addWindowInfo(window);
		Object.assign(windowList.get(window.id), windowInfo);
	});
}

// handle "Merge popup" ccontext menu, should only show if it is a popup window
windows.onFocusChanged.addListener(windowId => {
	var window = windowList.get(windowId);
	if (!window) return;
	
	if (window.type == "popup" && MERGE_CONTEXT == null) {
		MERGE_CONTEXT = createMergeContext();
	} else if (window.type != "popup" && MERGE_CONTEXT != null) {
		contextMenus.remove(MERGE_CONTEXT);
		MERGE_CONTEXT = null;
	}
	
	if (!TAB_CONTEXT) {
		if (window.type == "normal" && POPUP_CONTEXT == null) {
			POPUP_CONTEXT = createPopupContext();
		} else if (window.type != "normal" && POPUP_CONTEXT != null) {
			contextMenus.remove(POPUP_CONTEXT);
			POPUP_CONTEXT = null;
		}
	}
	
	window.lastFocus = performance.now();
});

// create "Popup this tab" context menu
function createPopupContext() {
	return contextMenus.create({
		title: "Popup this tab",
		onclick(info, tab) {
			createPopup(tab);
		}
	});
}

// create "Merge popup" context menu
function createMergeContext() {
	return contextMenus.create({
		title: "Merge popup",
		onclick(info, tab) {
			mergePopup(tab.id, tab.windowId);
		}
	});
}

// merge popup back to normal window
function mergePopup(tabId, windowId) {
	var window = windowList.get(windowId);
	
	if (window.type != "popup") {
		return;
	}
	
	Promise.resolve()
		.then(() => {
			// use parent id
			if (window.parent != null && windowList.has(window.parent)) {
				return window;
			}
			// use last focused
			var found;
			for (var w of windowList.values()) {
				if (w.type == "normal" && (!found || w.lastFocus > found.lastFocus)) {
					found = w;
				}
			}
			if (found) {
				return {
					parent: found.id,
					index: -1
				};
			}
		})
		// merge popup
		.then(target => {
			// create a temp window, can't move popup back to normal window directly
			return windows.create({
				tabId: tabId,
				left: 9999
			}).then(() => {
				var pendings = [];
				pendings.push(windows.remove(window.id));
				if (target) {
					// move tab to window
					pendings.push(tabs.move(tabId, {
						windowId: target.parent,
						index: target.index
					}));
				} else {
					// create a new window
					pendings.push(windows.create({
						tabId: tabId
					}));
				}
				// FIXME: the temp window is automatically closed in Firefox 54, do we have to close it manually?
				return Promise.all(pendings);
			}).catch(console.error);
		});
}

windows.onRemoved.addListener(windowId => {
	windowList.delete(windowId);
});

windows.onCreated.addListener(addWindowInfo);

windows.getAll({
	windowTypes: ["normal", "popup"]
}).then(windowInfos => {
	for (var windowInfo of windowInfos) {
		addWindowInfo(windowInfo);
	}
});

function addWindowInfo(window) {
	if (windowList.has(window.id)) return;
	windowList.set(window.id, {
		id: window.id,
		type: window.type,
		parent: null,
		lastFocus: 0,
		index: -1
	});
}
