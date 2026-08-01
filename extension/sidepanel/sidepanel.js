// Annotated — Sidepanel UI (vanilla JS)
// Single-file SPA. Talks to the Annotated API. Designed to be loaded by Chrome
// without a build step.

import {
  MAX_CLIP_SECONDS,
  MAX_CLIP_TEXT_WORDS,
  countWords,
  detectSourceType,
  sameMediaSource,
  capturePlan,
  nextPublishStatus,
} from "../shared/clip-utils.mjs";

const API_BASE = "https://annotatedextension.com";
const SUPPORT_EMAIL = "support@annotatedextension.com";
const PUBLISH_RESET_MS = 10000;
const FAIR_USE_COPY = "I confirm this annotation uses only the selected clip/text for commentary, criticism, research, or another fair-use purpose.";

const CLAIM_REASONS = [
  ["uses_too_much", "Uses too much of my original work"],
  ["reposts_heart", "Reposts the heart or most valuable part of my work"],
  ["insufficient_commentary", "Does not add sufficient commentary or transformation"],
  ["misattribution", "Misattributes or removes credit to the original source"],
  ["paid_or_subscriber_content", "Uses my paid/subscriber-only content without permission"],
  ["copyrighted_media", "Contains copyrighted audio/video/image/text I own"],
  ["other", "Other copyright or fair use concern"],
];

// -------------------- Theme (light/dark) ------------------------------------
const THEME_KEY = "annotated-theme";
function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function readThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch { return "system"; }
}
function writeThemePref(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch {}
}
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  }
}
function resolveTheme(pref) { return pref === "system" ? systemTheme() : pref; }
applyTheme(resolveTheme(readThemePref()));
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (readThemePref() === "system") applyTheme(systemTheme());
});

const state = {
  user: null,
  auth: null,
  tab: "clip",
  pageMeta: null,
  selection: null,
  detailId: null,
  audio: null, // { dataUrl, mime, durationMs }
  recording: { active: false, startedAt: 0, error: null, timer: null },
  manualSource: { url: "", title: "" },
  // Clip range (seconds). null until user/source provides them.
  clipRange: { start: 0, end: 30, userTouched: false, lastSourceUrl: "" },
  // Form state — preserved across re-renders so the preview can stay live.
  // clipTextFromSelection mirrors the last text we auto-imported from the
  // page selection. clipTextEdited flips true the first time the user types
  // or pastes after that import; until then, fresh selections may overwrite
  // the field. After an edit we leave their text alone unless they hit the
  // "Import selection" button.
  form: { commentary: "", clipText: "", clipTextFromSelection: "", clipTextEdited: false, fairUseAcked: false },
  // Publish lifecycle
  publish: {
    status: "idle", // idle | publishing | published
    annotationId: null,
    pageUrlAtPublish: null,
    resetTimer: null,
  },
};

// -------------------- Utilities ---------------------------------------------

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function fmt(sec) {
  if (sec == null || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function hostname(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }
function avatarFallback(name) { return (name || "?").slice(0, 2).toUpperCase(); }
function isExtension() { return typeof chrome !== "undefined" && !!chrome.runtime?.id; }

async function api(path, options = {}) {
  const { __retried = false, headers = {}, ...fetchOptions } = options;
  let accessToken = await validAccessToken();
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...fetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`Couldn't reach ${API_BASE} (${detail}). Check your internet connection or reload the extension.`);
  }
  if (res.status === 401 && state.auth?.refreshToken && !__retried) {
    accessToken = await refreshAccessToken();
    if (accessToken) return api(path, { ...options, __retried: true });
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

async function persistAuth(auth) {
  state.auth = auth;
  state.user = auth?.user || null;
  if (isExtension() && chrome.storage?.local) {
    if (auth) await chrome.storage.local.set({ annotatedAuth: auth });
    else await chrome.storage.local.remove("annotatedAuth");
  }
}

async function refreshAccessToken() {
  const refreshToken = state.auth?.refreshToken;
  if (!refreshToken) return null;
  try {
    const res = await fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error("refresh_failed");
    const auth = await res.json();
    await persistAuth(auth);
    return auth.accessToken || null;
  } catch {
    await persistAuth(null);
    return null;
  }
}

async function validAccessToken() {
  if (!state.auth?.accessToken) return null;
  const expiresAtMs = Number(state.auth.expiresAt || 0) * 1000;
  if (!expiresAtMs || expiresAtMs > Date.now() + 60_000) return state.auth.accessToken;
  return refreshAccessToken();
}

function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function sendBg(message) {
  return new Promise((resolve) => {
    if (!isExtension() || !chrome.runtime?.sendMessage) return resolve(null);
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
        resolve(resp);
      });
    } catch (err) {
      resolve({ error: err?.message || String(err) });
    }
  });
}

// -------------------- Routing/tabs ------------------------------------------

function setTab(tab) {
  state.tab = tab;
  state.detailId = null;
  $$(".tab").forEach((t) => {
    const active = t.dataset.tab === tab;
    t.classList.toggle("active", active);
    if (active) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  render();
}
function showDetail(id) { state.detailId = id; render(); }

// -------------------- Persisted user ----------------------------------------

async function loadUser() {
  if (!isExtension() || !chrome.storage?.local) return;
  try {
    const data = await chrome.storage.local.get(["annotatedAuth", "annotatedUser"]);
    if (data.annotatedAuth?.user) {
      state.auth = data.annotatedAuth;
      state.user = data.annotatedAuth.user;
      await validAccessToken();
    } else if (data.annotatedUser) {
      // Legacy builds persisted an unverifiable user object. Never treat it as
      // an authenticated session; require a one-time fresh OAuth sign-in.
      await chrome.storage.local.remove("annotatedUser");
    }
  } catch {}
}
async function clearUser() {
  state.user = null;
  state.auth = null;
  if (isExtension() && chrome.storage?.local) {
    try { await chrome.storage.local.remove(["annotatedAuth", "annotatedUser"]); } catch {}
  }
}

// -------------------- Active-tab detection ----------------------------------

async function refreshActiveTab() {
  if (!isExtension()) return;
  const resp = await sendBg({ type: "GET_ACTIVE_TAB_STATE" });
  const prevUrl = state.pageMeta?.url || "";
  if (resp?.pageMeta) state.pageMeta = resp.pageMeta;
  if (resp?.selection) state.selection = resp.selection;
  // If the source URL changed and we just published, reset back to clipping.
  if (state.publish.status === "published" && state.publish.pageUrlAtPublish && state.pageMeta?.url && state.pageMeta.url !== state.publish.pageUrlAtPublish) {
    resetPublishState();
  }
  // Reset user-touched range when source changes
  const newUrl = state.pageMeta?.url || "";
  if (newUrl && newUrl !== state.clipRange.lastSourceUrl) {
    state.clipRange.lastSourceUrl = newUrl;
    state.clipRange.userTouched = false;
    seedClipRangeFromMeta();
  }
  render();
  return prevUrl !== newUrl;
}

function seedClipRangeFromMeta() {
  const meta = state.pageMeta || {};
  if (meta.sourceType !== "youtube" && meta.sourceType !== "podcast") return;
  const cur = Math.max(0, Math.floor(meta.currentTime || 0));
  const dur = Number.isFinite(meta.duration) ? Math.floor(meta.duration) : null;
  state.clipRange.start = cur;
  state.clipRange.end = Math.min(cur + 30, dur != null ? dur : cur + 30);
  if (state.clipRange.end <= state.clipRange.start) state.clipRange.end = state.clipRange.start + 1;
}

if (isExtension()) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PAGE_META_UPDATE") {
      const prev = state.pageMeta?.url || "";
      state.pageMeta = msg.data;
      if (msg.data?.url && msg.data.url !== state.clipRange.lastSourceUrl) {
        state.clipRange.lastSourceUrl = msg.data.url;
        state.clipRange.userTouched = false;
        // New source — clear the auto-imported selection guard so the next
        // highlight on this page will populate the field.
        state.form.clipTextFromSelection = "";
        state.form.clipTextEdited = false;
        state.selection = null;
        seedClipRangeFromMeta();
        // If we're showing a "Published!" confirmation and the source changed,
        // reset back to clipping.
        if (state.publish.status === "published" && state.publish.pageUrlAtPublish && msg.data.url !== state.publish.pageUrlAtPublish) {
          resetPublishState();
          return;
        }
      }
      patchPageCard();
      patchPreviewCard();
      patchRangeInputs();
    }
    if (msg?.type === "MEDIA_TIME_UPDATE") {
      const data = msg.data || {};
      // Keep meta currentTime fresh for the "Page playhead: …" indicator and
      // for the Use-current-time buttons. We no longer auto-clobber Start
      // when the user scrubs — that lives behind explicit Use current time.
      if (state.pageMeta) {
        state.pageMeta = {
          ...state.pageMeta,
          currentTime: data.currentTime ?? state.pageMeta.currentTime,
          duration: data.duration ?? state.pageMeta.duration,
        };
      }
      patchRangeInputs();
    }
    if (msg?.type === "ACTIVE_TAB_CHANGED") {
      // Tab switched/navigated. Refresh meta and reset publish UI if shown.
      if (state.publish.status === "published") {
        resetPublishState();
      }
      refreshActiveTab();
    }
    if (msg?.type === "TEXT_SELECTION_UPDATE") {
      state.selection = msg.data;
      applySelectionToClipText(msg.data?.text || "", { force: false });
    }
    if (msg?.type === "RECORDER_AUTO_STOPPED") {
      toast("Recording reached 90s limit");
    }
    if (msg?.type === "RECORDER_ERROR") {
      setRecordingError(msg.data?.message || "Recorder error");
    }
    // Background SW broadcasts this after the website-tab sign-in flow hands
    // off the verified session. Refresh the panel so the signed-in UI shows up
    // without a manual reload.
    if (msg?.type === "ANNOTATED_AUTH_UPDATED" && msg.auth?.user) {
      state.auth = msg.auth;
      state.user = msg.auth.user;
      toast(`Signed in as @${msg.auth.user.username || "user"}`);
      render();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      // Re-read the persisted user — the website-tab sign-in flow may have
      // written it while the panel was hidden.
      loadUser().then(() => {
        render();
        refreshActiveTab();
      });
    }
  });
  window.addEventListener("focus", () => {
    loadUser().then(() => {
      render();
      refreshActiveTab();
    });
  });
  // Storage changes from the background SW (e.g. external sign-in handoff
  // landed) — pick the new user up immediately.
  if (chrome.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if ("annotatedAuth" in changes) {
        state.auth = changes.annotatedAuth.newValue || null;
        state.user = state.auth?.user || null;
        render();
      }
    });
  }
}

// -------------------- Renderers ---------------------------------------------

function tpl(id) { return $(id).content.cloneNode(true); }

async function render() {
  const root = $("#content");
  root.innerHTML = "";
  if (!state.user) return root.appendChild(renderLogin());
  if (state.detailId) return root.appendChild(await renderDetail(state.detailId));
  if (state.tab === "clip") return root.appendChild(renderClip());
  if (state.tab === "feed") return root.appendChild(await renderFeed());
  if (state.tab === "profile") return root.appendChild(await renderProfile());
}

function buildExtensionAuthUrl(provider) {
  const extensionId = isExtension() && chrome.runtime?.id ? chrome.runtime.id : "";
  const params = new URLSearchParams({ extension: "1" });
  if (extensionId) params.set("extensionId", extensionId);
  if (provider) params.set("provider", provider);
  return `${API_BASE}/login?${params.toString()}`;
}

function openWebsiteSignIn(provider) {
  const url = buildExtensionAuthUrl(provider);
  // chrome.tabs.create returns a Promise (or accepts a callback). We don't
  // need to track the tab — the website-tab callback page closes itself
  // after the auth handoff completes, and the SW receives the user record
  // via chrome.runtime.onMessageExternal regardless of whether this panel is
  // still open.
  if (isExtension() && chrome.tabs?.create) {
    try { chrome.tabs.create({ url }); } catch {}
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function renderLogin() {
  const node = tpl("#login-view");
  $$("[data-provider]", node).forEach((btn) => {
    btn.addEventListener("click", () => {
      const provider = btn.dataset.provider;
      openWebsiteSignIn(provider);
      toast("Finishing sign-in in a new tab…");
    });
  });
  const openWebBtn = $("[data-open-web-signin]", node);
  if (openWebBtn) {
    openWebBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openWebsiteSignIn(null);
    });
  }
  return node;
}

function patchPageCard() {
  const meta = state.pageMeta;
  const card = document.querySelector("[data-page-card]");
  if (!card) return;
  applyMetaTo(card, meta);

  const desired = meta?.sourceType || "unknown";
  const sec = document.querySelector("[data-clip-section]");
  if (!sec) return;
  if (sec.dataset.kind !== desired) {
    sec.dataset.kind = desired;
    sec.innerHTML = "";
    sec.appendChild(buildClipSection(desired));
  }
}

function applyMetaTo(scope, meta) {
  const badgeEl = $("[data-badge]", scope);
  const titleEl = $("[data-title]", scope);
  const authorEl = $("[data-author]", scope);
  const hostEl = $("[data-host]", scope);
  const sourceLinkEl = $("[data-source-link]", scope);
  if (!badgeEl) return;

  const sourceType = meta?.sourceType || "unknown";
  const url = meta?.url || "";

  const labels = {
    youtube: "Video",
    podcast: "Podcast",
    article: "Article",
    x: "Post",
    unknown: "Tab",
  };
  badgeEl.textContent = labels[sourceType] || "Tab";
  badgeEl.className = `badge ${sourceType}`;
  titleEl.textContent = meta?.title || "Open Annotated on a tab to detect a source";
  authorEl.textContent = meta?.author ? `By ${meta.author}` : meta?.publication || "";
  hostEl.textContent = url ? hostname(url) : "";

  if (url) {
    sourceLinkEl.href = url;
    sourceLinkEl.textContent = `View source on ${hostname(url)} ↗`;
    sourceLinkEl.style.display = "";
  } else {
    sourceLinkEl.style.display = "none";
  }
}

function buildClipSection(sourceType) {
  if (sourceType === "youtube" || sourceType === "podcast") return renderRangeClip(sourceType);
  if (sourceType === "article" || sourceType === "x") return renderArticleClip(sourceType);
  return renderUnknownClip();
}

function renderClip() {
  // While the publish flow is in success state, show only the success card.
  if (state.publish.status === "published") {
    return renderPublishSuccess();
  }

  const node = tpl("#clip-view");
  applyMetaTo(node, state.pageMeta);

  const manualBlock = $("[data-manual-source]", node);
  const sourceUrlInput = $("[data-source-url]", manualBlock);
  const manualTitleInput = $("[data-manual-title]", manualBlock);
  sourceUrlInput.value = state.manualSource.url || "";
  manualTitleInput.value = state.manualSource.title || "";
  sourceUrlInput.addEventListener("input", () => {
    state.manualSource.url = sourceUrlInput.value;
    patchPreviewCard();
  });
  manualTitleInput.addEventListener("input", () => {
    state.manualSource.title = manualTitleInput.value;
    patchPreviewCard();
  });

  $("[data-refresh-tab]", node).addEventListener("click", () => {
    refreshActiveTab();
  });

  const sourceType = state.pageMeta?.sourceType || "unknown";
  const clipSection = $("[data-clip-section]", node);
  clipSection.dataset.kind = sourceType;
  clipSection.appendChild(buildClipSection(sourceType));

  // Commentary
  const commentaryEl = $("[data-commentary]", node);
  commentaryEl.value = state.form.commentary || "";
  commentaryEl.addEventListener("input", () => {
    state.form.commentary = commentaryEl.value;
    patchPreviewCard();
  });

  bindRecorder(node);

  // Build feed-style preview between commentary and the publish button.
  const previewMount = $("[data-preview-mount]", node);
  if (previewMount) previewMount.appendChild(renderPreviewCard());

  const publishBtn = $("[data-publish]", node);
  const errorEl = $("[data-error]", node);
  const fairUseCheck = $("[data-fair-use-check]", node);
  if (fairUseCheck) {
    fairUseCheck.checked = !!state.form.fairUseAcked;
    fairUseCheck.addEventListener("change", () => {
      state.form.fairUseAcked = !!fairUseCheck.checked;
      if (fairUseCheck.checked && errorEl && /fair[- ]?use/i.test(errorEl.textContent || "")) {
        errorEl.hidden = true;
      }
    });
  }
  publishBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    await onPublish(node, publishBtn, errorEl);
  });

  return node;
}

// Apply an incoming page selection to the clip-text field. Honors the
// manual-edit guard: if the user has edited/pasted in the field since the
// last auto-import, we leave it alone unless `force` is true (e.g. the
// "Import selection" button).
function applySelectionToClipText(text, { force = false } = {}) {
  const next = (text || "").trim();
  if (!next) return;
  // Don't clobber identical text — this avoids resetting the textarea on
  // every selectionchange tick when the user is just hovering.
  if (next === state.form.clipTextFromSelection && next === state.form.clipText) return;
  if (state.form.clipTextEdited && !force) return;
  state.form.clipText = next;
  state.form.clipTextFromSelection = next;
  state.form.clipTextEdited = false;
  const ta = document.querySelector("[data-clip-text]");
  if (ta) {
    ta.value = next;
    // Scroll to top so the start of the passage is visible after import.
    ta.scrollTop = 0;
  }
  const words = countWords(next);
  const status = document.querySelector("[data-clip-text-status]");
  if (status) {
    if (words > MAX_CLIP_TEXT_WORDS) {
      status.textContent = `Imported ${words} words — over the ${MAX_CLIP_TEXT_WORDS}-word limit. Trim before publishing.`;
    } else {
      status.textContent = "Imported from page selection";
    }
  }
  updateClipWordCounter();
  patchPreviewCard();
}

async function importSelectionFromActiveTab() {
  const status = document.querySelector("[data-clip-text-status]");
  if (status) status.textContent = "Reading selection…";
  const resp = await sendBg({ type: "REQUEST_SELECTION" });
  const text = (resp?.selection?.text || "").trim();
  if (!text) {
    if (status) {
      const why = resp?.error;
      status.textContent =
        why === "restricted_page"
          ? "This page can't be read by extensions. Paste the passage here instead."
          : why === "no_active_tab"
            ? "Couldn't find the active tab. Click the page once and try again."
            : "No text is highlighted on the page. Highlight a passage and try again, or paste it here.";
    }
    return;
  }
  if (resp?.selection?.url) {
    state.selection = resp.selection;
  }
  // Force=true overrides the manual-edit guard on explicit user action.
  applySelectionToClipText(text, { force: true });
}

function buildClipTextField({ rows = 6, placeholder = "highlight text on page and import selection, or paste it here..." } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  const initial = state.form.clipText || state.selection?.text || "";
  wrap.innerHTML = `
    <div class="clip-text-head">
      <label class="label" for="clip-text-area">Highlighted passage</label>
      <button class="link-mini wide" type="button" data-import-selection title="Pull the current page selection into this field">
        ↧ Import selection
      </button>
    </div>
    <div class="clip-text-wrap">
      <textarea id="clip-text-area" data-clip-text rows="${rows}" placeholder="${placeholder}"></textarea>
      <span class="clip-word-counter" data-clip-word-counter aria-live="polite">0 / ${MAX_CLIP_TEXT_WORDS} words</span>
    </div>
    <p class="muted small clip-text-status" data-clip-text-status>
      highlight text on page and import selection, or paste it here...
    </p>
  `;
  const ta = $("[data-clip-text]", wrap);
  if (initial) {
    ta.value = initial;
    state.form.clipText = initial;
    if (!state.form.clipTextFromSelection && state.selection?.text === initial) {
      state.form.clipTextFromSelection = initial;
    }
  }
  updateClipWordCounter(wrap);
  ta.addEventListener("input", () => {
    state.form.clipText = ta.value;
    // Any input that diverges from the last imported selection counts as a
    // manual edit, which freezes auto-import for this clip session.
    state.form.clipTextEdited = ta.value !== state.form.clipTextFromSelection;
    const status = $("[data-clip-text-status]", wrap);
    if (status && state.form.clipTextEdited) {
      status.textContent = "Edited — auto-import paused. Click ↧ Import selection to overwrite with the page highlight.";
    }
    updateClipWordCounter(wrap);
    patchPreviewCard();
  });
  ta.addEventListener("paste", () => {
    // A paste counts as a manual edit on the next input tick.
    setTimeout(() => {
      state.form.clipText = ta.value;
      state.form.clipTextEdited = ta.value !== state.form.clipTextFromSelection;
      updateClipWordCounter(wrap);
      patchPreviewCard();
    }, 0);
  });
  $("[data-import-selection]", wrap).addEventListener("click", (e) => {
    e.preventDefault();
    importSelectionFromActiveTab();
  });
  return wrap;
}

function updateClipWordCounter(scope) {
  const root = scope || document;
  const counter = root.querySelector
    ? root.querySelector("[data-clip-word-counter]")
    : document.querySelector("[data-clip-word-counter]");
  if (!counter) return;
  const ta = root.querySelector
    ? root.querySelector("[data-clip-text]")
    : document.querySelector("[data-clip-text]");
  const value = ta ? ta.value : state.form.clipText || "";
  const words = countWords(value);
  counter.textContent = `${words} / ${MAX_CLIP_TEXT_WORDS} words`;
  counter.classList.toggle("over", words > MAX_CLIP_TEXT_WORDS);
  counter.classList.toggle("near", words > MAX_CLIP_TEXT_WORDS * 0.8 && words <= MAX_CLIP_TEXT_WORDS);
}

function renderArticleClip() {
  return buildClipTextField({ rows: 6 });
}

// Build the Start/End time card UI for video/podcast clips. The user scrubs
// the page's native player; the side panel just shows their current Start
// and End values and lets them snap to the page's currentTime.
function renderRangeClip(kind) {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex clip-time-cards";
  const meta = state.pageMeta || {};
  const duration = Number.isFinite(meta.duration) && meta.duration > 0 ? Math.floor(meta.duration) : null;

  if (state.clipRange.start == null || state.clipRange.end == null) {
    seedClipRangeFromMeta();
  }

  wrap.innerHTML = `
    <div class="clip-range-meta">
      <span>Clip range</span>
      <span class="max-tag">Max ${MAX_CLIP_SECONDS} seconds</span>
    </div>

    <p class="muted small clip-howto">
      Scrub the ${kind === "podcast" ? "podcast" : "video"} on the page to the moment you want, then tap
      <strong>Use current time</strong> for the start and the end.
    </p>

    <div class="time-card" data-time-card="start">
      <div class="time-card-row">
        <span class="time-card-label">Start</span>
        <span class="time-card-value mono" data-clip-start-display>0:00</span>
      </div>
      <div class="time-card-actions">
        <button type="button" class="step-btn" data-step="start" data-dir="-1" aria-label="Decrease start by 1 second">−1s</button>
        <button type="button" class="step-btn" data-step="start" data-dir="1" aria-label="Increase start by 1 second">+1s</button>
        <button type="button" class="time-card-set" data-set-current="start">
          Use current time
        </button>
      </div>
    </div>

    <div class="time-card" data-time-card="end">
      <div class="time-card-row">
        <span class="time-card-label">End</span>
        <span class="time-card-value mono" data-clip-end-display>0:00</span>
      </div>
      <div class="time-card-actions">
        <button type="button" class="step-btn" data-step="end" data-dir="-1" aria-label="Decrease end by 1 second">−1s</button>
        <button type="button" class="step-btn" data-step="end" data-dir="1" aria-label="Increase end by 1 second">+1s</button>
        <button type="button" class="time-card-set" data-set-current="end">
          Use current time
        </button>
      </div>
    </div>

    <div class="clip-summary">
      <span class="muted small">Clip length:</span>
      <span class="mono" data-clip-length>0:00 / ${fmt(MAX_CLIP_SECONDS)} max</span>
      <button type="button" class="btn btn-outline btn-sm preview-clip-btn" data-preview-clip title="Seek the page player to the start and play">
        ▶ Preview clip
      </button>
    </div>

    <div class="muted small mono now-playing" data-now-playing></div>
    <div class="duration-display" data-duration-display></div>
  `;

  const startDisplay = $("[data-clip-start-display]", wrap);
  const endDisplay = $("[data-clip-end-display]", wrap);
  const lengthDisplay = $("[data-clip-length]", wrap);
  const durDisplay = $("[data-duration-display]", wrap);
  const nowPlaying = $("[data-now-playing]", wrap);

  function fmtNow() {
    const m = state.pageMeta || {};
    if (m.currentTime == null) {
      nowPlaying.textContent = "";
      return;
    }
    const dur = Number.isFinite(m.duration) ? ` / ${fmt(m.duration)}` : "";
    nowPlaying.textContent = `Page playhead: ${fmt(m.currentTime)}${dur}`;
  }

  function clampRange() {
    if (state.clipRange.start < 0) state.clipRange.start = 0;
    if (duration != null && state.clipRange.start > duration) {
      state.clipRange.start = duration;
    }
    if (state.clipRange.end <= state.clipRange.start) {
      state.clipRange.end = state.clipRange.start + 1;
    }
    if (state.clipRange.end - state.clipRange.start > MAX_CLIP_SECONDS) {
      state.clipRange.end = state.clipRange.start + MAX_CLIP_SECONDS;
    }
    if (duration != null && state.clipRange.end > duration) {
      state.clipRange.end = duration;
      if (state.clipRange.start >= state.clipRange.end) {
        state.clipRange.start = Math.max(0, state.clipRange.end - 1);
      }
    }
  }

  function update() {
    const s = Math.max(0, Math.floor(state.clipRange.start));
    const e = Math.max(s + 1, Math.floor(state.clipRange.end));
    const dur = e - s;
    startDisplay.textContent = fmt(s);
    endDisplay.textContent = fmt(e);
    lengthDisplay.textContent = `${fmt(dur)} / ${fmt(MAX_CLIP_SECONDS)} max`;
    if (dur > MAX_CLIP_SECONDS) {
      durDisplay.classList.add("over");
      durDisplay.textContent = `${dur - MAX_CLIP_SECONDS}s over the ${MAX_CLIP_SECONDS}s limit`;
    } else {
      durDisplay.classList.remove("over");
      durDisplay.textContent = "";
    }
    fmtNow();
    patchPreviewCard();
  }

  // +/- 1s nudges. Each click adjusts the boundary by exactly one second,
  // clamps to 0/duration and the 90s cap, then seeks the page player so the
  // user previews the new position on the page itself.
  $$("[data-step]", wrap).forEach((btn) => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.step;
      const dir = Number(btn.dataset.dir);
      if (which === "start") {
        state.clipRange.start = Math.floor(state.clipRange.start) + dir;
      } else {
        state.clipRange.end = Math.floor(state.clipRange.end) + dir;
      }
      clampRange();
      state.clipRange.userTouched = true;
      update();
      const t = which === "start" ? state.clipRange.start : state.clipRange.end;
      sendBg({ type: "SEEK_ACTIVE_TAB", time: t, play: false });
    });
  });

  // "Use current time" buttons — snap start or end to the page player's
  // currentTime. The user has scrubbed the page video; this captures it.
  // We do a fresh GET_ACTIVE_MEDIA_TIME query through to the content script
  // so we read the live <video>.currentTime at click-time rather than the
  // last cached PAGE_META broadcast (which can lag, or refer to the wrong
  // <video> element if YouTube has rendered hover-preview videos).
  $$("[data-set-current]", wrap).forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const which = btn.dataset.setCurrent;
        let cur = null;
        try {
          const fresh = await sendBg({ type: "GET_ACTIVE_MEDIA_TIME" });
          if (fresh && Number.isFinite(fresh.currentTime)) {
            cur = Math.floor(fresh.currentTime);
            // Best-effort: also refresh state.pageMeta so the "Page playhead"
            // indicator and other UI bits stay in sync.
            if (state.pageMeta) {
              state.pageMeta = {
                ...state.pageMeta,
                currentTime: fresh.currentTime,
                duration: Number.isFinite(fresh.duration) ? fresh.duration : state.pageMeta.duration,
              };
            }
          }
        } catch {}
        if (cur == null) {
          // Fallback: the cached pageMeta path (was the only path before).
          const refresh = await sendBg({ type: "GET_ACTIVE_TAB_STATE" });
          const fallback = refresh?.pageMeta?.currentTime ?? state.pageMeta?.currentTime;
          cur = Number.isFinite(fallback) ? Math.floor(fallback) : 0;
        }
        cur = Math.max(0, cur);
        if (which === "start") {
          state.clipRange.start = cur;
          if (state.clipRange.end <= state.clipRange.start) {
            state.clipRange.end = state.clipRange.start + 1;
          }
        } else {
          let next = Math.max(state.clipRange.start + 1, cur);
          if (next - state.clipRange.start > MAX_CLIP_SECONDS) {
            next = state.clipRange.start + MAX_CLIP_SECONDS;
          }
          state.clipRange.end = next;
        }
        clampRange();
        state.clipRange.userTouched = true;
        update();
      } finally {
        btn.disabled = false;
      }
    });
  });

  $("[data-preview-clip]", wrap).addEventListener("click", () => {
    sendBg({ type: "SEEK_ACTIVE_TAB", time: state.clipRange.start, play: true });
  });

  update();
  return wrap;
}

function patchRangeInputs() {
  const startDisplay = document.querySelector("[data-clip-start-display]");
  const endDisplay = document.querySelector("[data-clip-end-display]");
  const lengthDisplay = document.querySelector("[data-clip-length]");
  const nowPlaying = document.querySelector("[data-now-playing]");
  if (!startDisplay || !endDisplay || !lengthDisplay) return;
  const s = Math.max(0, Math.floor(state.clipRange.start));
  const e = Math.max(s + 1, Math.floor(state.clipRange.end));
  startDisplay.textContent = fmt(s);
  endDisplay.textContent = fmt(e);
  lengthDisplay.textContent = `${fmt(e - s)} / ${fmt(MAX_CLIP_SECONDS)} max`;
  if (nowPlaying) {
    const m = state.pageMeta || {};
    if (m.currentTime != null) {
      const dur = Number.isFinite(m.duration) ? ` / ${fmt(m.duration)}` : "";
      nowPlaying.textContent = `Page playhead: ${fmt(m.currentTime)}${dur}`;
    } else {
      nowPlaying.textContent = "";
    }
  }
}

function renderUnknownClip() {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  const intro = document.createElement("p");
  intro.className = "muted small";
  intro.innerHTML = `
    Open a YouTube video, podcast, article, or X post in another tab — the
    side panel will pick it up automatically. You can also paste a passage
    below, or expand <em>Use a different URL</em> above and paste a link.
  `;
  wrap.appendChild(intro);
  wrap.appendChild(buildClipTextField({ rows: 4, placeholder: "highlight text on page and import selection, or paste it here..." }));
  return wrap;
}

// -------------------- Audio recorder ----------------------------------------

function bindRecorder(scope) {
  const toggleBtn = $("[data-record-toggle]", scope);
  const dot = $("[data-record-dot]", scope);
  const label = $("[data-record-label]", scope);
  const timeEl = $("[data-record-time]", scope);
  const audioEl = $("[data-audio-preview]", scope);
  const errBox = $("[data-record-error]", scope);
  const errMsg = $("[data-record-error-msg]", scope);
  const actions = $("[data-recorder-actions]", scope);
  const discard = $("[data-record-discard]", scope);
  const openSettings = $("[data-record-open-settings]", scope);
  const retry = $("[data-record-retry]", scope);

  function updateUi() {
    const rec = state.recording;
    if (rec.active) {
      dot.classList.add("recording");
      label.textContent = "Stop recording";
      const elapsed = Math.floor((Date.now() - rec.startedAt) / 1000);
      timeEl.textContent = `${fmt(elapsed)} / ${fmt(MAX_CLIP_SECONDS)}`;
    } else {
      dot.classList.remove("recording");
      label.textContent = state.audio ? "Re-record" : "Record audio commentary";
      timeEl.textContent = state.audio
        ? `${fmt(Math.round((state.audio.durationMs || 0) / 1000))} attached`
        : `0:00 / ${fmt(MAX_CLIP_SECONDS)}`;
    }
    if (state.audio?.dataUrl) {
      audioEl.src = state.audio.dataUrl;
      audioEl.hidden = false;
      actions.hidden = false;
    } else {
      audioEl.removeAttribute("src");
      audioEl.hidden = true;
      actions.hidden = true;
    }
    if (state.recording.error) {
      errMsg.textContent = state.recording.error;
      errBox.hidden = false;
    } else {
      errBox.hidden = true;
    }
    patchPreviewCard();
  }

  function startTimer() {
    stopTimer();
    state.recording.timer = setInterval(updateUi, 250);
  }
  function stopTimer() {
    if (state.recording.timer) {
      clearInterval(state.recording.timer);
      state.recording.timer = null;
    }
  }

  toggleBtn.addEventListener("click", async () => {
    if (state.recording.active) {
      toggleBtn.disabled = true;
      const resp = await sendBg({ type: "STOP_RECORDING" });
      toggleBtn.disabled = false;
      stopTimer();
      state.recording.active = false;
      if (resp?.error) {
        setRecordingError(resp.error);
      } else if (resp?.base64) {
        state.audio = {
          dataUrl: `data:${resp.mime || "audio/webm"};base64,${resp.base64}`,
          mime: resp.mime || "audio/webm",
          durationMs: resp.durationMs || 0,
          bytes: resp.bytes || 0,
        };
      }
      updateUi();
      return;
    }
    state.recording.error = null;
    updateUi();
    toggleBtn.disabled = true;
    const resp = await sendBg({ type: "START_RECORDING" });
    toggleBtn.disabled = false;
    if (resp?.error) {
      const friendly = friendlyMicError(resp);
      setRecordingError(friendly);
    } else {
      state.recording.active = true;
      state.recording.startedAt = Date.now();
      state.audio = null;
      startTimer();
    }
    updateUi();
  });

  discard.addEventListener("click", () => {
    state.audio = null;
    updateUi();
  });

  openSettings.addEventListener("click", () => {
    if (isExtension() && chrome.tabs?.create) {
      chrome.tabs.create({ url: "chrome://settings/content/microphone" });
    }
  });

  retry.addEventListener("click", () => {
    state.recording.error = null;
    updateUi();
    toggleBtn.click();
  });

  function setRecordingErrorLocal(msg) {
    state.recording.error = msg;
    state.recording.active = false;
    stopTimer();
    updateUi();
  }
  setRecordingError = setRecordingErrorLocal;

  updateUi();
}

let setRecordingError = (msg) => { state.recording.error = msg; };

function friendlyMicError(resp) {
  const name = resp.name || "";
  const msg = resp.error || "Microphone unavailable";
  if (/NotAllowed|Denied/i.test(name) || /denied|permission/i.test(msg)) {
    return "Chrome blocked microphone access for this extension.";
  }
  if (/NotFound/i.test(name)) return "No microphone detected on this device.";
  if (/NotReadable/i.test(name)) return "Your microphone is in use by another app.";
  return msg;
}

// -------------------- Feed-style preview ------------------------------------

function buildPreviewModel() {
  const meta = state.pageMeta || {};
  const manualUrl = state.manualSource.url?.trim() || "";
  const manualTitle = state.manualSource.title?.trim() || "";
  const sourceUrl = manualUrl || meta.url || "";
  const sourceTypeRaw = manualUrl ? detectSourceType(manualUrl) : meta.sourceType || "unknown";
  const sourceType = sourceTypeRaw === "x" ? "article" : sourceTypeRaw;
  const sourceTitle = manualTitle || meta.title || "Untitled clip";
  const publication = meta.publication || (sourceUrl ? hostname(sourceUrl) : "");
  return {
    sourceUrl,
    sourceType,
    sourceTitle,
    sourceAuthor: meta.author || "",
    sourcePublication: publication,
    sourceImage: meta.ogImage || "",
    clipStart: state.clipRange.start,
    clipEnd: state.clipRange.end,
    clipText: state.form.clipText || "",
    commentary: state.form.commentary || "",
    hasAudio: !!state.audio?.dataUrl,
  };
}

function sourceTypeBadgeLabel(type) {
  return ({
    youtube: "Video",
    podcast: "Podcast",
    article: "Article",
    x: "Post",
    unknown: "Tab",
  })[type] || "Tab";
}

function renderPreviewCard() {
  const card = document.createElement("article");
  card.className = "preview-card";
  card.dataset.previewCard = "1";
  card.innerHTML = `
    <div class="preview-label">
      <span>Preview</span>
      <span class="muted small">How this will appear in the feed</span>
    </div>
    <div class="preview-card-head">
      <div class="avatar" data-preview-avatar></div>
      <div class="who">
        <span class="name" data-preview-name></span>
        <span class="handle" data-preview-handle></span>
      </div>
      <span class="badge" data-preview-badge></span>
    </div>
    <div class="preview-source">
      <div class="preview-thumb" data-preview-thumb>
        <span class="play" data-preview-play>▶</span>
        <span class="duration-tag" data-preview-duration hidden></span>
      </div>
      <div class="preview-source-meta">
        <span class="preview-publication" data-preview-publication></span>
        <span class="preview-title" data-preview-title></span>
        <a class="preview-source-link" data-preview-source-link target="_blank" rel="noopener noreferrer"></a>
      </div>
    </div>
    <div class="preview-quote" data-preview-quote hidden></div>
    <div class="preview-commentary muted" data-preview-commentary></div>
    <div class="preview-foot">
      <span class="clip-tag" data-preview-clip-tag></span>
      <span class="audio-tag" data-preview-audio hidden>♪ Audio commentary</span>
      <span class="muted small" style="margin-left:auto;" data-preview-source-host></span>
    </div>
  `;
  fillPreviewCard(card);
  return card;
}

function fillPreviewCard(card) {
  if (!card) return;
  const m = buildPreviewModel();
  const user = state.user || {};
  const avatarEl = $("[data-preview-avatar]", card);
  if (user.avatarUrl) {
    avatarEl.innerHTML = `<img src="${escapeAttr(user.avatarUrl)}" alt="" />`;
  } else {
    avatarEl.textContent = avatarFallback(user.displayName);
  }
  $("[data-preview-name]", card).textContent = user.displayName || "Your name";
  $("[data-preview-handle]", card).textContent = user.username ? `@${user.username}` : "";
  const badgeEl = $("[data-preview-badge]", card);
  badgeEl.textContent = sourceTypeBadgeLabel(m.sourceType);
  badgeEl.className = `badge ${m.sourceType}`;

  $("[data-preview-publication]", card).textContent = m.sourcePublication || "";
  $("[data-preview-title]", card).textContent = m.sourceTitle;

  const linkEl = $("[data-preview-source-link]", card);
  if (m.sourceUrl) {
    linkEl.href = m.sourceUrl;
    linkEl.textContent = `↗ ${hostname(m.sourceUrl)}`;
    linkEl.style.display = "";
  } else {
    linkEl.style.display = "none";
  }

  const thumb = $("[data-preview-thumb]", card);
  thumb.querySelectorAll("img").forEach((n) => n.remove());
  const playEl = $("[data-preview-play]", card);
  if (m.sourceImage) {
    const img = document.createElement("img");
    img.src = m.sourceImage;
    img.alt = "";
    thumb.insertBefore(img, playEl);
    playEl.style.display = m.sourceType === "youtube" || m.sourceType === "podcast" ? "" : "none";
  } else if (m.sourceType === "article" || m.sourceType === "unknown") {
    playEl.style.display = "none";
  } else {
    playEl.style.display = "";
  }
  const durationTag = $("[data-preview-duration]", card);
  if (m.sourceType === "youtube" || m.sourceType === "podcast") {
    const len = Math.max(0, m.clipEnd - m.clipStart);
    durationTag.textContent = fmt(len);
    durationTag.hidden = false;
  } else {
    durationTag.hidden = true;
  }

  const quoteEl = $("[data-preview-quote]", card);
  if ((m.sourceType === "article" || m.sourceType === "unknown") && m.clipText) {
    quoteEl.hidden = false;
    // Show the full passage — the .preview-quote CSS caps height and
    // scrolls so the user can review without leaving the sidebar.
    quoteEl.textContent = `"${m.clipText}"`;
  } else {
    quoteEl.hidden = true;
  }

  const commentaryEl = $("[data-preview-commentary]", card);
  if (m.commentary) {
    commentaryEl.classList.remove("muted");
    commentaryEl.textContent = m.commentary.length > 200 ? `${m.commentary.slice(0, 200)}…` : m.commentary;
  } else {
    commentaryEl.classList.add("muted");
    commentaryEl.textContent = "Add commentary above and it'll show up here.";
  }

  const clipTag = $("[data-preview-clip-tag]", card);
  if (m.sourceType === "youtube" || m.sourceType === "podcast") {
    const len = Math.max(0, m.clipEnd - m.clipStart);
    clipTag.textContent = `Clip ${fmt(m.clipStart)} – ${fmt(m.clipEnd)} · ${len}s`;
  } else if (m.clipText) {
    clipTag.textContent = `Quote · ${m.clipText.length} chars`;
  } else {
    clipTag.textContent = "";
  }

  const audioEl = $("[data-preview-audio]", card);
  audioEl.hidden = !m.hasAudio;
  $("[data-preview-source-host]", card).textContent = m.sourceUrl ? hostname(m.sourceUrl) : "";
}

function patchPreviewCard() {
  const card = document.querySelector("[data-preview-card]");
  if (card) fillPreviewCard(card);
}

// -------------------- Publish flow ------------------------------------------

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl).split(",", 2);
  const mime = /data:([^;]+)/.exec(header || "")?.[1] || "application/octet-stream";
  const binary = atob(encoded || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime.split(";")[0] });
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: String(mime || "application/octet-stream").split(";")[0] });
}

async function uploadVerifiedMedia(kind, blob, annotationId = null) {
  const upload = await api("/api/uploads/sign", {
    method: "POST",
    body: JSON.stringify({ kind, mime: blob.type, sizeBytes: blob.size }),
  });
  const response = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type, "x-upsert": "false" },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`Media upload failed (${response.status})`);
  }
  return api("/api/uploads/finalize", {
    method: "POST",
    body: JSON.stringify({ uploadId: upload.uploadId, annotationId }),
  });
}

async function uploadAudioIfPresent() {
  if (!state.audio?.dataUrl) return null;
  try {
    const blob = dataUrlToBlob(state.audio.dataUrl);
    const result = await uploadVerifiedMedia("commentary-audio", blob);
    if (result?.uploadId) return result.uploadId;
  } catch (err) {
    console.warn("[Annotated] upload/audio failed", err);
    throw err;
  }
  return null;
}

async function onPublish(node, publishBtn, errorEl) {
  if (!state.user) {
    return showError(errorEl, "Sign in first to publish.");
  }
  const fairUseCheck = $("[data-fair-use-check]", node);
  const acked = fairUseCheck ? !!fairUseCheck.checked : !!state.form.fairUseAcked;
  state.form.fairUseAcked = acked;
  if (!acked) {
    return showError(
      errorEl,
      "Please confirm fair use before publishing — all content on Annotated must be fair use.",
    );
  }
  const meta = state.pageMeta || {};
  const sourceType = meta.sourceType || "unknown";
  const commentary = ($("[data-commentary]", node)?.value || state.form.commentary || "").trim();

  const manualUrl = state.manualSource.url?.trim() || "";
  const manualTitle = state.manualSource.title?.trim() || "";
  const sourceUrl = manualUrl || meta.url || "";
  const finalSourceType = manualUrl
    ? detectSourceType(manualUrl)
    : sourceType === "x" ? "article" : sourceType;

  const payload = {
    sourceUrl,
    sourceType: finalSourceType === "unknown" ? "article" : finalSourceType,
    sourceTitle: manualTitle || meta.title || null,
    sourceAuthor: meta.author || null,
    sourcePublication: meta.publication || (sourceUrl ? hostname(sourceUrl) : null),
    sourceImage: meta.ogImage || null,
    commentaryText: commentary || null,
    commentaryAudioUploadId: null,
  };

  if (payload.sourceType === "article") {
    payload.clipText = ($("[data-clip-text]", node)?.value?.trim() || state.form.clipText?.trim() || "");
    if (!payload.clipText) {
      return showError(errorEl, "Highlight or paste a passage to clip.");
    }
    const words = countWords(payload.clipText);
    if (words > MAX_CLIP_TEXT_WORDS) {
      return showError(
        errorEl,
        `Source text is ${words} words. Max allowed is ${MAX_CLIP_TEXT_WORDS} words — trim the passage before publishing.`,
      );
    }
  } else {
    payload.clipStartSec = Math.max(0, Math.floor(state.clipRange.start));
    payload.clipEndSec = Math.max(payload.clipStartSec + 1, Math.floor(state.clipRange.end));
    const dur = payload.clipEndSec - payload.clipStartSec;
    if (dur <= 0) return showError(errorEl, "Clip end must be greater than start.");
    if (dur > MAX_CLIP_SECONDS) return showError(errorEl, `Clip is ${dur}s. Max allowed is ${MAX_CLIP_SECONDS}s.`);
  }

  if (!payload.sourceUrl) {
    return showError(errorEl, "Source URL is required (every clip links back to its source).");
  }
  if (
    (payload.sourceType === "youtube" || payload.sourceType === "podcast") &&
    !sameMediaSource(payload.sourceUrl, meta.url || "")
  ) {
    return showError(
      errorEl,
      "Open the pasted video or podcast in the active tab before publishing so Annotated can capture the selected range.",
    );
  }

  state.publish.status = nextPublishStatus(state.publish.status, "start");
  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing…";

  let createdAnnotationId = null;
  try {
    payload.commentaryAudioUploadId = await uploadAudioIfPresent();
    const result = await api("/api/clips", { method: "POST", body: JSON.stringify(payload) });
    createdAnnotationId = result.annotation.id;

    if (payload.sourceType === "youtube" || payload.sourceType === "podcast") {
      const plan = capturePlan(payload.sourceType, payload.clipStartSec, payload.clipEndSec);
      publishBtn.textContent = payload.sourceType === "youtube"
        ? "Capturing 240p clip…"
        : "Capturing audio clip…";
      const capture = await sendBg({
        type: "CAPTURE_ACTIVE_TAB_CLIP",
        kind: plan.kind,
        startSec: plan.startSec,
        durationMs: plan.durationMs,
      });
      if (!capture?.ok || !capture.base64) {
        throw new Error(capture?.error || "The active tab could not be captured");
      }
      publishBtn.textContent = "Uploading verified clip…";
      const blob = base64ToBlob(capture.base64, capture.mime);
      await uploadVerifiedMedia(
        payload.sourceType === "youtube" ? "clip-video" : "clip-audio",
        blob,
        createdAnnotationId,
      );
    }

    state.publish.status = nextPublishStatus(state.publish.status, "success");
    state.publish.annotationId = createdAnnotationId;
    state.publish.pageUrlAtPublish = state.pageMeta?.url || sourceUrl;

    // Auto-reset after PUBLISH_RESET_MS
    if (state.publish.resetTimer) clearTimeout(state.publish.resetTimer);
    state.publish.resetTimer = setTimeout(() => resetPublishState(), PUBLISH_RESET_MS);
    render();
  } catch (err) {
    if (createdAnnotationId) {
      api(`/api/annotations/${createdAnnotationId}/clip-failed`, { method: "POST" }).catch(() => {});
    }
    state.publish.status = nextPublishStatus(state.publish.status, "failure");
    showError(errorEl, err.message);
    publishBtn.disabled = false;
    publishBtn.textContent = "Publish annotation";
  }
}

function resetPublishState() {
  if (state.publish.resetTimer) {
    clearTimeout(state.publish.resetTimer);
    state.publish.resetTimer = null;
  }
  state.publish.status = "idle";
  state.publish.annotationId = null;
  state.publish.pageUrlAtPublish = null;
  state.audio = null;
  state.form.commentary = "";
  state.form.clipText = "";
  state.form.clipTextFromSelection = "";
  state.form.clipTextEdited = false;
  state.form.fairUseAcked = false;
  state.selection = null;
  state.clipRange.userTouched = false;
  seedClipRangeFromMeta();
  if (state.tab === "clip" && !state.detailId) {
    render();
  }
}

function renderPublishSuccess() {
  const node = document.createElement("section");
  node.className = "view";
  node.innerHTML = `
    <div class="publish-success" role="status" aria-live="polite">
      <div class="checkmark">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="label">Published!</div>
      <div class="sub">Your annotation is live on the feed. The side panel will reset shortly, or open the post to share it.</div>
      <div class="actions">
        <button class="btn btn-outline btn-sm" data-view-post>View post</button>
        <button class="btn btn-ghost btn-sm" data-publish-reset>Clip another →</button>
      </div>
    </div>
  `;
  $("[data-view-post]", node).addEventListener("click", () => {
    if (state.publish.annotationId) {
      const url = `https://www.annotatedextension.com/a/${encodeURIComponent(state.publish.annotationId)}`;
      if (isExtension() && chrome.tabs?.create) chrome.tabs.create({ url });
      else window.open(url, "_blank", "noopener,noreferrer");
    }
  });
  $("[data-publish-reset]", node).addEventListener("click", () => {
    resetPublishState();
  });
  return node;
}

function showError(el, msg) {
  if (!el) {
    toast(msg, "error");
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

// -------------------- Feed / profile / detail ------------------------------

async function renderFeed() {
  const node = tpl("#feed-view");
  const list = $("[data-feed]", node);
  try {
    const items = await api("/api/feed");
    list.innerHTML = "";
    if (items.length === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "No annotations yet — be the first.";
      list.appendChild(e);
      return node;
    }
    items.forEach((a) => list.appendChild(renderFeedCard(a)));
  } catch (err) {
    list.innerHTML = `<div class="muted small">Couldn't reach API at ${API_BASE}: ${escapeHtml(err.message)}</div>`;
  }
  return node;
}

function renderFeedCard(a) {
  const card = document.createElement("article");
  card.className = "feed-card";
  const cardTitle = a.sourceTitle || a.sourceUrl || "Open annotation";
  card.innerHTML = `
    <div class="feed-card-head">
      <div class="avatar">${a.user?.avatarUrl ? `<img src="${escapeAttr(a.user.avatarUrl)}" alt="${escapeAttr(a.user?.displayName || "Creator")}" />` : avatarFallback(a.user?.displayName)}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:13px; font-weight:600;">${escapeHtml(a.user?.displayName || "")}</div>
        <div class="muted small">@${escapeHtml(a.user?.username || "")} · ${escapeHtml(a.sourcePublication || hostname(a.sourceUrl))}</div>
      </div>
      <span class="badge ${a.sourceType}">${a.sourceType}</span>
    </div>
    <button type="button" class="feed-card-open" data-open-detail aria-label="Open annotation: ${escapeAttr(cardTitle)}">${escapeHtml(cardTitle)}</button>
    ${a.clipText ? `<div class="feed-card-quote">"${escapeHtml(a.clipText.slice(0, 220))}${a.clipText.length > 220 ? "…" : ""}"</div>` : ""}
    ${a.commentaryText ? `<div class="feed-card-commentary">${escapeHtml(a.commentaryText)}</div>` : ""}
    <div class="feed-card-foot">
      <span>${a.commentCount} comments</span>
      <a href="${escapeAttr(a.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto;">↗ Source</a>
    </div>
  `;
  $(`[data-open-detail]`, card).addEventListener("click", () => showDetail(a.id));
  card.addEventListener("click", (e) => {
    if (e.target?.closest?.("a, button, input, textarea, select, audio, video, iframe")) return;
    showDetail(a.id);
  });
  return card;
}

async function renderProfile() {
  const node = tpl("#profile-view");
  const user = state.user;
  $("[data-display-name]", node).textContent = user.displayName;
  $("[data-username]", node).textContent = `@${user.username}`;
  $("[data-bio]", node).textContent = user.bio || "";
  const avatarEl = $("[data-avatar]", node);
  if (user.avatarUrl) {
    avatarEl.src = user.avatarUrl;
    avatarEl.alt = `${user.displayName} profile photo`;
  }
  else avatarEl.replaceWith(Object.assign(document.createElement("div"), { className: "avatar lg", textContent: avatarFallback(user.displayName) }));

  try {
    const profile = await api(`/api/users/${user.id}`);
    $("[data-followers]", node).textContent = profile.followers;
    $("[data-following]", node).textContent = profile.following;
    $("[data-clips]", node).textContent = profile.annotations.length;
    const list = $("[data-my-feed]", node);
    list.innerHTML = "";
    if (profile.annotations.length === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "No clips yet. Open a video, podcast, or article and start clipping.";
      list.appendChild(e);
    } else {
      profile.annotations.forEach((a) => list.appendChild(renderFeedCard({ ...a, user })));
    }
  } catch (err) {
    toast(err.message, "error");
  }

  $("[data-logout]", node).addEventListener("click", async () => {
    await clearUser();
    render();
  });
  return node;
}

async function renderDetail(id) {
  const node = tpl("#detail-view");
  $("[data-back]", node).addEventListener("click", () => {
    state.detailId = null;
    render();
  });
  const card = $("[data-detail]", node);
  try {
    const a = await api(`/api/annotations/${id}`);
    card.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge ${a.sourceType}">${a.sourceType}</span>
        <span class="muted small">From ${escapeHtml(a.sourcePublication || hostname(a.sourceUrl))}</span>
      </div>
      <h2 class="detail-title">${escapeHtml(a.sourceTitle || "Annotated clip")}</h2>
      ${a.sourceAuthor ? `<div class="muted small">By ${escapeHtml(a.sourceAuthor)}</div>` : ""}
      <a href="${escapeAttr(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">↗ View original on ${escapeHtml(hostname(a.sourceUrl))}</a>
      ${a.clipText ? `<div class="feed-card-quote">"${escapeHtml(a.clipText)}"</div>` : ""}
      ${a.clipStartSec != null ? `<div class="muted small mono">Clipped ${fmt(a.clipStartSec)} – ${fmt(a.clipEndSec)} (${a.clipEndSec - a.clipStartSec}s · ${a.sourceType === "youtube" ? "240p" : "audio"})</div>` : ""}
      ${a.commentaryText ? `<div style="border-left:2px solid var(--primary); padding:4px 0 4px 10px; font-size:14px;">${escapeHtml(a.commentaryText)}</div>` : ""}
      ${a.commentaryAudioUrl ? `<audio controls src="${escapeAttr(a.commentaryAudioUrl)}" style="width:100%;"></audio>` : ""}
      <div style="display:flex; gap:8px; padding-top:8px; border-top:1px solid var(--border);">
        <a class="btn btn-outline btn-sm" href="https://www.annotatedextension.com/a/${encodeURIComponent(a.id)}" target="_blank" rel="noopener noreferrer">Open landing page</a>
        <button class="btn btn-danger btn-sm" data-claim>⚠ File a claim</button>
      </div>
    `;
    $("[data-claim]", card).addEventListener("click", () =>
      openClaimModal(a.id, { title: a.sourceTitle, sourceUrl: a.sourceUrl })
    );
  } catch (err) {
    card.innerHTML = `<div class="muted small">Couldn't load annotation: ${escapeHtml(err.message)}</div>`;
  }
  return node;
}

function openClaimModal(annotationId, ctx = {}) {
  const previouslyFocused = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "claim-overlay";

  const dialog = document.createElement("div");
  dialog.className = "claim-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "claim-dialog-title");
  dialog.setAttribute("aria-describedby", "claim-dialog-description");
  dialog.tabIndex = -1;
  const reasonOptions = CLAIM_REASONS.map(
    ([id, label]) => `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`,
  ).join("");
  const isSignedIn = !!state.user;
  const prefilledName = state.user?.displayName || "";
  dialog.innerHTML = `
    <h3 id="claim-dialog-title">Dispute this content</h3>
    <p id="claim-dialog-description" class="muted small" style="margin: 0;">
      If this clip infringes your copyright or exceeds fair use, file a claim and our
      team will review.
    </p>
    ${
      ctx.title
        ? `<div class="muted small" style="background:var(--surface-2); padding:8px 10px; border-radius:8px;">
            <div style="font-weight:600; color:var(--text);">${escapeHtml(ctx.title)}</div>
            <div style="margin-top:2px; word-break:break-all;">${escapeHtml(ctx.sourceUrl || "")}</div>
          </div>`
        : ""
    }
    <label class="field-label" for="claim-name">Your name</label>
    <input type="text" data-cw tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;" />
    <input id="claim-name" type="text" data-cn autocomplete="name" placeholder="Full name" value="${escapeAttr(prefilledName)}" required />
    <label class="field-label" for="claim-email">Contact email</label>
    <input id="claim-email" type="email" data-ce autocomplete="email" placeholder="you@example.com" required />
    <label class="field-label" for="claim-reason">Reason</label>
    <select id="claim-reason" data-rc required>
      <option value="" disabled selected>Pick the closest match…</option>
      ${reasonOptions}
    </select>
    <label class="field-label" for="claim-details">Anything else? (optional)</label>
    <textarea id="claim-details" data-cd rows="3" placeholder="Add context — links to your original work, what was copied, etc."></textarea>
    <p class="muted small" style="margin: 0;">
      Filing a claim emails you a confirmation and notifies the post's author so
      they can review. Questions? Email
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
      ${isSignedIn ? "" : `<br><strong>Heads up:</strong> you're not signed in.`}
    </p>
    <div class="actions">
      <button class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
      <button class="btn btn-danger btn-sm" data-submit>Submit claim</button>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const closeDialog = () => {
    document.removeEventListener("keydown", handleDialogKeydown);
    overlay.remove();
    if (previouslyFocused?.focus) previouslyFocused.focus();
  };
  const handleDialogKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = $$('button:not(:disabled), [href], input:not(:disabled):not([tabindex="-1"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])', dialog)
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", handleDialogKeydown);
  $("[data-cancel]", dialog).onclick = closeDialog;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });
  requestAnimationFrame(() => $("[data-cn]", dialog)?.focus());

  $("[data-submit]", dialog).onclick = async () => {
    const submitBtn = $("[data-submit]", dialog);
    const name = $("[data-cn]", dialog).value.trim();
    const email = $("[data-ce]", dialog).value.trim();
    const category = $("[data-rc]", dialog).value;
    const details = $("[data-cd]", dialog).value.trim();
    const requiredFields = [
      [$("[data-cn]", dialog), !!name],
      [$("[data-ce]", dialog), !!email],
      [$("[data-rc]", dialog), !!category],
    ];
    requiredFields.forEach(([field, valid]) => field.setAttribute("aria-invalid", String(!valid)));
    if (!name || !email || !category) {
      toast("Please fill in your name, email, and a reason.", "error");
      requiredFields.find(([, valid]) => !valid)?.[0]?.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    try {
      const result = await api(`/api/annotations/${annotationId}/claims`, {
        method: "POST",
        body: JSON.stringify({
          claimantName: name,
          claimantEmail: email,
          reasonCategory: category,
          details: details || null,
          website: $(`[data-cw]`, dialog).value,
        }),
      });
      const emailLine = result?.notifications?.confirmationSent
        ? `We sent a confirmation to ${escapeHtml(email)}.`
        : `Your claim is saved. Email delivery may be delayed; contact ${SUPPORT_EMAIL} if needed.`;
      dialog.removeAttribute("aria-describedby");
      dialog.innerHTML = `
        <h3 id="claim-dialog-title" style="display:flex; gap:8px; align-items:center;">
          <span style="display:inline-flex; width:20px; height:20px; border-radius:50%; background:var(--gradient-primary); color:var(--primary-foreground); align-items:center; justify-content:center;">✓</span>
          Claim received
        </h3>
        <p class="muted small">
          Thanks. ${emailLine} The moderation audit trail records delivery and review status.
        </p>
        <p class="muted small">
          Any questions or concerns? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
        </p>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-close>Done</button>
        </div>
      `;
      $("[data-close]", dialog).onclick = closeDialog;
      $("[data-close]", dialog).focus();
    } catch (err) {
      toast(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit claim";
    }
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// -------------------- Boot ---------------------------------------------------

(async function init() {
  $$(".tab").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  const themeBtn = document.querySelector("[data-theme-toggle]");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = resolveTheme(readThemePref());
      const next = current === "dark" ? "light" : "dark";
      writeThemePref(next);
      applyTheme(next);
    });
  }

  await loadUser();
  refreshActiveTab();
  render();
})();
