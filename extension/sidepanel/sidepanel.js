// Annotated — Sidepanel UI (vanilla JS)
// Single-file SPA. Talks to the Annotated API. Designed to be loaded by Chrome
// without a build step.

const DEFAULT_API_BASE = "https://annotatedextension.com";
const MAX_CLIP_SECONDS = 90;

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
}
function resolveTheme(pref) { return pref === "system" ? systemTheme() : pref; }
applyTheme(resolveTheme(readThemePref()));
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (readThemePref() === "system") applyTheme(systemTheme());
});

const state = {
  apiBase: DEFAULT_API_BASE,
  user: null,
  tab: "clip",
  pageMeta: null,
  selection: null,
  detailId: null,
  audio: null, // { dataUrl, mime, durationMs }
  recording: { active: false, startedAt: 0, error: null, timer: null },
  manualSource: { url: "", title: "" },
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
  let res;
  try {
    res = await fetch(state.apiBase + path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`Couldn't reach ${state.apiBase} (${detail}). Check your internet connection or reload the extension.`);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
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
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  render();
}
function showDetail(id) { state.detailId = id; render(); }

// -------------------- Persisted user ----------------------------------------

async function loadUser() {
  if (!isExtension() || !chrome.storage?.local) return;
  try {
    const data = await chrome.storage.local.get("annotatedUser");
    if (data.annotatedUser) state.user = data.annotatedUser;
  } catch {}
}
async function saveUser(user) {
  state.user = user;
  if (isExtension() && chrome.storage?.local) {
    try { await chrome.storage.local.set({ annotatedUser: user }); } catch {}
  }
}
async function clearUser() {
  state.user = null;
  if (isExtension() && chrome.storage?.local) {
    try { await chrome.storage.local.remove("annotatedUser"); } catch {}
  }
}

// -------------------- Active-tab detection ----------------------------------

async function refreshActiveTab() {
  if (!isExtension()) return;
  const resp = await sendBg({ type: "GET_ACTIVE_TAB_STATE" });
  if (resp?.pageMeta) state.pageMeta = resp.pageMeta;
  if (resp?.selection) state.selection = resp.selection;
  render();
}

if (isExtension()) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PAGE_META_UPDATE") {
      state.pageMeta = msg.data;
      // Don't full-render mid-typing; just patch source-detection bits.
      patchPageCard();
    }
    if (msg?.type === "TEXT_SELECTION_UPDATE") {
      state.selection = msg.data;
      const ta = document.querySelector("[data-clip-text]");
      if (ta && !ta.value.trim() && msg.data?.text) ta.value = msg.data.text;
    }
    if (msg?.type === "RECORDER_AUTO_STOPPED") {
      // Auto-stop after 90s — pull the blob via stop too is unnecessary; the
      // offscreen sends the payload directly. But our flow always asks the SW
      // to STOP before reading the blob; auto-stop is informational only.
      toast("Recording reached 90s limit");
    }
    if (msg?.type === "RECORDER_ERROR") {
      setRecordingError(msg.data?.message || "Recorder error");
    }
  });
  // Re-pull active tab whenever the side panel regains focus.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshActiveTab();
  });
  window.addEventListener("focus", () => refreshActiveTab());
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

function renderLogin() {
  const node = tpl("#login-view");
  $$("[data-provider]", node).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider;
      try {
        btn.disabled = true;
        const data = await api("/api/auth/demo", {
          method: "POST",
          body: JSON.stringify({ provider }),
        });
        await saveUser(data.user);
        toast(`Signed in as @${data.user.username}`);
        render();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
  const openWebBtn = $("[data-open-web-signin]", node);
  if (openWebBtn) {
    openWebBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = `${state.apiBase}/login`;
      if (isExtension() && chrome.tabs?.create) chrome.tabs.create({ url });
      else window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  return node;
}

// Update only the page-card region (so live updates from the SW don't trash
// what the user has typed into the textareas/inputs).
function patchPageCard() {
  const meta = state.pageMeta;
  const card = document.querySelector("[data-page-card]");
  if (!card) return;
  applyMetaTo(card, meta);

  // Re-render the clip section if the source type changed.
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
  const node = tpl("#clip-view");
  applyMetaTo(node, state.pageMeta);

  // Manual URL fallback (always available, expanded-on-demand).
  const manualBlock = $("[data-manual-source]", node);
  const sourceUrlInput = $("[data-source-url]", manualBlock);
  const manualTitleInput = $("[data-manual-title]", manualBlock);
  sourceUrlInput.value = state.manualSource.url || "";
  manualTitleInput.value = state.manualSource.title || "";
  sourceUrlInput.addEventListener("input", () => { state.manualSource.url = sourceUrlInput.value; });
  manualTitleInput.addEventListener("input", () => { state.manualSource.title = manualTitleInput.value; });

  $("[data-refresh-tab]", node).addEventListener("click", () => {
    refreshActiveTab();
  });

  // Clip-type-specific UI
  const sourceType = state.pageMeta?.sourceType || "unknown";
  const clipSection = $("[data-clip-section]", node);
  clipSection.dataset.kind = sourceType;
  clipSection.appendChild(buildClipSection(sourceType));

  // Audio recorder
  bindRecorder(node);

  // Publish
  const publishBtn = $("[data-publish]", node);
  const errorEl = $("[data-error]", node);
  publishBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    await onPublish(node, publishBtn, errorEl);
  });

  return node;
}

function renderArticleClip() {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  const initial = state.selection?.text || "";
  wrap.innerHTML = `
    <label class="label">Highlighted passage</label>
    <textarea data-clip-text rows="5" placeholder="Highlight text on the page, or paste it here…"></textarea>
    <p class="muted small">Tip: select text on the page — it appears here automatically.</p>
  `;
  const ta = $("[data-clip-text]", wrap);
  if (initial) ta.value = initial;
  return wrap;
}

function renderRangeClip(kind) {
  const meta = state.pageMeta || {};
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  const startDefault = Math.floor(meta.currentTime || 0);
  const endDefault = startDefault + 30;
  wrap.innerHTML = `
    <label class="label">${kind === "youtube" ? "Video clip range" : "Audio clip range"}</label>
    <div class="range-row">
      <div>
        <div class="muted small">Start (seconds)</div>
        <input type="number" min="0" data-clip-start value="${startDefault}" />
      </div>
      <div>
        <div class="muted small">End (seconds)</div>
        <input type="number" min="0" data-clip-end value="${endDefault}" />
      </div>
    </div>
    <div class="duration-display" data-duration-display>
      <span>Duration: <span class="mono" data-duration-value>${endDefault - startDefault}s</span></span>
      <span class="mono">≤ 90s · ${kind === "youtube" ? "240p downscale" : "AAC 128kbps"}</span>
    </div>
    ${meta.currentTime != null ? `<div class="muted small mono">Now playing at ${fmt(meta.currentTime)}${meta.duration ? ` / ${fmt(meta.duration)}` : ""}</div>` : ""}
  `;
  const startInput = $("[data-clip-start]", wrap);
  const endInput = $("[data-clip-end]", wrap);
  const durRow = $("[data-duration-display]", wrap);
  const durVal = $("[data-duration-value]", wrap);
  function updateDuration() {
    const dur = Number(endInput.value) - Number(startInput.value);
    durVal.textContent = `${dur}s`;
    durRow.classList.toggle("over", dur > MAX_CLIP_SECONDS || dur <= 0);
  }
  startInput.addEventListener("input", updateDuration);
  endInput.addEventListener("input", updateDuration);
  return wrap;
}

function renderUnknownClip() {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  wrap.innerHTML = `
    <label class="label">No supported source detected</label>
    <p class="muted small">
      Open a YouTube video, podcast, article, or X post in another tab — the side
      panel will pick it up automatically. Or expand <em>Use a different URL</em>
      above and paste a link.
    </p>
    <textarea data-clip-text rows="3" placeholder="Or paste an article passage to clip"></textarea>
  `;
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
  // Expose to module-level setRecordingError used by SW listeners.
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

// -------------------- Publish flow ------------------------------------------

async function uploadAudioIfPresent() {
  if (!state.audio?.dataUrl) return null;
  // Try the server upload route first; on failure, fall back to inlining the
  // data URL (works for short clips). The data URL roundtrip guarantees the
  // recording survives even when the upload endpoint isn't deployed yet.
  try {
    const result = await api("/api/upload/audio", {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        base64: state.audio.dataUrl.split(",")[1],
        mime: state.audio.mime,
        durationMs: state.audio.durationMs,
      }),
    });
    if (result?.url) return result.url;
  } catch (err) {
    console.warn("[Annotated] upload/audio failed; falling back to inline data URL", err);
  }
  return state.audio.dataUrl;
}

async function onPublish(node, publishBtn, errorEl) {
  const meta = state.pageMeta || {};
  const sourceType = meta.sourceType || "unknown";
  const commentary = $("[data-commentary]", node).value.trim();

  const manualUrl = state.manualSource.url?.trim() || "";
  const manualTitle = state.manualSource.title?.trim() || "";
  const sourceUrl = manualUrl || meta.url || "";
  const finalSourceType = manualUrl
    ? sourceTypeForUrl(manualUrl)
    : sourceType === "x" ? "article" : sourceType;

  const payload = {
    userId: state.user.id,
    sourceUrl,
    sourceType: finalSourceType === "unknown" ? "article" : finalSourceType,
    sourceTitle: manualTitle || meta.title || null,
    sourceAuthor: meta.author || null,
    sourcePublication: meta.publication || (sourceUrl ? hostname(sourceUrl) : null),
    sourceImage: meta.ogImage || null,
    commentaryText: commentary || null,
    commentaryAudioUrl: null,
  };

  if (payload.sourceType === "article") {
    payload.clipText = $("[data-clip-text]", node)?.value?.trim() || "";
    if (!payload.clipText) {
      return showError(errorEl, "Highlight or paste a passage to clip.");
    }
  } else {
    payload.clipStartSec = Number($("[data-clip-start]", node)?.value || 0);
    payload.clipEndSec = Number($("[data-clip-end]", node)?.value || 0);
    const dur = payload.clipEndSec - payload.clipStartSec;
    if (dur <= 0) return showError(errorEl, "Clip end must be greater than start.");
    if (dur > MAX_CLIP_SECONDS) return showError(errorEl, `Clip is ${dur}s. Max allowed is ${MAX_CLIP_SECONDS}s.`);
  }

  if (!payload.sourceUrl) {
    return showError(errorEl, "Source URL is required (every clip links back to its source).");
  }

  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing…";

  try {
    payload.commentaryAudioUrl = await uploadAudioIfPresent();
    const result = await api("/api/clips", { method: "POST", body: JSON.stringify(payload) });
    toast("Annotation published");
    state.audio = null;
    showDetail(result.annotation.id);
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = "Publish annotation";
  }
}

function sourceTypeForUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host === "x.com" || host === "twitter.com") return "article";
    if (
      host.includes("podcasts.apple.com") ||
      host === "overcast.fm" ||
      host === "pca.st" ||
      host.includes("spotify.com")
    ) return "podcast";
  } catch {}
  return "article";
}

function showError(el, msg) {
  el.hidden = false;
  el.textContent = msg;
}

// -------------------- Feed / profile / detail (unchanged) -------------------

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
    list.innerHTML = `<div class="muted small">Couldn't reach API at ${state.apiBase}: ${escapeHtml(err.message)}</div>`;
  }
  return node;
}

function renderFeedCard(a) {
  const card = document.createElement("article");
  card.className = "feed-card";
  card.innerHTML = `
    <div class="feed-card-head">
      <div class="avatar">${a.user?.avatarUrl ? `<img src="${a.user.avatarUrl}" alt="" />` : avatarFallback(a.user?.displayName)}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:13px; font-weight:600;">${escapeHtml(a.user?.displayName || "")}</div>
        <div class="muted small">@${escapeHtml(a.user?.username || "")} · ${escapeHtml(a.sourcePublication || hostname(a.sourceUrl))}</div>
      </div>
      <span class="badge ${a.sourceType}">${a.sourceType}</span>
    </div>
    <div class="feed-card-title">${escapeHtml(a.sourceTitle || a.sourceUrl)}</div>
    ${a.clipText ? `<div class="feed-card-quote">"${escapeHtml(a.clipText.slice(0, 220))}${a.clipText.length > 220 ? "…" : ""}"</div>` : ""}
    ${a.commentaryText ? `<div class="feed-card-commentary">${escapeHtml(a.commentaryText)}</div>` : ""}
    <div class="feed-card-foot">
      <span>${a.commentCount} comments</span>
      <a href="${escapeAttr(a.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto;">↗ Source</a>
    </div>
  `;
  card.addEventListener("click", (e) => {
    if (e.target.tagName === "A") return;
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
  if (user.avatarUrl) avatarEl.src = user.avatarUrl;
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
        <a class="btn btn-outline btn-sm" href="${state.apiBase.replace(/\/api$/, "")}/#/a/${a.id}" target="_blank">Open landing page</a>
        <button class="btn btn-danger btn-sm" data-claim>⚠ File a claim</button>
      </div>
    `;
    $("[data-claim]", card).addEventListener("click", () => openClaimModal(a.id));
  } catch (err) {
    card.innerHTML = `<div class="muted small">Couldn't load annotation: ${escapeHtml(err.message)}</div>`;
  }
  return node;
}

function openClaimModal(annotationId) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;";
  const dialog = document.createElement("div");
  dialog.style.cssText = "background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px;";
  dialog.innerHTML = `
    <div style="font-size:18px; font-weight:600; letter-spacing:-0.015em;">Dispute this content</div>
    <div class="muted small">If this clip infringes your copyright or exceeds fair use, file a claim and our team will review within 72 hours.</div>
    <input type="text" data-cn placeholder="Your full name" required />
    <input type="email" data-ce placeholder="Contact email" required />
    <textarea data-cr rows="3" placeholder="Reason for claim" required></textarea>
    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
      <button class="btn btn-danger btn-sm" data-submit>Submit claim</button>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  $("[data-cancel]", dialog).onclick = () => overlay.remove();
  $("[data-submit]", dialog).onclick = async () => {
    try {
      await api(`/api/annotations/${annotationId}/claims`, {
        method: "POST",
        body: JSON.stringify({
          claimantName: $("[data-cn]", dialog).value,
          claimantEmail: $("[data-ce]", dialog).value,
          reason: $("[data-cr]", dialog).value,
        }),
      });
      toast("Claim submitted");
      overlay.remove();
    } catch (err) {
      toast(err.message, "error");
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

  try {
    const params = new URLSearchParams(location.search);
    const override = params.get("api");
    if (override) state.apiBase = override;
  } catch {}

  await loadUser();
  refreshActiveTab();
  render();
})();
