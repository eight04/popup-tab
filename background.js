/* eslint-env webextensions */

const windows = (function () {
	const windowList = new Map;
	let handleFocusChange;
	let lastFocusedNormalWindow;
	
	const initialize = browser.windows
		.getAll({windowTypes: ["normal", "popup"]})
		.then(ws => {
			ws.forEach(addWindow);
			return ws.find(w => w.focused);
		});

	browser.windows.onFocusChanged.addListener(windowId => {
		var w = windowList.get(windowId);
		if (!w) return;
		if (w.type === "normal") {
			lastFocusedNormalWindow = w;
		}
		if (handleFocusChange) {
			handleFocusChange(w);
		}
	});

	browser.windows.onRemoved.addListener(removeWindow);
	browser.windows.onCreated.addListener(addWindow);
		
	function addWindow(w) {
		windowList.set(w.id, w);
		if (w.focused && w.type === "normal") {
			lastFocusedNormalWindow = w;
		}
	}
	
	function removeWindow(windowId) {
		windowList.delete(windowId);
		if (lastFocusedNormalWindow.id === windowId) {
			lastFocusedNormalWindow = null;
		}
	}
	
	function onFocusChange(cb) {
		handleFocusChange = cb;
	}
	
	function getLastFocusedNormalWindow() {
		return lastFocusedNormalWindow || Array.from(windowList.values()).find(w => w.type === "normal");
	}
	
	return {
		onFocusChange,
		getLastFocusedNormalWindow,
		has: k => windowList.has(k),
		ready: () => initialize
	};
})();

const popups = (function () {
	const popups = new Map;
	
	browser.windows.onRemoved.addListener(windowId => {
		popups.delete(windowId);
	});
	
	function _create(opt, setup) {
		browser.windows.create(Object.assign({
			type: "popup",
			state: "maximized"
		}, opt)).then(w => {
			popups.set(w.id, w);
			setup(w);
		});
	}
	
	function create(tab) {
		// popup tab
		_create({tabId: tab.id}, w => {
			w.parent = tab.windowId;
			w.index = tab.index;
		});
	}
	
	function createFromURL(parentTab, url) {
		_create({url}, w => {
			const parentPopup = popups.get(parentTab.windowId);
			if (parentPopup) {
				w.parent = parentPopup.parent;
				w.index = parentPopup.index;
			} else {
				w.parent = parentTab.windowId;
				w.index = parentTab.index + 1;
			}
		});
	}
	
	function merge(tab) {
		let parent;
		let index;
		
		const w = popups.get(tab.windowId);
		if (w && windows.has(w.parent)) {
			parent = w.parent;
			index = w.index;
		} else {
			parent = windows.getLastFocusedNormalWindow().id;
			index = -1;
		}
		
		if (!parent) {
			return toNormalWindow(tab);
		}
		
		browser.windows.create({
			tabId: tab.id,
			left: 9999
		}).then(() => {
			// move tab to window
			browser.tabs.move(tab.id, {
				windowId: parent,
				index
			});
			// FIXME: the temp window is automatically closed in Firefox 54, do we have to close it manually?
		});
	}
	
	function toNormalWindow(tab) {
		browser.windows.create({tabId: tab.id});
	}
	
	return {create, merge, toNormalWindow, createFromURL};
})();

browser.contextMenus.create({
	title: "Open Link in Popup",
	contexts: ["link"],
	onclick(info, tab) {
		popups.createFromURL(tab, info.linkUrl);
	}
});

const TAB_MENU = tryCreateTabMenu();

function dynamicMenus(createMenus) {
	const menus = [];
	
	function create() {
		if (!menus.length) {
			for (const id of createMenus()) {
				menus.push(id);
			}
		}
	}
	
	function destroy() {
		menus.forEach(id => browser.contextMenus.remove(id));
		menus.length = 0;
	}
	
	return {create, destroy};
}

const normalMenus = dynamicMenus(function *() {
	if (!TAB_MENU) {
		yield createPopupMenu();
	}
});

const popupMenus = dynamicMenus(function *() {
	yield createMergeMenu();
	yield createToNormalMenu();
});

windows.onFocusChange(updateContextMenu);
windows.ready(updateContextMenu);

function updateContextMenu(w) {
	if (!w) return;
	if (w.type === "normal") {
		popupMenus.destroy();
		normalMenus.create();
	} else if (w.type === "popup") {
		popupMenus.create();
		normalMenus.destroy();
	}
}

// create context menu on tab bar
// tab context menu only works on Firefox 53+
function tryCreateTabMenu() {
	try {
		return createPopupMenu(["tab"]);
	} catch (err) {
		// do nothing
	}
}

// create "Popup this tab" context menu
function createPopupMenu(contexts = ["page"]) {
	return browser.contextMenus.create({
		title: "Popup This Tab",
		contexts,
		onclick(info, tab) {
			popups.create(tab);
		}
	});
}

// create "Merge popup" context menu
function createMergeMenu() {
	return browser.contextMenus.create({
		title: "Merge Popup",
		contexts: ["page"],
		onclick(info, tab) {
			popups.merge(tab);
		}
	});
}

function createToNormalMenu() {
	return browser.contextMenus.create({
		title: "Convert Popup into Normal Window",
		contexts: ["page"],
		onclick(info, tab) {
			popups.toNormalWindow(tab);
		}
	});
}
