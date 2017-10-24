/* eslint-env webextensions */

const windows = (function () {
	const windowList = new Map;
	let handleFocusChange;
	let lastFocused;
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
		lastFocused = w;
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
		if (lastFocusedNormalWindow && lastFocusedNormalWindow.id === windowId) {
			lastFocusedNormalWindow = null;
		}
	}
	
	function onFocusChange(cb) {
		handleFocusChange = cb;
	}
	
	function getLastFocusedNormalWindow() {
		return lastFocusedNormalWindow || Array.from(windowList.values()).find(w => w.type === "normal");
	}
	
	function getLastFocused() {
		return lastFocused;
	}
	
	return {
		onFocusChange,
		getLastFocused,
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
		} else if (windows.getLastFocusedNormalWindow()) {
			parent = windows.getLastFocusedNormalWindow().id;
			index = -1;
		}
		
		// we have close the popup manually in Firefox 52
		doMerge().then(() => windows.has(tab.windowId) && browser.windows.remove(tab.windowId));
			
		function doMerge() {
			if (parent == null) {
				return browser.windows.create({tabId: tab.id});
			}
			
			return browser.windows.create({
				tabId: tab.id,
				left: 9999
			}).then(() => browser.tabs.move(tab.id, {
				windowId: parent,
				index
			})).then(([tab]) => {
				browser.windows.update(tab.windowId, {focused: true});
				browser.tabs.update(tab.id, {active: true});
			});
		}
	}
	
	return {create, merge, createFromURL};
})();

function buildContextMenu(menus) {
	const dynamicMenus = [];
	
	for (const menu of menus) {
		if (menu.oncontext) {
			dynamicMenus.push(menu);
			menu.show = false;
		} else {
			create(menu);
		}
	}
	
	function create(menu) {
		return browser.contextMenus.create({
			title: menu.title,
			contexts: menu.contexts,
			onclick: menu.onclick
		});
	}
	
	function update() {
		for (const menu of dynamicMenus) {
			const shouldShow = Boolean(menu.oncontext());
			if (menu.show === shouldShow) continue;
			
			menu.show = shouldShow;
			if (shouldShow) {
				menu.id = create(menu);
			} else {
				browser.contextMenus.remove(menu.id);
			}
		}
	}
	
	return {update};
}

function isTabContextSupported() {
	let id;
	try {
		id = browser.contextMenus.create({title: "test", contexts: ["tab"]});		
	} catch (err) {
		return false;
	}
	browser.contextMenus.remove(id);
	return true;
}

const SUPPORT_TAB_CONTEXT = isTabContextSupported();

const menus = buildContextMenu([{
	title: "Popup This Tab",
	contexts: SUPPORT_TAB_CONTEXT ? ["tab"] : ["page"],
	oncontext: SUPPORT_TAB_CONTEXT ? null : () => {
		const w = windows.getLastFocused();
		return w && w.type === "normal";
	},
	onclick(info, tab) {
		popups.create(tab);
	}
}, {
	title: "Open Link in Popup",
	contexts: ["link"],
	onclick(info, tab) {
		popups.createFromURL(tab, info.linkUrl);
	}
}, {
	title: "Merge Popup",
	contexts: ["page"],
	oncontext() {
		const w = windows.getLastFocused();
		return w && w.type === "popup";
	},
	onclick(info, tab) {
		popups.merge(tab);
	}
}]);

windows.onFocusChange(menus.update);
windows.ready(menus.update);
