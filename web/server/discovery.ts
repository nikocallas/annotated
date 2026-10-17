import {
  extractHashtags,
  type AnnotationWithRelations,
  type User,
} from "@shared/schema";

/**
 * Discovery logic for the feed: For You ranking, trending sources and topics,
 * suggested people, and source-URL matching. Everything here is a pure
 * function of data the storage layer already returns, so it is unit-testable
 * and identical across the Supabase and in-memory backends.
 */

// ---------------------------------------------------------------------------
// Source URL matching

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "si",
  "ref", "ref_src", "ref_url", "s", "t", "smid", "cmpid", "ocid",
]);

function stripTracking(url: URL): URL {
  const next = new URL(url.toString());
  for (const key of Array.from(next.searchParams.keys())) {
    if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) next.searchParams.delete(key);
  }
  next.hash = "";
  return next;
}

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return v;
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}

function xStatusId(url: URL): { handle: string; id: string } | null {
  const host = url.hostname.replace(/^www\.|^mobile\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const m = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  return m ? { handle: m[1], id: m[2] } : null;
}

/**
 * Every spelling of a source URL that should count as "the same page", so the
 * side panel can find existing annotations and open requests for the tab the
 * user is on. Bounded so the resulting `IN (...)` filter stays small.
 */
export function sourceUrlVariants(raw: string): string[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];
  const variants = new Set<string>();
  const add = (u: URL | string) => variants.add(typeof u === "string" ? u : u.toString());

  add(raw);
  const noHash = new URL(url.toString());
  noHash.hash = "";
  add(noHash);
  const clean = stripTracking(url);
  add(clean);
  for (const base of [noHash, clean]) {
    const s = base.toString();
    if (base.search === "" && base.pathname.length > 1) {
      add(s.endsWith("/") ? s.slice(0, -1) : `${s}/`);
    }
    if (base.protocol === "http:") add(s.replace(/^http:/, "https:"));
    if (base.hostname.startsWith("www.")) add(s.replace("://www.", "://"));
    else add(s.replace("://", "://www."));
  }

  const yt = youtubeId(url);
  if (yt) {
    add(`https://www.youtube.com/watch?v=${yt}`);
    add(`https://youtube.com/watch?v=${yt}`);
    add(`https://m.youtube.com/watch?v=${yt}`);
    add(`https://youtu.be/${yt}`);
  }
  const tweet = xStatusId(url);
  if (tweet) {
    add(`https://x.com/${tweet.handle}/status/${tweet.id}`);
    add(`https://twitter.com/${tweet.handle}/status/${tweet.id}`);
  }
  return Array.from(variants).slice(0, 24);
}

// ---------------------------------------------------------------------------
// Shared helpers

export function publicationOf(a: Pick<AnnotationWithRelations, "sourcePublication" | "sourceUrl">): string {
  if (a.sourcePublication && a.sourcePublication.trim()) return a.sourcePublication.trim();
  try {
    return new URL(a.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function engagement(a: AnnotationWithRelations): number {
  const net = Math.max(0, (a.upvotes ?? 0) - (a.downvotes ?? 0));
  return (
    Math.log1p(net) * 1.2 +
    Math.log1p(a.commentCount ?? 0) * 1.0 +
    Math.log1p(a.viewCount ?? 0) * 0.25
  );
}

function ageHours(a: AnnotationWithRelations, nowSec: number): number {
  return Math.max(0, (nowSec - a.createdAt) / 3600);
}

// ---------------------------------------------------------------------------
// For You

export interface ForYouSignals {
  viewerId?: string | null;
  followingIds: string[];
  /** Posts the viewer wrote or saved: their sources, types, and tags. */
  affinityPosts: Pick<AnnotationWithRelations, "sourcePublication" | "sourceUrl" | "annotationType" | "commentaryText">[];
}

/**
 * Ranks candidate posts for one viewer. Signals, strongest first: posts from
 * people they follow, posts about sources/types/topics they have engaged with,
 * then community engagement, all decayed by age so the feed keeps moving.
 */
export function rankForYou(
  candidates: AnnotationWithRelations[],
  signals: ForYouSignals,
  nowSec = Math.floor(Date.now() / 1000),
): AnnotationWithRelations[] {
  const following = new Set(signals.followingIds);
  const pubWeight = new Map<string, number>();
  const typeWeight = new Map<string, number>();
  const tagWeight = new Map<string, number>();
  for (const p of signals.affinityPosts) {
    const pub = publicationOf(p);
    pubWeight.set(pub, (pubWeight.get(pub) ?? 0) + 1);
    if (p.annotationType) typeWeight.set(p.annotationType, (typeWeight.get(p.annotationType) ?? 0) + 1);
    for (const tag of extractHashtags(p.commentaryText)) tagWeight.set(tag, (tagWeight.get(tag) ?? 0) + 1);
  }

  const scored = candidates.map((a) => {
    let personal = 0;
    if (following.has(a.userId)) personal += 3;
    personal += Math.min(2, Math.log1p(pubWeight.get(publicationOf(a)) ?? 0) * 1.5);
    if (a.annotationType) personal += Math.min(1.5, Math.log1p(typeWeight.get(a.annotationType) ?? 0));
    for (const tag of extractHashtags(a.commentaryText)) {
      personal += Math.min(1, Math.log1p(tagWeight.get(tag) ?? 0));
    }
    // Your own posts are already familiar; keep them, but below discoveries.
    if (signals.viewerId && a.userId === signals.viewerId) personal -= 2;
    const decay = Math.exp(-ageHours(a, nowSec) / 96);
    return { a, score: (1 + engagement(a) + personal) * decay };
  });

  return scored
    .sort((x, y) => y.score - x.score || y.a.createdAt - x.a.createdAt)
    .map((s) => s.a);
}

// ---------------------------------------------------------------------------
// Trending

export interface TrendingItem {
  key: string;
  label: string;
  count: number;
  score: number;
}

export interface TrendingResult {
  sources: TrendingItem[];
  topics: TrendingItem[];
  types: TrendingItem[];
}

/**
 * Trending sources, topics (hashtags), and annotation types over recent public
 * posts. Each post contributes 1 plus its engagement, decayed by age.
 */
export function computeTrending(
  posts: AnnotationWithRelations[],
  options: { limit?: number; nowSec?: number } = {},
): TrendingResult {
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const limit = options.limit ?? 6;
  const sources = new Map<string, TrendingItem>();
  const topics = new Map<string, TrendingItem>();
  const types = new Map<string, TrendingItem>();
  const bump = (map: Map<string, TrendingItem>, key: string, label: string, weight: number) => {
    const cur = map.get(key) ?? { key, label, count: 0, score: 0 };
    cur.count += 1;
    cur.score += weight;
    map.set(key, cur);
  };
  for (const a of posts) {
    if (a.isPublic !== 1) continue;
    const weight = (1 + engagement(a)) * Math.exp(-ageHours(a, nowSec) / 72);
    const pub = publicationOf(a);
    bump(sources, pub.toLowerCase(), pub, weight);
    for (const tag of extractHashtags(a.commentaryText)) bump(topics, tag, `#${tag}`, weight);
    if (a.annotationType) bump(types, a.annotationType, a.annotationType, weight);
  }
  const top = (map: Map<string, TrendingItem>) =>
    Array.from(map.values())
      .sort((x, y) => y.score - x.score || y.count - x.count || x.label.localeCompare(y.label))
      .slice(0, limit)
      .map((item) => ({ ...item, score: Math.round(item.score * 100) / 100 }));
  return { sources: top(sources), topics: top(topics), types: top(types) };
}

// ---------------------------------------------------------------------------
// Suggested people

export interface SuggestedUser extends User {
  followers: number;
  annotationCount: number;
}

/**
 * People worth following: real contributors ranked by how much they publish
 * and how many people already follow them. Accounts with no public posts are
 * not suggested, and the viewer and people they already follow are excluded.
 */
export function rankSuggestedUsers(
  users: { user: User; followers: number; annotationCount: number }[],
  options: { viewerId?: string | null; excludeIds?: string[]; limit?: number } = {},
): SuggestedUser[] {
  const exclude = new Set(options.excludeIds ?? []);
  if (options.viewerId) exclude.add(options.viewerId);
  return users
    .filter((u) => !exclude.has(u.user.id) && u.annotationCount > 0)
    .map((u) => ({
      ...u.user,
      followers: u.followers,
      annotationCount: u.annotationCount,
      _score: Math.log1p(u.annotationCount) * 2 + Math.log1p(u.followers),
    }))
    .sort((a, b) => b._score - a._score || b.createdAt - a.createdAt)
    .slice(0, options.limit ?? 5)
    .map(({ _score: _ignored, ...rest }) => rest);
}
