// Annotated — Background service worker (Manifest V3)
// Opens the side panel when the toolbar action is clicked, and acts as a
// message hub between content scripts and the sidepanel UI.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Annotated] installed");
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[Annotated] sidePanel error", err));
});

// Cache the latest page metadata + text selection per tab so the sidepanel
// can request it on open even if events fired before it loaded.
const tabState = new Map();

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
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const active = tabs[0];
      if (!active?.id) return sendResponse({ pageMeta: null, selection: null });
      const cached = tabState.get(active.id) ?? {};
      // If we don't have meta yet, ask the content script for it.
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
    });
    return true; // async response
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

// When the active tab changes, push fresh meta to the sidepanel.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  const cached = tabState.get(tabId);
  if (cached?.pageMeta) {
    chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: cached.pageMeta }).catch(() => {});
  }
});
