// Annotated — Content script
// Runs on every page. Detects source type, extracts metadata, and forwards
// text selections to the side panel via the background service worker.

(function () {
  function getYouTubeMeta() {
    const url = location.href;
    let videoId = null;
    try {
      const u = new URL(url);
      videoId = u.searchParams.get("v");
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
      duration: video?.duration ?? null,
      currentTime: video?.currentTime ?? null,
      ogImage:
        document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
    };
  }

  function getArticleMeta() {
    const meta = (selector, attr) =>
      document.querySelector(selector)?.getAttribute(attr) || "";
    return {
      url: location.href,
      sourceType: "article",
      title:
        meta('meta[property="og:title"]', "content") ||
        meta('meta[name="twitter:title"]', "content") ||
        document.title,
      author:
        meta('meta[name="author"]', "content") ||
        meta('meta[property="article:author"]', "content") ||
        meta('meta[name="byl"]', "content") ||
        "",
      publication:
        meta('meta[property="og:site_name"]', "content") || location.hostname.replace(/^www\./, ""),
      description:
        meta('meta[name="description"]', "content") ||
        meta('meta[property="og:description"]', "content") ||
        "",
      ogImage:
        meta('meta[property="og:image"]', "content") || meta('meta[name="twitter:image"]', "content"),
    };
  }

  function getPodcastMeta() {
    const audio = document.querySelector("audio");
    return {
      url: location.href,
      sourceType: "podcast",
      title: document.title,
      author: document.querySelector('meta[name="author"]')?.getAttribute("content") || "",
      duration: audio?.duration ?? null,
      currentTime: audio?.currentTime ?? null,
      ogImage:
        document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
    };
  }

  function detect() {
    const url = location.href;
    if (/youtube\.com\/watch|youtu\.be\//.test(url)) return getYouTubeMeta();
    // Podcast heuristics: <audio> tag or known podcast hosts.
    if (
      document.querySelector("audio") ||
      /overcast\.fm|podcasts\.apple\.com|spotify\.com\/episode|pca\.st/.test(url)
    ) {
      return getPodcastMeta();
    }
    // Default to article — most pages have an <article> or article meta.
    return getArticleMeta();
  }

  function send() {
    try {
      chrome.runtime.sendMessage({ type: "PAGE_META", data: detect() });
    } catch {}
  }

  send();

  // Re-send on SPA navigations (YouTube / news sites)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(send, 600);
    }
  }).observe(document, { subtree: true, childList: true });

  // Text selection capture
  let selectionTimeout;
  document.addEventListener("mouseup", () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const sel = window.getSelection();
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

  // Service worker can ask us to resend on demand.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "REQUEST_PAGE_META") send();
  });
})();
