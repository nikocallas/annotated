// Annotated — Content script
// Runs on every page on demand (injected by the SW under activeTab). Detects
// source type, extracts metadata, and forwards text selections to the side
// panel via the background service worker.

(function () {
  if (window.__annotatedContent) return; // idempotent
  window.__annotatedContent = true;

  function metaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content") || "";
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
      duration: video?.duration ?? null,
      currentTime: video?.currentTime ?? null,
      ogImage:
        metaContent('meta[property="og:image"]') ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
    };
  }

  function getXMeta() {
    // Best-effort detection of an X/Twitter post page: /username/status/123
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
    const audio = document.querySelector("audio");
    const video = document.querySelector("video");
    const media = audio || video;
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
      duration: media?.duration ?? null,
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

  // SPA routes (YouTube, news sites, X) update without full reload.
  let lastUrl = location.href;
  const obs = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(send, 600);
    }
  });
  obs.observe(document, { subtree: true, childList: true });

  // Periodically refresh playback time for YouTube/podcast so the side panel
  // can pre-fill clip start.
  setInterval(() => {
    const m = detect();
    if (m.sourceType === "youtube" || m.sourceType === "podcast") {
      try { chrome.runtime.sendMessage({ type: "PAGE_META", data: m }); } catch {}
    }
  }, 2500);

  // Capture text selections.
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

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "REQUEST_PAGE_META") send();
  });
})();
