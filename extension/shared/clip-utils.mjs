export const MAX_CLIP_SECONDS = 90;
export const MAX_CLIP_TEXT_WORDS = 100;
export const TARGET_VIDEO_HEIGHT = 240;

export function countWords(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

export function detectSourceType(url, options = {}) {
  const xAsArticle = options.xAsArticle !== false;
  if (!url) return "unknown";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "unknown";
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
    if (host === "x.com" || host === "twitter.com") return xAsArticle ? "article" : "x";
    if (
      host === "podcasts.apple.com" ||
      host === "overcast.fm" ||
      host === "pca.st" ||
      host === "open.spotify.com"
    ) return "podcast";
    return "article";
  } catch {
    return "unknown";
  }
}

function youtubeId(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || "";
  return parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/)?.[1] || "";
}

export function sameMediaSource(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const aHost = a.hostname.replace(/^www\./, "").toLowerCase();
    const bHost = b.hostname.replace(/^www\./, "").toLowerCase();
    const youtubeHosts = new Set(["youtube.com", "youtu.be"]);
    if (youtubeHosts.has(aHost) && youtubeHosts.has(bHost)) {
      const aId = youtubeId(left);
      const bId = youtubeId(right);
      return !!aId && aId === bId;
    }
    return aHost === bHost && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

export function capturePlan(sourceType, startSec, endSec) {
  const start = Number(startSec);
  const end = Number(endSec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error("Clip end must be greater than start");
  }
  const durationSeconds = end - start;
  if (durationSeconds > MAX_CLIP_SECONDS) throw new Error("Clip exceeds the 90-second limit");
  if (sourceType !== "youtube" && sourceType !== "podcast") throw new Error("Source does not support media capture");
  return {
    kind: sourceType === "youtube" ? "video" : "audio",
    uploadKind: sourceType === "youtube" ? "clip-video" : "clip-audio",
    startSec: start,
    durationMs: durationSeconds * 1000,
    targetHeight: sourceType === "youtube" ? TARGET_VIDEO_HEIGHT : null,
  };
}

export function isValidAuthHandoff(message) {
  const auth = message?.auth;
  return !!(
    message?.type === "ANNOTATED_AUTH_SUCCESS" &&
    auth?.user &&
    typeof auth.user === "object" &&
    typeof auth.user.id === "string" &&
    typeof auth.accessToken === "string" && auth.accessToken.length > 20 &&
    typeof auth.refreshToken === "string" && auth.refreshToken.length > 20 &&
    Number.isInteger(auth.expiresAt) && auth.expiresAt > 0
  );
}

export function nextPublishStatus(current, event) {
  if (event === "start" && current === "idle") return "publishing";
  if (event === "success" && current === "publishing") return "published";
  if (event === "failure" && current === "publishing") return "idle";
  if (event === "reset" && current === "published") return "idle";
  throw new Error(`Invalid publish transition: ${current} -> ${event}`);
}
