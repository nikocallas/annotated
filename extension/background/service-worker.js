// Annotated — Background service worker (Manifest V3)
// Opens the side panel when the toolbar action is clicked, and acts as a
// message hub between content scripts and the sidepanel UI.
//
// Host access: this extension uses `activeTab` + `scripting` instead of broad
// host_permissions. The content script is injected programmatically into the
// current tab only after a user gesture (toolbar action click), which is the
// model Chrome treats as least-privilege.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Annotated] installed");
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[Annotated] sidePanel error", err));
});

// Cache the latest page metadata + text selection per tab so the sidepanel
// can request it on open even if events fired before it loaded.
const tabState = new Map();

// Track which tabs we've already injected the content script into during this
// service-worker lifetime so we don't double-inject on repeated user gestures.
const injectedTabs = new Set();

async function ensureContentScript(tabId) {
  if (injectedTabs.has(tabId)) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["content/content-script.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: false },
      files: ["content/content-style.css"],
    }).catch(() => {});
    injectedTabs.add(tabId);
    return true;
  } catch (err) {
    // Common cases: chrome:// pages, the Chrome Web Store, PDF viewers — these
    // are off-limits even with activeTab. Fail soft; sidepanel falls back to
    // tab.url/title from the tabs API.
    return false;
  }
}

// User gesture: toolbar action click. Side panel opens via setPanelBehavior;
// we use the same gesture to inject the content script under activeTab.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id != null) ensureContentScript(tab.id);
});

// If the user invokes the extension and the sidepanel asks for state, that
// request itself rides on the prior user gesture — try to inject then too.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  if (message?.type === "PAGE_META" && tabId != null) {
    tabState.set(tabId, { ...(tabState.get(tabId) ?? {}), pageMeta: message.data });
    chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: message.data }).catch(() => {});
  }

  if (message?.type === "TEXT_SELECTED" && tabId != null) {
    tabState.set(tabId, { ...(tabState.get(tabId) ?? {}), selection: message.data });
    chrome.runtime
      .sendMessage({ type: "TEXT_SELECTION_UPDATE", data: message.data })
      .catch(() => {});
  }

  // Sidepanel asking for current state of the active tab.
  if (message?.type === "GET_ACTIVE_TAB_STATE") {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const active = tabs[0];
      if (!active?.id) return sendResponse({ pageMeta: null, selection: null });

      // Try to inject (no-op if already injected). With activeTab this is
      // permitted because the user just invoked the action that opened the
      // sidepanel.
      await ensureContentScript(active.id);

      const cached = tabState.get(active.id) ?? {};
      if (!cached.pageMeta) {
        chrome.tabs
          .sendMessage(active.id, { type: "REQUEST_PAGE_META" })
          .catch(() => {});
      }
      sendResponse({
        pageMeta: cached.pageMeta ?? {
          url: active.url ?? "",
          title: active.title ?? "",
          sourceType: detectSourceTypeFromUrl(active.url ?? ""),
        },
        selection: cached.selection ?? null,
      });
    })();
    return true; // async response
  }

  // Sidepanel can explicitly ask us to (re)inject for the current tab — used
  // when the user clicks "capture selection" after navigating.
  if (message?.type === "INJECT_ACTIVE_TAB") {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const active = tabs[0];
      const ok = active?.id != null ? await ensureContentScript(active.id) : false;
      sendResponse({ ok });
    })();
    return true;
  }
});

function detectSourceTypeFromUrl(url) {
  if (!url) return "unknown";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) return "youtube";
  } catch {}
  return "unknown";
}

// When a tab navigates or closes, drop our injection bookkeeping for it — a
// new document needs a fresh injection on the next user gesture.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") injectedTabs.delete(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  tabState.delete(tabId);
});

// When the active tab changes, push fresh meta to the sidepanel.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  const cached = tabState.get(tabId);
  if (cached?.pageMeta) {
    chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: cached.pageMeta }).catch(() => {});
  }
});
