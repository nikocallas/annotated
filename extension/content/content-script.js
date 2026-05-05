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
    const videos = Array.from(document.querySelectorAll("video"));
    if (videos.length) {
      videos.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      });
      return videos[0];
    }
    const audio = document.querySelector("audio");
    if (audio) return audio;
    return findMediaInRoot(document);
  }

  function getYouTubeMeta() {
    const url = location.href;
    let videoId = null;
    try {
      const u = new URL(url);
      videoId = u.searchParams.get("v");
      if (!videoId && /youtu\.be\//.test(url)) videoId = u.pathname.replace(/^\//, "");
    } catch {}
    const titleEl =
      document.querySelector("h1.ytd-watch-metadata") ||
      document.querySelector("h1.title");
    const channelEl =
      document.querySelector("ytd-channel-name a") ||
      document.querySelector("#channel-name a");
    const video = document.querySelector("video");
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
    if (
      /podcasts\.apple\.com|spotify\.com\/episode|overcast\.fm|pca\.st/.test(url) ||
      document.querySelector("audio")
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

  let selectionTimeout;
  document.addEventListener("mouseup", () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const sel = window.getSelection?.();
      if (!sel) return;
      const text = sel.toString().trim();
      if (text.length < 4) return;
      try {
        chrome.runtime.sendMessage({
          type: "TEXT_SELECTED",
          data: { text, url: location.href, title: document.title },
        });
      } catch {}
    }, 80);
  });

  // ---- Side-panel commands ----------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "REQUEST_PAGE_META") {
      send();
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
