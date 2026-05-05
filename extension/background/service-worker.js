// Annotated — Background service worker (Manifest V3)
// Three jobs:
//   1. Open the side panel on toolbar click
//   2. Inject the content script on demand so the side panel can read the
//      active tab's metadata + selection
//   3. Bridge audio recording requests from the side panel to an offscreen
//      document (MediaRecorder won't run inside a service worker)

const OFFSCREEN_DOC_PATH = "offscreen/offscreen.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[Annotated] sidePanel error", err));
});

// Cache of pageMeta and text selection per tab so the side panel can ask for
// state on open even if events fired before it was ready.
const tabState = new Map();
const injectedTabs = new Set();

async function ensureContentScript(tabId) {
  if (tabId == null) return false;
  if (injectedTabs.has(tabId)) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["content/content-script.js"],
    });
    await chrome.scripting
      .insertCSS({ target: { tabId, allFrames: false }, files: ["content/content-style.css"] })
      .catch(() => {});
    injectedTabs.add(tabId);
    return true;
  } catch {
    // chrome://, the Web Store, the new-tab page, PDF viewers, and any tab the
    // user hasn't activated since the SW started will reject script injection.
    // We fall back to chrome.tabs.get() metadata in that case.
    return false;
  }
}

function detectSourceTypeFromUrl(url) {
  if (!url) return "unknown";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (
      host.includes("podcasts.apple.com") ||
      host === "overcast.fm" ||
      host === "pca.st" ||
      host.includes("spotify.com")
    ) return "podcast";
    return "article";
  } catch { return "unknown"; }
}

async function buildFallbackMeta(tab) {
  if (!tab) return null;
  const url = tab.url ?? "";
  return {
    url,
    title: tab.title ?? "",
    sourceType: detectSourceTypeFromUrl(url),
    publication: hostnameFor(url),
    fallback: true,
  };
}

function hostnameFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ---------- Offscreen document lifecycle ------------------------------------

async function hasOffscreenDoc() {
  if (!chrome.runtime.getContexts) {
    // Older Chrome — best effort.
    try {
      const matched = await chrome.offscreen.hasDocument?.();
      return !!matched;
    } catch { return false; }
  }
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOC_PATH)],
  });
  return contexts.length > 0;
}

let creatingOffscreen = null;
async function ensureOffscreenDoc() {
  if (await hasOffscreenDoc()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOC_PATH,
        reasons: ["USER_MEDIA"],
        justification: "Record audio commentary for an annotation.",
      })
      .finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function closeOffscreenDocIfIdle() {
  try {
    if (!(await hasOffscreenDoc())) return;
    await chrome.offscreen.closeDocument();
  } catch {}
}

// ---------- Recording bridge -------------------------------------------------

const pendingOffscreenReplies = new Map();

function callOffscreen(type, extra = {}) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingOffscreenReplies.set(id, resolve);
    chrome.runtime.sendMessage({ target: "offscreen", type, id, ...extra }).catch(() => {
      // sendMessage rejects when no listener is yet registered — the offscreen
      // page may still be initializing. Retry once after a short delay.
      setTimeout(() => {
        chrome.runtime.sendMessage({ target: "offscreen", type, id, ...extra }).catch((err) => {
          pendingOffscreenReplies.delete(id);
          resolve({ error: err?.message || "Offscreen unreachable" });
        });
      }, 60);
    });
  });
}

// ---------- Message router ---------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  // Replies coming back from the offscreen document.
  if (message?.type === "OFFSCREEN_REPLY") {
    const resolver = pendingOffscreenReplies.get(message.id);
    if (resolver) {
      pendingOffscreenReplies.delete(message.id);
      resolver(message.payload);
    }
    return false;
  }
  if (message?.type === "OFFSCREEN_READY") return false;

  // Content-script ↦ side panel forwarding.
  if (message?.type === "PAGE_META" && tabId != null) {
    tabState.set(tabId, { ...(tabState.get(tabId) ?? {}), pageMeta: message.data });
    chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: message.data }).catch(() => {});
    return false;
  }

  if (message?.type === "TEXT_SELECTED" && tabId != null) {
    tabState.set(tabId, { ...(tabState.get(tabId) ?? {}), selection: message.data });
    chrome.runtime.sendMessage({ type: "TEXT_SELECTION_UPDATE", data: message.data }).catch(() => {});
    return false;
  }

  // Live media time updates from the page (user scrubbed / playback ticked).
  if (message?.type === "MEDIA_TIME" && tabId != null) {
    const cur = tabState.get(tabId) ?? {};
    cur.mediaTime = message.data;
    if (cur.pageMeta) {
      cur.pageMeta = {
        ...cur.pageMeta,
        currentTime: message.data?.currentTime ?? cur.pageMeta.currentTime,
        duration: message.data?.duration ?? cur.pageMeta.duration,
      };
    }
    tabState.set(tabId, cur);
    chrome.runtime.sendMessage({ type: "MEDIA_TIME_UPDATE", data: message.data }).catch(() => {});
    return false;
  }

  // Forward seek/play/pause commands from the side panel down to the active
  // tab's content script.
  if (
    message?.type === "SEEK_ACTIVE_TAB" ||
    message?.type === "PAUSE_ACTIVE_TAB" ||
    message?.type === "PLAY_ACTIVE_TAB"
  ) {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const active = tabs[0];
        if (!active?.id) return sendResponse({ ok: false, error: "no_active_tab" });
        await ensureContentScript(active.id);
        const inner =
          message.type === "SEEK_ACTIVE_TAB"
            ? { type: "SET_MEDIA_TIME", time: message.time, play: !!message.play }
            : message.type === "PAUSE_ACTIVE_TAB"
              ? { type: "PAUSE_MEDIA" }
              : { type: "PLAY_MEDIA" };
        const resp = await chrome.tabs
          .sendMessage(active.id, inner)
          .catch((err) => ({ ok: false, error: err?.message || "send_failed" }));
        sendResponse(resp ?? { ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  // Notify side panel that the current tab changed (URL/host) so it can
  // reset the publish UI back to the clipping screen.
  if (message?.type === "ACTIVE_TAB_CHANGED") {
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }

  // Side panel asking for current active-tab state.
  if (message?.type === "GET_ACTIVE_TAB_STATE") {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const active = tabs[0];
      if (!active?.id) return sendResponse({ pageMeta: null, selection: null });

      const injected = await ensureContentScript(active.id);
      if (!injected) {
        // Off-limits page (chrome://, Web Store, etc). Use chrome.tabs metadata.
        const meta = await buildFallbackMeta(active);
        return sendResponse({ pageMeta: meta, selection: null });
      }

      const cached = tabState.get(active.id) ?? {};
      if (!cached.pageMeta) {
        // Ask the freshly injected content script for a fresh snapshot.
        chrome.tabs.sendMessage(active.id, { type: "REQUEST_PAGE_META" }).catch(() => {});
      }
      sendResponse({
        pageMeta: cached.pageMeta ?? (await buildFallbackMeta(active)),
        selection: cached.selection ?? null,
      });
    })();
    return true;
  }

  if (message?.type === "INJECT_ACTIVE_TAB") {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const active = tabs[0];
      const ok = active?.id != null ? await ensureContentScript(active.id) : false;
      sendResponse({ ok });
    })();
    return true;
  }

  // Recording control from the side panel.
  if (message?.type === "START_RECORDING") {
    (async () => {
      try {
        await ensureOffscreenDoc();
        const res = await callOffscreen("OFFSCREEN_START_RECORDING");
        sendResponse(res);
      } catch (err) {
        sendResponse({ error: err?.message || "Could not start recording" });
      }
    })();
    return true;
  }
  if (message?.type === "STOP_RECORDING") {
    (async () => {
      try {
        const res = await callOffscreen("OFFSCREEN_STOP_RECORDING");
        // Close the offscreen doc once we have the blob; opens fresh next time.
        await closeOffscreenDocIfIdle();
        sendResponse(res);
      } catch (err) {
        sendResponse({ error: err?.message || "Could not stop recording" });
      }
    })();
    return true;
  }
  if (message?.type === "CANCEL_RECORDING") {
    (async () => {
      try {
        await callOffscreen("OFFSCREEN_CANCEL_RECORDING");
      } catch {}
      await closeOffscreenDocIfIdle();
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Forward auto-stop / recorder errors emitted by offscreen.
  if (message?.type === "RECORDER_AUTO_STOPPED" || message?.type === "RECORDER_ERROR") {
    chrome.runtime.sendMessage(message).catch(() => {});
    if (message.type === "RECORDER_AUTO_STOPPED") closeOffscreenDocIfIdle();
    return false;
  }

  return false;
});

// ---------- Tab lifecycle ----------------------------------------------------

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id != null) ensureContentScript(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    injectedTabs.delete(tabId);
    tabState.delete(tabId);
    // Tell the side panel the source changed so it can reset publish UI.
    chrome.runtime
      .sendMessage({
        type: "ACTIVE_TAB_CHANGED",
        data: { tabId, url: tab?.url || changeInfo.url || null, reason: "navigated" },
      })
      .catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  tabState.delete(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Tell the side panel the active tab changed so it can reset publish UI.
  chrome.runtime
    .sendMessage({ type: "ACTIVE_TAB_CHANGED", data: { tabId, reason: "tab_switch" } })
    .catch(() => {});

  // Push whatever we have for the newly-active tab to any open side panel.
  const cached = tabState.get(tabId);
  if (cached?.pageMeta) {
    chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: cached.pageMeta }).catch(() => {});
    return;
  }
  // No cached meta yet — fall back to tabs.get so the panel always shows
  // something, then attempt injection (will succeed once activeTab kicks in).
  try {
    const tab = await chrome.tabs.get(tabId);
    const fallback = await buildFallbackMeta(tab);
    if (fallback) {
      chrome.runtime.sendMessage({ type: "PAGE_META_UPDATE", data: fallback }).catch(() => {});
    }
  } catch {}
});
