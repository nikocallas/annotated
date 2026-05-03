// Annotated — Sidepanel UI (vanilla JS)
// Single-file SPA. Talks to the Annotated API. Designed to be loaded by Chrome
// without a build step.

const DEFAULT_API_BASE = "https://annotated-seven.vercel.app";

const state = {
  apiBase: DEFAULT_API_BASE,
  user: null,                // current logged-in user (in-memory; chrome.storage.local in real auth)
  tab: "clip",
  pageMeta: null,
  selection: null,
  detailId: null,
  recording: null,
  audioBlob: null,
  audioRecorderState: { recorder: null, start: 0, chunks: [] },
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
  const res = await fetch(state.apiBase + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
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
  }, 2400);
}

// -------------------- Routing/tabs ------------------------------------------

function setTab(tab) {
  state.tab = tab;
  state.detailId = null;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  render();
}

function showDetail(id) {
  state.detailId = id;
  render();
}

// -------------------- Persisted user (chrome.storage if available) ----------

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

// -------------------- Page detection from current tab -----------------------

function requestActiveTabState() {
  if (!isExtension() || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB_STATE" }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp?.pageMeta) state.pageMeta = resp.pageMeta;
    if (resp?.selection) state.selection = resp.selection;
    render();
  });
}

if (isExtension()) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PAGE_META_UPDATE") {
      state.pageMeta = msg.data;
      render();
    }
    if (msg?.type === "TEXT_SELECTION_UPDATE") {
      state.selection = msg.data;
      render();
    }
  });
}

// -------------------- Renderers ---------------------------------------------

function tpl(id) { return $(id).content.cloneNode(true); }

async function render() {
  const root = $("#content");
  root.innerHTML = "";
  if (!state.user) {
    return root.appendChild(renderLogin());
  }
  if (state.detailId) {
    return root.appendChild(await renderDetail(state.detailId));
  }
  if (state.tab === "clip") return root.appendChild(renderClip());
  if (state.tab === "feed") return root.appendChild(await renderFeed());
  if (state.tab === "profile") return root.appendChild(await renderProfile());
}

function renderLogin() {
  const node = tpl("#login-view");
  $$(".btn", node).forEach((btn) => {
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
  return node;
}

function renderClip() {
  const node = tpl("#clip-view");
  const meta = state.pageMeta;
  const badgeEl = $("[data-badge]", node);
  const titleEl = $("[data-title]", node);
  const authorEl = $("[data-author]", node);
  const hostEl = $("[data-host]", node);
  const sourceLinkEl = $("[data-source-link]", node);

  const sourceType = meta?.sourceType ?? "article";
  const url = meta?.url ?? "";

  badgeEl.textContent = sourceType === "youtube" ? "Video" : sourceType === "podcast" ? "Podcast" : sourceType === "article" ? "Article" : "Unknown";
  badgeEl.className = `badge ${sourceType}`;
  titleEl.textContent = meta?.title || "Open a tab to detect a source";
  authorEl.textContent = meta?.author ? `By ${meta.author}` : "";
  hostEl.textContent = url ? hostname(url) : "";
  if (url) {
    sourceLinkEl.href = url;
    sourceLinkEl.textContent = `View source on ${hostname(url)} ↗`;
    sourceLinkEl.style.display = "";
  } else {
    sourceLinkEl.style.display = "none";
  }

  // Clip-type specific UI
  const clipSection = $("[data-clip-section]", node);
  if (sourceType === "article") {
    clipSection.appendChild(renderArticleClip());
  } else if (sourceType === "youtube") {
    clipSection.appendChild(renderRangeClip("youtube"));
  } else if (sourceType === "podcast") {
    clipSection.appendChild(renderRangeClip("podcast"));
  } else {
    clipSection.appendChild(renderManualUrl());
  }

  // Audio recorder
  const recordToggle = $("[data-record-toggle]", node);
  const recordDot = $("[data-record-dot]", node);
  const recordLabel = $("[data-record-label]", node);
  const recordTime = $("[data-record-time]", node);
  const audioPreview = $("[data-audio-preview]", node);

  let timerId = null;
  recordToggle.addEventListener("click", async () => {
    const rec = state.audioRecorderState;
    if (rec.recorder && rec.recorder.state === "recording") {
      rec.recorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        state.audioBlob = blob;
        audioPreview.src = URL.createObjectURL(blob);
        audioPreview.hidden = false;
        recordDot.classList.remove("recording");
        recordLabel.textContent = "Re-record";
        clearInterval(timerId);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.recorder = recorder;
      rec.start = Date.now();
      rec.chunks = chunks;
      recorder.start();
      recordDot.classList.add("recording");
      recordLabel.textContent = "Stop recording";
      timerId = setInterval(() => {
        const elapsed = Math.floor((Date.now() - rec.start) / 1000);
        recordTime.textContent = fmt(elapsed);
      }, 250);
    } catch (err) {
      toast("Microphone permission denied", "error");
    }
  });

  // Publish
  const publishBtn = $("[data-publish]", node);
  const errorEl = $("[data-error]", node);
  publishBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    const commentary = $("[data-commentary]", node).value.trim();
    const payload = {
      userId: state.user.id,
      sourceUrl: $("[data-source-url]", node)?.value?.trim() || meta?.url || "",
      sourceType,
      sourceTitle: meta?.title || $("[data-manual-title]", node)?.value || null,
      sourceAuthor: meta?.author || null,
      sourcePublication: meta?.publication || (meta?.url ? hostname(meta.url) : null),
      sourceImage: meta?.ogImage || null,
      commentaryText: commentary || null,
      commentaryAudioUrl: null, // TODO(prod): upload state.audioBlob to /api/upload, set url here
    };

    if (sourceType === "article") {
      payload.clipText = $("[data-clip-text]", node)?.value?.trim();
      if (!payload.clipText) {
        errorEl.hidden = false; errorEl.textContent = "Highlight or paste a passage to clip.";
        return;
      }
    } else {
      payload.clipStartSec = Number($("[data-clip-start]", node)?.value || 0);
      payload.clipEndSec = Number($("[data-clip-end]", node)?.value || 0);
      const dur = payload.clipEndSec - payload.clipStartSec;
      if (dur <= 0) {
        errorEl.hidden = false; errorEl.textContent = "Clip end must be greater than start.";
        return;
      }
      if (dur > 90) {
        errorEl.hidden = false; errorEl.textContent = `Clip is ${dur}s. Max allowed is 90s.`;
        return;
      }
    }

    if (!payload.sourceUrl) {
      errorEl.hidden = false; errorEl.textContent = "Source URL is required (every clip links to source).";
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing…";
    try {
      const result = await api("/api/clips", { method: "POST", body: JSON.stringify(payload) });
      toast("Annotation published");
      state.audioBlob = null;
      // Show the new annotation
      showDetail(result.annotation.id);
    } catch (err) {
      errorEl.hidden = false; errorEl.textContent = err.message;
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "Publish annotation";
    }
  });

  return node;
}

function renderArticleClip() {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";
  const initial = state.selection?.text || "";
  wrap.innerHTML = `
    <label class="label">Highlighted passage</label>
    <textarea data-clip-text rows="5" placeholder="Highlight text on the page, or paste it here…">${escapeHtml(initial)}</textarea>
    <p class="muted small">Tip: select text on the page — it appears here automatically.</p>
  `;
  return wrap;
}

function renderRangeClip(kind) {
  const meta = state.pageMeta || {};
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";
  const startDefault = Math.floor(meta.currentTime || 0);
  const endDefault = Math.min(startDefault + 30, startDefault + 90);
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
  `;
  const startInput = $("[data-clip-start]", wrap);
  const endInput = $("[data-clip-end]", wrap);
  const durRow = $("[data-duration-display]", wrap);
  const durVal = $("[data-duration-value]", wrap);
  function updateDuration() {
    const dur = Number(endInput.value) - Number(startInput.value);
    durVal.textContent = `${dur}s`;
    durRow.classList.toggle("over", dur > 90 || dur <= 0);
  }
  startInput.addEventListener("input", updateDuration);
  endInput.addEventListener("input", updateDuration);
  return wrap;
}

function renderManualUrl() {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "8px";
  wrap.innerHTML = `
    <label class="label">No supported source detected</label>
    <input type="url" data-source-url placeholder="Paste a YouTube, podcast, or article URL" />
    <input type="text" data-manual-title placeholder="Title (optional)" />
    <textarea data-clip-text rows="3" placeholder="Or paste an article passage to clip"></textarea>
    <p class="muted small">For video/audio sources, switch back to the tab and reload — the side panel auto-detects YouTube and podcasts.</p>
  `;
  return wrap;
}

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
    <div style="font-family:'Instrument Serif', serif; font-size:20px;">Dispute this content</div>
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
  // Tab buttons
  $$(".tab").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  // Allow API base override via URL param for development.
  try {
    const params = new URLSearchParams(location.search);
    const override = params.get("api");
    if (override) state.apiBase = override;
  } catch {}

  await loadUser();
  requestActiveTabState();
  render();
})();
