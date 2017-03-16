/* eslint-env webextensions, browser */
var {windows, contextMenus, tabs} = browser;

var windowList = new Map;

var CONTEXT_ID;

// create context menu on tab bar
contextMenus.create({
	title: "Popup this tab",
	contexts: ["tab"],
	onclick(info, tab) {
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
});

// handle "Merge popup" ccontext menu, should only show if it is a popup window
windows.onFocusChanged.addListener(windowId => {
	var window = windowList.get(windowId);
	if (!window) return;
	
	if (window.type == "popup" && CONTEXT_ID == null) {
		CONTEXT_ID = createContextMenu();
	} else if (window.type != "popup" && CONTEXT_ID != null) {
		contextMenus.remove(CONTEXT_ID);
		CONTEXT_ID = null;
	}
	
	window.lastFocus = performance.now();
});

// create "Merge popup" context menu
function createContextMenu() {
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
