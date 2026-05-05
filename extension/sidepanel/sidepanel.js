// Annotated — Sidepanel UI (vanilla JS)
// Single-file SPA. Talks to the Annotated API. Designed to be loaded by Chrome
// without a build step.

const DEFAULT_API_BASE = "https://annotatedextension.com";
const MAX_CLIP_SECONDS = 90;
const SUPPORT_EMAIL = "support@annotatedextension.com";
const PUBLISH_RESET_MS = 10000;

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
  // Clip range (seconds). null until user/source provides them.
  clipRange: { start: 0, end: 30, userTouched: false, lastSourceUrl: "" },
  // Form state — preserved across re-renders so the preview can stay live.
  // clipTextFromSelection mirrors the last text we auto-imported from the
  // page selection. clipTextEdited flips true the first time the user types
  // or pastes after that import; until then, fresh selections may overwrite
  // the field. After an edit we leave their text alone unless they hit the
  // "Import selection" button.
  form: { commentary: "", clipText: "", clipTextFromSelection: "", clipTextEdited: false },
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
      } else if (state.publish.status !== "published") {
        // Live updates from same page (currentTime/duration changes) — only
        // refresh the input fields if the user hasn't started editing the
        // range manually.
        if (!state.clipRange.userTouched) {
          // Keep start at currentTime if available, leave end alone.
          // (We do NOT reseed end aggressively to avoid clobbering edits.)
          const cur = Math.max(0, Math.floor(msg.data?.currentTime || 0));
          if (cur && Math.abs(cur - state.clipRange.start) > 1) {
            state.clipRange.start = cur;
            const dur = Number.isFinite(msg.data?.duration) ? Math.floor(msg.data.duration) : null;
            const desiredEnd = Math.min(cur + 30, dur != null ? dur : cur + 30);
            if (desiredEnd > state.clipRange.end || state.clipRange.end <= state.clipRange.start) {
              state.clipRange.end = desiredEnd;
            }
          }
        }
      }
      patchPageCard();
      patchPreviewCard();
      patchRangeInputs();
    }
    if (msg?.type === "MEDIA_TIME_UPDATE") {
      const data = msg.data || {};
      // Only auto-import the user's page-side scrub when the side panel range
      // hasn't been actively edited; otherwise we'd clobber their work.
      if (data.reason === "seek" && !state.clipRange.userTouched && state.publish.status !== "published") {
        const cur = Math.max(0, Math.floor(data.currentTime || 0));
        if (cur >= 0) {
          state.clipRange.start = cur;
          const dur = Number.isFinite(data.duration) ? Math.floor(data.duration) : null;
          const desiredEnd = Math.min(cur + 30, dur != null ? dur : cur + 30);
          state.clipRange.end = Math.max(desiredEnd, cur + 1);
          patchRangeInputs();
        }
      }
      // Keep meta currentTime fresh for preview/UI without re-rendering.
      if (state.pageMeta) {
        state.pageMeta = {
          ...state.pageMeta,
          currentTime: data.currentTime ?? state.pageMeta.currentTime,
          duration: data.duration ?? state.pageMeta.duration,
        };
      }
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
  });
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
  const status = document.querySelector("[data-clip-text-status]");
  if (status) status.textContent = "Imported from page selection";
  patchPreviewCard();
}

async function importSelectionFromActiveTab() {
  const status = document.querySelector("[data-clip-text-status]");
  if (status) status.textContent = "Reading selection…";
  const resp = await sendBg({ type: "REQUEST_SELECTION" });
  const text = resp?.selection?.text || "";
  if (!text) {
    if (status) {
      status.textContent = resp?.error === "restricted_page"
        ? "This page can't be read by extensions. Paste the passage instead."
        : "No text is highlighted on the page. Highlight a passage and try again.";
    }
    return;
  }
  if (resp?.selection?.url) {
    state.selection = resp.selection;
  }
  applySelectionToClipText(text, { force: true });
}

function buildClipTextField({ rows = 6, placeholder = "Highlight text on the page, or paste it here…" } = {}) {
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
    <textarea id="clip-text-area" data-clip-text rows="${rows}" placeholder="${placeholder}"></textarea>
    <p class="muted small clip-text-status" data-clip-text-status>
      Highlight text on the page — it appears here automatically. Long text scrolls inside this box.
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
  ta.addEventListener("input", () => {
    state.form.clipText = ta.value;
    // Any input that diverges from the last imported selection counts as a
    // manual edit, which freezes auto-import for this clip session.
    state.form.clipTextEdited = ta.value !== state.form.clipTextFromSelection;
    const status = $("[data-clip-text-status]", wrap);
    if (status && state.form.clipTextEdited) {
      status.textContent = "Edited — auto-import paused. Click ↧ Import selection to overwrite with the page highlight.";
    }
    patchPreviewCard();
  });
  ta.addEventListener("paste", () => {
    // A paste counts as a manual edit on the next input tick.
    setTimeout(() => {
      state.form.clipText = ta.value;
      state.form.clipTextEdited = ta.value !== state.form.clipTextFromSelection;
      patchPreviewCard();
    }, 0);
  });
  $("[data-import-selection]", wrap).addEventListener("click", (e) => {
    e.preventDefault();
    importSelectionFromActiveTab();
  });
  return wrap;
}

function renderArticleClip() {
  return buildClipTextField({ rows: 6 });
}

// Build the dual-handle range slider for video/podcast clips.
function renderRangeClip(kind) {
  const wrap = document.createElement("div");
  wrap.className = "clip-flex";
  const meta = state.pageMeta || {};
  const duration = Number.isFinite(meta.duration) && meta.duration > 0 ? Math.floor(meta.duration) : null;

  if (state.clipRange.start == null || state.clipRange.end == null) {
    seedClipRangeFromMeta();
  }
  const start = Math.max(0, state.clipRange.start);
  const end = Math.max(start + 1, state.clipRange.end);

  wrap.innerHTML = `
    <div class="clip-range-meta">
      <span>Clip range</span>
      <span class="max-tag">Max ${MAX_CLIP_SECONDS} seconds</span>
    </div>

    <div class="range-fields">
      <div class="time-stepper" data-time-stepper="start">
        <button type="button" class="step-btn" data-step="start" data-dir="-1" aria-label="Decrease start by 1 second">−</button>
        <input class="time-input" type="text" inputmode="numeric" data-clip-start-mmss aria-label="Start (mm:ss)" />
        <button type="button" class="step-btn" data-step="start" data-dir="1" aria-label="Increase start by 1 second">+</button>
      </div>
      <div class="dash">–</div>
      <div class="time-stepper" data-time-stepper="end">
        <button type="button" class="step-btn" data-step="end" data-dir="-1" aria-label="Decrease end by 1 second">−</button>
        <input class="time-input" type="text" inputmode="numeric" data-clip-end-mmss aria-label="End (mm:ss)" />
        <button type="button" class="step-btn" data-step="end" data-dir="1" aria-label="Increase end by 1 second">+</button>
      </div>
      <div class="total">
        <span class="total-value mono" data-duration-value>${end - start}s</span>
        <span data-duration-of-max>${MAX_CLIP_SECONDS}s max</span>
      </div>
    </div>

    <div class="dual-range" data-dual-range>
      <div class="rail"></div>
      <div class="selected-range" data-selected-range></div>
      <input type="range" min="0" step="1" data-range-start aria-label="Start" />
      <input type="range" min="0" step="1" data-range-end aria-label="End" />
    </div>

    <div class="range-tick-row">
      <span class="mono" data-tick-zero>0:00</span>
      <span class="mono" data-tick-end>${duration != null ? fmt(duration) : "—"}</span>
    </div>

    <div class="mark-row">
      <button type="button" class="mark-btn" data-mark-in title="Set start to current playback time">
        <span class="mark-dot"></span> Mark in
      </button>
      <button type="button" class="mark-btn" data-mark-out title="Set end to current playback time">
        <span class="mark-dot"></span> Mark out
      </button>
      <button type="button" class="mark-btn preview" data-preview-clip title="Seek the page video to start and play">
        ▶ Preview
      </button>
    </div>

    <div class="muted small mono" data-now-playing></div>
    <div class="duration-display" data-duration-display></div>
  `;

  const startInput = $("[data-clip-start-mmss]", wrap);
  const endInput = $("[data-clip-end-mmss]", wrap);
  const rangeStart = $("[data-range-start]", wrap);
  const rangeEnd = $("[data-range-end]", wrap);
  const selectedRange = $("[data-selected-range]", wrap);
  const durValue = $("[data-duration-value]", wrap);
  const durDisplay = $("[data-duration-display]", wrap);
  const nowPlaying = $("[data-now-playing]", wrap);
  const tickEnd = $("[data-tick-end]", wrap);

  // The slider's max is the video duration when known, otherwise generous
  // upper bound that covers most podcast episodes (3 hours).
  const sliderMax = duration != null ? Math.max(duration, end + 1) : 10800;
  rangeStart.max = String(sliderMax);
  rangeEnd.max = String(sliderMax);

  function fmtNow() {
    if (!meta.currentTime && meta.currentTime !== 0) {
      nowPlaying.textContent = "";
      return;
    }
    const dur = Number.isFinite(meta.duration) ? ` / ${fmt(meta.duration)}` : "";
    nowPlaying.textContent = `Now playing at ${fmt(meta.currentTime)}${dur}`;
  }

  function update() {
    const s = Math.max(0, Math.floor(state.clipRange.start));
    const e = Math.max(s + 1, Math.floor(state.clipRange.end));
    const dur = e - s;
    rangeStart.value = String(s);
    rangeEnd.value = String(e);
    startInput.value = fmt(s);
    endInput.value = fmt(e);
    durValue.textContent = `${dur}s`;
    if (dur > MAX_CLIP_SECONDS) {
      durDisplay.classList.add("over");
      durDisplay.textContent = `${dur - MAX_CLIP_SECONDS}s over the ${MAX_CLIP_SECONDS}s limit`;
    } else {
      durDisplay.classList.remove("over");
      durDisplay.textContent = "";
    }
    const max = Number(rangeStart.max);
    const startPct = (s / max) * 100;
    const endPct = (e / max) * 100;
    selectedRange.style.left = `${startPct}%`;
    selectedRange.style.right = `${100 - endPct}%`;
    if (duration != null) tickEnd.textContent = fmt(duration);
    fmtNow();
    patchPreviewCard();
  }

  // Throttle seek messages to the page so a fast drag doesn't flood the
  // content script. The trailing call ensures the final position is honored.
  let lastSeekAt = 0;
  let pendingSeekTimer = null;
  let pendingSeekTime = null;
  function seekPage(time) {
    pendingSeekTime = time;
    const now = Date.now();
    const elapsed = now - lastSeekAt;
    const minGap = 90;
    if (elapsed >= minGap) {
      lastSeekAt = now;
      const t = pendingSeekTime;
      pendingSeekTime = null;
      sendBg({ type: "SEEK_ACTIVE_TAB", time: t, play: false });
      return;
    }
    if (pendingSeekTimer) return;
    pendingSeekTimer = setTimeout(() => {
      pendingSeekTimer = null;
      if (pendingSeekTime == null) return;
      lastSeekAt = Date.now();
      const t = pendingSeekTime;
      pendingSeekTime = null;
      sendBg({ type: "SEEK_ACTIVE_TAB", time: t, play: false });
    }, minGap - elapsed);
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

  rangeStart.addEventListener("input", () => {
    // Seek the page video as the user drags the start handle so they see
    // exactly where they are scrubbing.
    state.clipRange.start = Number(rangeStart.value);
    if (state.clipRange.end <= state.clipRange.start) {
      state.clipRange.end = state.clipRange.start + 1;
    }
    if (state.clipRange.end - state.clipRange.start > MAX_CLIP_SECONDS) {
      state.clipRange.end = state.clipRange.start + MAX_CLIP_SECONDS;
    }
    state.clipRange.userTouched = true;
    update();
    seekPage(state.clipRange.start);
  });
  rangeEnd.addEventListener("input", () => {
    state.clipRange.end = Number(rangeEnd.value);
    if (state.clipRange.end <= state.clipRange.start) {
      state.clipRange.end = state.clipRange.start + 1;
    }
    if (state.clipRange.end - state.clipRange.start > MAX_CLIP_SECONDS) {
      state.clipRange.start = state.clipRange.end - MAX_CLIP_SECONDS;
      if (state.clipRange.start < 0) state.clipRange.start = 0;
    }
    state.clipRange.userTouched = true;
    update();
    seekPage(state.clipRange.end);
  });
  // On release, send a final non-throttled seek to guarantee the page lands
  // on the chosen value even if the trailing throttle is still pending.
  function finalSeek(which) {
    if (pendingSeekTimer) { clearTimeout(pendingSeekTimer); pendingSeekTimer = null; }
    pendingSeekTime = null;
    lastSeekAt = Date.now();
    const t = which === "start" ? state.clipRange.start : state.clipRange.end;
    sendBg({ type: "SEEK_ACTIVE_TAB", time: t, play: false });
  }
  rangeStart.addEventListener("change", () => finalSeek("start"));
  rangeEnd.addEventListener("change", () => finalSeek("end"));

  function parseMmss(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const m = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0);
  }
  function commitMmss(input, key) {
    const parsed = parseMmss(input.value);
    if (parsed == null) return update();
    if (key === "start") {
      state.clipRange.start = Math.max(0, Math.floor(parsed));
      if (state.clipRange.end <= state.clipRange.start) {
        state.clipRange.end = state.clipRange.start + 1;
      }
    } else {
      state.clipRange.end = Math.max(state.clipRange.start + 1, Math.floor(parsed));
      if (state.clipRange.end - state.clipRange.start > MAX_CLIP_SECONDS) {
        state.clipRange.end = state.clipRange.start + MAX_CLIP_SECONDS;
      }
    }
    state.clipRange.userTouched = true;
    update();
  }
  startInput.addEventListener("change", () => commitMmss(startInput, "start"));
  endInput.addEventListener("change", () => commitMmss(endInput, "end"));
  startInput.addEventListener("blur", () => commitMmss(startInput, "start"));
  endInput.addEventListener("blur", () => commitMmss(endInput, "end"));

  // +/- 1s nudge buttons next to start and end. Each click adjusts the
  // boundary by exactly one second, clamps to 0/duration and the 90s cap,
  // then seeks the page so the user previews the new position.
  $$("[data-step]", wrap).forEach((btn) => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.step; // "start" | "end"
      const dir = Number(btn.dataset.dir); // 1 | -1
      if (which === "start") {
        state.clipRange.start = Math.floor(state.clipRange.start) + dir;
      } else {
        state.clipRange.end = Math.floor(state.clipRange.end) + dir;
      }
      clampRange();
      state.clipRange.userTouched = true;
      update();
      finalSeek(which);
    });
  });

  $("[data-mark-in]", wrap).addEventListener("click", async () => {
    const resp = await sendBg({ type: "PAUSE_ACTIVE_TAB" });
    const time = await sendBg({
      type: "SEEK_ACTIVE_TAB",
      time: 0,
      play: false,
    });
    // Get current time via the cache-update path: ask the BG for fresh state.
    const refresh = await sendBg({ type: "GET_ACTIVE_TAB_STATE" });
    const cur = refresh?.pageMeta?.currentTime ?? state.pageMeta?.currentTime ?? 0;
    state.clipRange.start = Math.max(0, Math.floor(cur));
    if (state.clipRange.end <= state.clipRange.start) {
      state.clipRange.end = state.clipRange.start + 1;
    }
    state.clipRange.userTouched = true;
    update();
  });

  $("[data-mark-out]", wrap).addEventListener("click", async () => {
    const refresh = await sendBg({ type: "GET_ACTIVE_TAB_STATE" });
    const cur = refresh?.pageMeta?.currentTime ?? state.pageMeta?.currentTime ?? 0;
    let next = Math.max(state.clipRange.start + 1, Math.floor(cur));
    if (next - state.clipRange.start > MAX_CLIP_SECONDS) {
      next = state.clipRange.start + MAX_CLIP_SECONDS;
    }
    state.clipRange.end = next;
    state.clipRange.userTouched = true;
    update();
  });

  $("[data-preview-clip]", wrap).addEventListener("click", () => {
    sendBg({ type: "SEEK_ACTIVE_TAB", time: state.clipRange.start, play: true });
  });

  update();
  return wrap;
}

function patchRangeInputs() {
  const startMmss = document.querySelector("[data-clip-start-mmss]");
  const endMmss = document.querySelector("[data-clip-end-mmss]");
  const rangeStart = document.querySelector("[data-range-start]");
  const rangeEnd = document.querySelector("[data-range-end]");
  if (!startMmss || !endMmss || !rangeStart || !rangeEnd) return;
  const s = Math.max(0, Math.floor(state.clipRange.start));
  const e = Math.max(s + 1, Math.floor(state.clipRange.end));
  startMmss.value = fmt(s);
  endMmss.value = fmt(e);
  rangeStart.value = String(s);
  rangeEnd.value = String(e);
  const selectedRange = document.querySelector("[data-selected-range]");
  const durValue = document.querySelector("[data-duration-value]");
  if (durValue) durValue.textContent = `${e - s}s`;
  if (selectedRange) {
    const max = Number(rangeStart.max) || 10800;
    selectedRange.style.left = `${(s / max) * 100}%`;
    selectedRange.style.right = `${100 - (e / max) * 100}%`;
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
  wrap.appendChild(buildClipTextField({ rows: 4, placeholder: "Paste a passage to clip" }));
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
  const sourceTypeRaw = manualUrl ? sourceTypeForUrl(manualUrl) : meta.sourceType || "unknown";
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

async function uploadAudioIfPresent() {
  if (!state.audio?.dataUrl) return null;
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
  if (!state.user) {
    return showError(errorEl, "Sign in first to publish.");
  }
  const meta = state.pageMeta || {};
  const sourceType = meta.sourceType || "unknown";
  const commentary = ($("[data-commentary]", node)?.value || state.form.commentary || "").trim();

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
    payload.clipText = ($("[data-clip-text]", node)?.value?.trim() || state.form.clipText?.trim() || "");
    if (!payload.clipText) {
      return showError(errorEl, "Highlight or paste a passage to clip.");
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

  state.publish.status = "publishing";
  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing…";

  try {
    payload.commentaryAudioUrl = await uploadAudioIfPresent();
    const result = await api("/api/clips", { method: "POST", body: JSON.stringify(payload) });
    state.publish.status = "published";
    state.publish.annotationId = result.annotation.id;
    state.publish.pageUrlAtPublish = state.pageMeta?.url || sourceUrl;
    // Auto-reset after PUBLISH_RESET_MS
    if (state.publish.resetTimer) clearTimeout(state.publish.resetTimer);
    state.publish.resetTimer = setTimeout(() => resetPublishState(), PUBLISH_RESET_MS);
    render();
  } catch (err) {
    state.publish.status = "idle";
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
    <div class="publish-success">
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
      const url = `${state.apiBase.replace(/\/api$/, "")}/#/a/${state.publish.annotationId}`;
      if (isExtension() && chrome.tabs?.create) chrome.tabs.create({ url });
      else window.open(url, "_blank", "noopener,noreferrer");
    }
  });
  $("[data-publish-reset]", node).addEventListener("click", () => {
    resetPublishState();
  });
  return node;
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
    $("[data-claim]", card).addEventListener("click", () =>
      openClaimModal(a.id, { title: a.sourceTitle, sourceUrl: a.sourceUrl })
    );
  } catch (err) {
    card.innerHTML = `<div class="muted small">Couldn't load annotation: ${escapeHtml(err.message)}</div>`;
  }
  return node;
}

function openClaimModal(annotationId, ctx = {}) {
  const overlay = document.createElement("div");
  overlay.className = "claim-overlay";

  const dialog = document.createElement("div");
  dialog.className = "claim-dialog";
  const reasonOptions = CLAIM_REASONS.map(
    ([id, label]) => `<option value="${escapeAttr(id)}">${escapeHtml(label)}</option>`,
  ).join("");
  const isSignedIn = !!state.user;
  const prefilledName = state.user?.displayName || "";
  dialog.innerHTML = `
    <h3>Dispute this content</h3>
    <p class="muted small" style="margin: 0;">
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
    <div class="field-label">Your name</div>
    <input type="text" data-cn placeholder="Full name" value="${escapeAttr(prefilledName)}" required />
    <div class="field-label">Contact email</div>
    <input type="email" data-ce placeholder="you@example.com" required />
    <div class="field-label">Reason</div>
    <select data-rc required>
      <option value="" disabled selected>Pick the closest match…</option>
      ${reasonOptions}
    </select>
    <div class="field-label">Anything else? (optional)</div>
    <textarea data-cd rows="3" placeholder="Add context — links to your original work, what was copied, etc."></textarea>
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
  $("[data-cancel]", dialog).onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  $("[data-submit]", dialog).onclick = async () => {
    const submitBtn = $("[data-submit]", dialog);
    const name = $("[data-cn]", dialog).value.trim();
    const email = $("[data-ce]", dialog).value.trim();
    const category = $("[data-rc]", dialog).value;
    const details = $("[data-cd]", dialog).value.trim();
    if (!name || !email || !category) {
      toast("Please fill in your name, email, and a reason.", "error");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    try {
      await api(`/api/annotations/${annotationId}/claims`, {
        method: "POST",
        body: JSON.stringify({
          claimantUserId: state.user?.id ?? null,
          claimantName: name,
          claimantEmail: email,
          reasonCategory: category,
          details: details || null,
        }),
      });
      dialog.innerHTML = `
        <h3 style="display:flex; gap:8px; align-items:center;">
          <span style="display:inline-flex; width:20px; height:20px; border-radius:50%; background:var(--gradient-primary); color:var(--primary-foreground); align-items:center; justify-content:center;">✓</span>
          Claim received
        </h3>
        <p class="muted small">
          Thanks. We sent a confirmation to ${escapeHtml(email)} and notified the user who
          posted this content.
        </p>
        <p class="muted small">
          Any questions or concerns? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
        </p>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-close>Done</button>
        </div>
      `;
      $("[data-close]", dialog).onclick = () => overlay.remove();
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

  try {
    const params = new URLSearchParams(location.search);
    const override = params.get("api");
    if (override) state.apiBase = override;
  } catch {}

  await loadUser();
  refreshActiveTab();
  render();
})();
