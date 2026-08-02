// Annotated — Content script
// Runs on every page on demand (injected by the SW under activeTab). Detects
// source type, extracts metadata, and bridges the side panel <-> page video
// element so the scrubber can seek the actual playback position.

(function () {
  if (window.__annotatedContent) return; // idempotent
  window.__annotatedContent = true;

  function metaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content") || "";
  }

  // ---- Media element discovery -------------------------------------------
  // YouTube uses a single <video>. Article + podcast pages can be either.
  // Some podcast players (Spotify, Apple) hide the audio element in shadow
  // DOM — we walk shadowRoots to find it.

  function findMediaInRoot(root, visited = new Set()) {
    try {
      const direct = root.querySelector?.("video, audio");
      if (direct) return direct;
      const all = root.querySelectorAll?.("*") || [];
      for (const el of all) {
        const sr = el.shadowRoot;
        if (sr && !visited.has(sr)) {
          visited.add(sr);
          const found = findMediaInRoot(sr, visited);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  }

  function getActiveMedia() {
    // YouTube-specific: prefer the main player's <video> element directly.
    // YouTube watch pages frequently have additional <video> elements in
    // hover previews / inline ads / suggestion rails — these come earlier
    // in DOM order and confuse `document.querySelector("video")`.
    const yt =
      document.querySelector("video.html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector(".html5-video-player video");
    if (yt) return yt;

    const videos = Array.from(document.querySelectorAll("video"));
    if (videos.length) {
      // Sort by visible area, but prefer videos whose currentTime > 0 or
      // that aren't paused — those are almost certainly the one the user
      // is watching, not a stalled preview.
      videos.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const aArea = Math.max(0, ar.width) * Math.max(0, ar.height);
        const bArea = Math.max(0, br.width) * Math.max(0, br.height);
        const aScore = aArea + ((a.currentTime || 0) > 0 ? 1e6 : 0) + (!a.paused ? 1e6 : 0);
        const bScore = bArea + ((b.currentTime || 0) > 0 ? 1e6 : 0) + (!b.paused ? 1e6 : 0);
        return bScore - aScore;
      });
      return videos[0];
    }
    const audio = document.querySelector("audio");
    if (audio) return audio;
    return findMediaInRoot(document);
  }

  function isAudioMedia(media) {
    if (!media) return false;
    const tagName = media.tagName?.toLowerCase();
    if (tagName === "audio") return true;
    if (tagName !== "video") return false;
    const source = media.currentSrc || media.src || media.querySelector?.("source")?.src || "";
    const sourceType = media.querySelector?.("source")?.type || "";
    return (
      /^audio\//i.test(sourceType) ||
      /\.(?:mp3|m4a|aac|flac|oga|ogg|opus|wav)(?:$|[?#])/i.test(source) ||
      (media.readyState >= 1 && Number.isFinite(media.duration) && media.videoWidth === 0 && media.videoHeight === 0)
    );
  }

  function getYouTubeMeta() {
    const url = location.href;
    let videoId = null;
    try {
      const u = new URL(url);
      // Standard watch URL: youtube.com/watch?v=ID
      videoId = u.searchParams.get("v");
      // Short URL: youtu.be/ID
      if (!videoId && /youtu\.be\//.test(url)) {
        videoId = u.pathname.replace(/^\//, "").split("/")[0] || null;
      }
      // Shorts: youtube.com/shorts/ID
      if (!videoId) {
        const shortsMatch = u.pathname.match(/^\/shorts\/([^/?#]+)/);
        if (shortsMatch) videoId = shortsMatch[1];
      }
      // Embed URL: youtube.com/embed/ID
      if (!videoId) {
        const embedMatch = u.pathname.match(/^\/embed\/([^/?#]+)/);
        if (embedMatch) videoId = embedMatch[1];
      }
    } catch {}
    const titleEl =
      document.querySelector("h1.ytd-watch-metadata") ||
      document.querySelector("h1.title");
    const channelEl =
      document.querySelector("ytd-channel-name a") ||
      document.querySelector("#channel-name a");
    // Use getActiveMedia() so we read from the actual main player, not a
    // hover-preview <video> that happens to come first in DOM order.
    const video = getActiveMedia();
    return {
      url,
      sourceType: "youtube",
      videoId,
      title: titleEl?.textContent?.trim() || document.title,
      author: channelEl?.textContent?.trim() || "",
      publication: "YouTube",
      duration: video && isFinite(video.duration) ? video.duration : null,
      currentTime: video?.currentTime ?? null,
      ogImage:
        metaContent('meta[property="og:image"]') ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
    };
  }

  function getXMeta() {
    const url = location.href;
    const m = url.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)/i);
    return {
      url,
      sourceType: "x",
      title:
        metaContent('meta[property="og:title"]') ||
        metaContent('meta[name="twitter:title"]') ||
        document.title,
      author: m?.[1] ? `@${m[1]}` : "",
      publication: "X",
      description:
        metaContent('meta[property="og:description"]') ||
        metaContent('meta[name="twitter:description"]'),
      ogImage:
        metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]'),
    };
  }

  function getArticleMeta() {
    return {
      url: location.href,
      sourceType: "article",
      title:
        metaContent('meta[property="og:title"]') ||
        metaContent('meta[name="twitter:title"]') ||
        document.title,
      author:
        metaContent('meta[name="author"]') ||
        metaContent('meta[property="article:author"]') ||
        metaContent('meta[name="byl"]') ||
        "",
      publication:
        metaContent('meta[property="og:site_name"]') ||
        location.hostname.replace(/^www\./, ""),
      description:
        metaContent('meta[name="description"]') ||
        metaContent('meta[property="og:description"]'),
      ogImage:
        metaContent('meta[property="og:image"]') ||
        metaContent('meta[name="twitter:image"]'),
    };
  }

  function getPodcastMeta() {
    const media = getActiveMedia();
    return {
      url: location.href,
      sourceType: "podcast",
      title:
        metaContent('meta[property="og:title"]') ||
        document.title,
      author:
        metaContent('meta[name="author"]') ||
        metaContent('meta[property="og:site_name"]') ||
        "",
      publication: location.hostname.replace(/^www\./, ""),
      duration: media && isFinite(media.duration) ? media.duration : null,
      currentTime: media?.currentTime ?? null,
      ogImage:
        metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]'),
    };
  }

  function detect() {
    const url = location.href;
    const host = location.hostname.replace(/^www\./, "");
    if (/youtube\.com\/watch|youtu\.be\//.test(url) || host === "youtube.com") {
      return getYouTubeMeta();
    }
    if (host === "x.com" || host === "twitter.com") {
      return getXMeta();
    }
    const activeMedia = getActiveMedia();
    if (
      /podcasts\.apple\.com|spotify\.com\/episode|overcast\.fm|pca\.st/.test(url) ||
      metaContent('meta[property="og:audio"]') ||
      /^audio\//i.test(metaContent('meta[name="twitter:player:stream:content_type"]')) ||
      document.querySelector("audio") ||
      isAudioMedia(activeMedia)
    ) {
      return getPodcastMeta();
    }
    return getArticleMeta();
  }

  function send() {
    try { chrome.runtime.sendMessage({ type: "PAGE_META", data: detect() }); } catch {}
  }

  send();

  // ---- Live playback time updates ---------------------------------------
  // Hook media events so we can import scrubs the user does on the page
  // itself as the annotation start time. Push lightweight TIME_UPDATE
  // messages, throttled, and an immediate one on user "seeked".

  let lastTimeSent = 0;
  let lastTimeValue = -1;
  function pushTime(reason) {
    const m = getActiveMedia();
    if (!m) return;
    const now = Date.now();
    const threshold = reason === "seek" ? 0 : 350;
    if (now - lastTimeSent < threshold) return;
    if (Math.abs((m.currentTime ?? 0) - lastTimeValue) < 0.05 && reason !== "seek") return;
    lastTimeSent = now;
    lastTimeValue = m.currentTime ?? 0;
    try {
      chrome.runtime.sendMessage({
        type: "MEDIA_TIME",
        data: {
          currentTime: m.currentTime ?? null,
          duration: isFinite(m.duration) ? m.duration : null,
          paused: !!m.paused,
          reason,
        },
      });
    } catch {}
  }

  const wired = new WeakSet();
  function wireMedia(el) {
    if (!el || wired.has(el)) return;
    wired.add(el);
    el.addEventListener("seeked", () => pushTime("seek"));
    el.addEventListener("timeupdate", () => pushTime("playing"));
    el.addEventListener("loadedmetadata", () => send());
    el.addEventListener("durationchange", () => send());
    el.addEventListener("play", () => pushTime("play"));
    el.addEventListener("pause", () => pushTime("pause"));
  }

  function discoverAndWire() {
    document.querySelectorAll("video, audio").forEach(wireMedia);
    const shadowMedia = findMediaInRoot(document);
    if (shadowMedia) wireMedia(shadowMedia);
  }
  discoverAndWire();

  // ---- DOM observers -----------------------------------------------------

  let lastUrl = location.href;
  const obs = new MutationObserver((mutations) => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(send, 600);
    }
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n instanceof HTMLMediaElement) wireMedia(n);
        n.querySelectorAll?.("video, audio").forEach(wireMedia);
      }
    }
  });
  obs.observe(document, { subtree: true, childList: true });

  setInterval(() => {
    discoverAndWire();
    const m = detect();
    if (m.sourceType === "youtube" || m.sourceType === "podcast") {
      try { chrome.runtime.sendMessage({ type: "PAGE_META", data: m }); } catch {}
    }
  }, 2500);

  // ---- Text selections ---------------------------------------------------
  // Capture text the user highlights on the page and forward it to the side
  // panel so it can auto-populate the article/quote field. We listen on
  // multiple events so plain mouse drags, keyboard selections, double/triple
  // clicks, touch selections, and edits inside an <input>/<textarea> all
  // surface. Shadow DOM is best-effort: window.getSelection() in shadow roots
  // is generally not exposed, but selections in light DOM still work.

  function getSelectionText() {
    // Prefer activeElement selection inside <input>/<textarea> — these are
    // not reflected in window.getSelection().
    const ae = document.activeElement;
    if (ae && (ae.tagName === "TEXTAREA" || (ae.tagName === "INPUT" && /^(text|search|url|email)$/i.test(ae.type)))) {
      try {
        const start = ae.selectionStart;
        const end = ae.selectionEnd;
        if (start != null && end != null && end > start) {
          return (ae.value || "").slice(start, end);
        }
      } catch {}
    }
    const sel = window.getSelection?.();
    if (!sel) return "";
    return sel.toString();
  }

  let lastSentSelection = "";
  let selectionTimeout;
  function pushSelection(reason) {
    const raw = getSelectionText();
    const text = (raw || "").replace(/\s+\n/g, "\n").trim();
    if (text.length < 2) return;
    if (text === lastSentSelection) return;
    lastSentSelection = text;
    try {
      chrome.runtime.sendMessage({
        type: "TEXT_SELECTED",
        data: {
          text,
          url: location.href,
          title: document.title,
          reason: reason || "selection",
          capturedAt: Date.now(),
        },
      });
    } catch {}
  }

  function scheduleSelectionPush(reason, delay = 80) {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => pushSelection(reason), delay);
  }

  // Mouse / touch — wait for the user to release before reading the selection.
  document.addEventListener("mouseup", () => scheduleSelectionPush("mouseup", 60));
  document.addEventListener("touchend", () => scheduleSelectionPush("touchend", 80), { passive: true });

  // Keyboard selections (Shift+arrow, Ctrl/Cmd+A, etc.) — listen on selectionchange
  // which fires for all selection updates. Throttle to avoid flooding while
  // the user holds Shift+arrow.
  document.addEventListener("selectionchange", () => scheduleSelectionPush("selectionchange", 220));

  // Double-click word selection lands faster via a dblclick listener.
  document.addEventListener("dblclick", () => scheduleSelectionPush("dblclick", 30));

  // Side-panel asking us for whatever's currently highlighted (the "import
  // selection" button). Reply with current selection synchronously and also
  // push it through the normal channel.
  function getCurrentSelectionPayload() {
    const raw = getSelectionText();
    const text = (raw || "").replace(/\s+\n/g, "\n").trim();
    return {
      text,
      url: location.href,
      title: document.title,
      capturedAt: Date.now(),
    };
  }

  // ---- Side-panel commands ----------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "REQUEST_PAGE_META") {
      send();
      return false;
    }
    if (msg?.type === "REQUEST_SELECTION") {
      const payload = getCurrentSelectionPayload();
      // Force-resend even if it matches lastSentSelection so the side panel
      // can override its manual-edit guard when the user explicitly asks.
      lastSentSelection = "";
      sendResponse(payload);
      return false;
    }
    if (msg?.type === "GET_MEDIA_TIME") {
      const m = getActiveMedia();
      sendResponse({
        currentTime: m?.currentTime ?? null,
        duration: m && isFinite(m.duration) ? m.duration : null,
        paused: m ? !!m.paused : null,
      });
      return false;
    }
    if (msg?.type === "SET_MEDIA_TIME") {
      const m = getActiveMedia();
      if (!m) {
        sendResponse({ ok: false, error: "no_media" });
        return false;
      }
      try {
        const target = Math.max(0, Number(msg.time) || 0);
        m.currentTime = target;
        if (msg.play) {
          const p = m.play?.();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } else {
          // Range edits are positioning gestures, not playback gestures.
          // Freeze on the exact selected second so the page cannot drift
          // forward while the user refines the opposite boundary.
          try { m.pause?.(); } catch {}
        }
        sendResponse({ ok: true, currentTime: m.currentTime });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
      return false;
    }
    if (msg?.type === "PAUSE_MEDIA") {
      const m = getActiveMedia();
      try { m?.pause?.(); } catch {}
      sendResponse({ ok: true });
      return false;
    }
    if (msg?.type === "PLAY_MEDIA") {
      const m = getActiveMedia();
      try { m?.play?.()?.catch?.(() => {}); } catch {}
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
