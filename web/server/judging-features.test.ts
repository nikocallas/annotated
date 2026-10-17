import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { AnnotationWithRelations, User } from "@shared/schema";
import { extractHashtags, insertAnnotationSchema } from "@shared/schema";
import { ApiAuthError, type AuthService } from "./auth";
import { registerRoutes } from "./routes";
import { MemoryStorage } from "./storage";
import {
  computeTrending,
  rankForYou,
  rankSuggestedUsers,
  sourceUrlVariants,
} from "./discovery";
import { inspectJpeg, validateUploadedMedia, MediaValidationError } from "./media-validation";

// Features added from the This Week in Startups E2338 judging feedback:
// annotation types, For You, trending, people to follow, per-page lookups,
// annotation requests, email invites, and page screenshots.

function fakeAuth(usersByToken: Map<string, User>): AuthService {
  const actor = async (request: express.Request) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) return undefined;
    const user = usersByToken.get(token);
    if (!user) throw new ApiAuthError(401, "Invalid or expired session");
    return user;
  };
  return {
    optionalActor: actor,
    async requireActor(request) {
      const user = await actor(request);
      if (!user) throw new ApiAuthError(401, "Sign in required");
      return user;
    },
    async synchronizeActor(request) {
      const user = await actor(request);
      if (!user) throw new ApiAuthError(401, "Sign in required");
      return user;
    },
    async refreshSession() {
      throw new ApiAuthError(401, "Unable to refresh session");
    },
    async deleteIdentity() {},
  };
}

let storage: MemoryStorage;
let httpServer: Server;
let baseUrl = "";
let alice: User;
let bob: User;
let carol: User;
const ARTICLE = "https://www.example.com/news/story";

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { response, body: await response.json() };
}

before(async () => {
  storage = new MemoryStorage();
  alice = await storage.createUser({ username: "alice", displayName: "Alice", authProvider: "x", authId: "a" });
  bob = await storage.createUser({ username: "bob", displayName: "Bob", authProvider: "google", authId: "b" });
  carol = await storage.createUser({ username: "carol", displayName: "Carol", authProvider: "x", authId: "c" });
  const tokens = new Map([["alice", alice], ["bob", bob], ["carol", carol]]);
  const app = express();
  app.use(express.json());
  httpServer = createServer(app);
  registerRoutes(httpServer, app, { storage, storageBackend: "memory", auth: fakeAuth(tokens) });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

test("annotation type is validated and stored", async () => {
  const bad = insertAnnotationSchema.safeParse({
    sourceUrl: ARTICLE,
    sourceType: "article",
    clipText: "A sentence.",
    annotationType: "rant",
  });
  assert.equal(bad.success, false);

  const { response, body } = await call("/api/clips", {
    method: "POST",
    token: "alice",
    body: JSON.stringify({
      sourceUrl: ARTICLE,
      sourceType: "article",
      sourceTitle: "Story",
      sourcePublication: "Example News",
      clipText: "The bridge closed because of cracked welds.",
      commentaryText: "The welds were flagged in 2019. #infrastructure #budgets",
      annotationType: "dispute",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(body.annotation.annotationType, "dispute");

  const filtered = await call("/api/feed?type=dispute");
  assert.equal(filtered.body.length, 1);
  const none = await call("/api/feed?type=steelman");
  assert.equal(none.body.length, 0);
  const ignored = await call("/api/feed?type=not-a-type");
  assert.ok(ignored.body.length >= 1, "unknown types are ignored, not an error");
});

test("hashtags become feed topics", async () => {
  assert.deepEqual(extractHashtags("Read this #AI take, then #ai again and #1 #x"), ["ai"]);
  assert.deepEqual(extractHashtags("no tags here; email a#b and &#38;"), []);
  const byTag = await call("/api/feed?tag=%23Infrastructure");
  assert.equal(byTag.body.length, 1);
  const missing = await call("/api/feed?tag=sports");
  assert.equal(missing.body.length, 0);
});

test("annotation detail includes author stats for the profile panel", async () => {
  const feed = await call("/api/feed");
  const id = feed.body[0].id;
  await call(`/api/users/${alice.id}/follow`, { method: "POST", token: "bob" });
  const detail = await call(`/api/annotations/${id}`);
  assert.deepEqual(detail.body.authorStats, { followers: 1, annotations: 1 });
});

test("people worth following are real contributors, not the viewer or people already followed", async () => {
  const anon = await call("/api/users");
  assert.deepEqual(anon.body.map((u: User) => u.username), ["alice"], "users without posts are not suggested");
  assert.equal(anon.body[0].annotationCount, 1);
  assert.equal(anon.body[0].authId, undefined, "auth ids stay redacted");
  const forAlice = await call("/api/users", { token: "alice" });
  assert.deepEqual(forAlice.body, []);
  const forBob = await call("/api/users", { token: "bob" });
  assert.deepEqual(forBob.body, [], "bob already follows alice");
});

test("trending returns sources, topics, and types", async () => {
  const { body } = await call("/api/trending");
  assert.equal(body.sources[0].label, "Example News");
  assert.deepEqual(body.topics.map((t: { label: string }) => t.label).sort(), ["#budgets", "#infrastructure"]);
  assert.equal(body.types[0].key, "dispute");
});

test("page lookup finds annotations across URL spellings, and requests can be fulfilled", async () => {
  const lookup = await call(`/api/sources/annotations?url=${encodeURIComponent(`${ARTICLE}?utm_source=x#section`)}`);
  assert.equal(lookup.response.status, 200);
  assert.equal(lookup.body.annotations.length, 1);
  assert.deepEqual(lookup.body.requests, []);

  const unauthenticated = await call("/api/requests", { method: "POST", body: JSON.stringify({ sourceUrl: ARTICLE }) });
  assert.equal(unauthenticated.response.status, 401);
  const unknownUser = await call("/api/requests", {
    method: "POST",
    token: "bob",
    body: JSON.stringify({ sourceUrl: ARTICLE, requestedUsername: "@nobody" }),
  });
  assert.equal(unknownUser.response.status, 404);
  const self = await call("/api/requests", {
    method: "POST",
    token: "bob",
    body: JSON.stringify({ sourceUrl: ARTICLE, requestedUsername: "bob" }),
  });
  assert.equal(self.response.status, 400);

  const created = await call("/api/requests", {
    method: "POST",
    token: "bob",
    body: JSON.stringify({ sourceUrl: ARTICLE, sourceTitle: "Story", note: "Is this right?", requestedUsername: "@Carol" }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.requestedUser.username, "carol");
  assert.equal(created.body.user.username, "bob");

  const forCarol = await call("/api/requests?for=me", { token: "carol" });
  assert.equal(forCarol.body.length, 1);
  const pageLookup = await call(`/api/sources/annotations?url=${encodeURIComponent(ARTICLE)}`);
  assert.equal(pageLookup.body.requests.length, 1);

  // Alice cannot answer a request addressed to Carol.
  const notAddressed = await call("/api/clips", {
    method: "POST",
    token: "alice",
    body: JSON.stringify({ sourceUrl: ARTICLE, sourceType: "article", clipText: "Another line.", requestId: created.body.id }),
  });
  assert.equal(notAddressed.response.status, 201);
  assert.equal(notAddressed.body.fulfilledRequestId, null);

  const answered = await call("/api/clips", {
    method: "POST",
    token: "carol",
    body: JSON.stringify({
      sourceUrl: ARTICLE,
      sourceType: "article",
      clipText: "The bridge closed because of cracked welds.",
      commentaryText: "Checked the 2019 audit: it holds up.",
      annotationType: "fact-check",
      requestId: created.body.id,
    }),
  });
  assert.equal(answered.body.fulfilledRequestId, created.body.id);
  const after = await call(`/api/requests/${created.body.id}`);
  assert.equal(after.body.status, "fulfilled");
  assert.equal(after.body.fulfilledAnnotation.id, answered.body.annotation.id);

  const closeByOther = await call(`/api/requests/${created.body.id}/close`, { method: "POST", token: "carol" });
  assert.equal(closeByOther.response.status, 403);
});

test("for-you ranks followed authors and familiar topics first", async () => {
  const { body } = await call("/api/feed?mode=for-you", { token: "bob" });
  assert.ok(body.length >= 2);
  assert.equal(body[0].user.username, "alice", "bob follows alice");
  const anonymous = await call("/api/feed?mode=for-you");
  assert.equal(anonymous.response.status, 200);
});

test("invites validate the address and fall back to mailto without an email provider", async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const anon = await call("/api/invites", { method: "POST", body: JSON.stringify({ email: "x@example.com" }) });
    assert.equal(anon.response.status, 401);
    const invalid = await call("/api/invites", { method: "POST", token: "alice", body: JSON.stringify({ email: "nope" }) });
    assert.equal(invalid.response.status, 400);
    const fallback = await call("/api/invites", {
      method: "POST",
      token: "alice",
      body: JSON.stringify({ email: "friend@example.com", note: "<b>try this</b>" }),
    });
    assert.equal(fallback.response.status, 503);
    assert.equal(fallback.body.fallback, "mailto");
    assert.match(fallback.body.subject, /Alice invited you/);
    assert.match(fallback.body.body, /annotatedextension\.com/);
  } finally {
    if (saved) process.env.RESEND_API_KEY = saved;
  }
});

// ---------------------------------------------------------------------------
// Pure discovery functions

function post(partial: Partial<AnnotationWithRelations> & { id: string; userId: string }): AnnotationWithRelations {
  const user = { id: partial.userId, username: partial.userId, displayName: partial.userId } as User;
  return {
    sourceUrl: "https://example.com/a",
    sourceType: "article",
    sourceTitle: null,
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: null,
    clipStartSec: null,
    clipEndSec: null,
    clipText: "x",
    clipMediaUrl: null,
    clipThumbnailUrl: null,
    clipStatus: "ready",
    commentaryText: null,
    commentaryAudioUrl: null,
    annotationType: null,
    isPublic: 1,
    viewCount: 0,
    createdAt: 1_000_000,
    user,
    commentCount: 0,
    voteScore: 0,
    upvotes: 0,
    downvotes: 0,
    viewerVote: null,
    ...partial,
  };
}

test("source URL variants cover tracking params, www, YouTube, and X spellings", () => {
  const article = sourceUrlVariants("https://www.nytimes.com/2026/story.html?utm_source=x&smid=tw#comments");
  assert.ok(article.includes("https://www.nytimes.com/2026/story.html"));
  assert.ok(article.includes("https://nytimes.com/2026/story.html"));
  const yt = sourceUrlVariants("https://youtu.be/abc123?t=42");
  assert.ok(yt.includes("https://www.youtube.com/watch?v=abc123"));
  const tweet = sourceUrlVariants("https://twitter.com/Jason/status/123?s=20");
  assert.ok(tweet.includes("https://x.com/Jason/status/123"));
  assert.deepEqual(sourceUrlVariants("javascript:alert(1)"), []);
  assert.deepEqual(sourceUrlVariants("not a url"), []);
});

test("rankForYou decays old posts and boosts follows and affinity", () => {
  const now = 2_000_000;
  const fresh = post({ id: "fresh", userId: "stranger", createdAt: now - 3600 });
  const followed = post({ id: "followed", userId: "friend", createdAt: now - 7200 });
  const stale = post({ id: "stale", userId: "stranger", createdAt: now - 30 * 86400, upvotes: 50 });
  const familiar = post({
    id: "familiar",
    userId: "stranger",
    createdAt: now - 7200,
    sourcePublication: "Stratechery",
    commentaryText: "#aggregation",
  });
  const ranked = rankForYou([stale, fresh, familiar, followed], {
    followingIds: ["friend"],
    affinityPosts: [{ sourcePublication: "Stratechery", sourceUrl: "https://stratechery.com", annotationType: null, commentaryText: "#aggregation" }],
  }, now).map((a) => a.id);
  assert.equal(ranked[0], "followed");
  assert.equal(ranked[1], "familiar");
  assert.equal(ranked[ranked.length - 1], "stale");
});

test("computeTrending ignores private posts and ranks by weighted activity", () => {
  const now = 2_000_000;
  const result = computeTrending([
    post({ id: "1", userId: "u", createdAt: now, sourcePublication: "Verge", commentaryText: "#ai", annotationType: "dispute" }),
    post({ id: "2", userId: "u", createdAt: now, sourcePublication: "Verge", commentaryText: "#ai #chips" }),
    post({ id: "3", userId: "u", createdAt: now, sourcePublication: "Secret", isPublic: 0 }),
  ], { nowSec: now });
  assert.deepEqual(result.sources.map((s) => s.label), ["Verge"]);
  assert.equal(result.topics[0].label, "#ai");
  assert.equal(result.topics[0].count, 2);
  assert.equal(result.types[0].key, "dispute");
});

test("rankSuggestedUsers prefers active, followed contributors", () => {
  const mk = (id: string, createdAt = 1) => ({ id, username: id, displayName: id, createdAt } as User);
  const ranked = rankSuggestedUsers([
    { user: mk("quiet"), followers: 100, annotationCount: 0 },
    { user: mk("prolific"), followers: 1, annotationCount: 30 },
    { user: mk("popular"), followers: 40, annotationCount: 3 },
    { user: mk("me"), followers: 1000, annotationCount: 100 },
  ], { viewerId: "me" });
  assert.deepEqual(ranked.map((u) => u.username), ["prolific", "popular"]);
});

// ---------------------------------------------------------------------------
// Screenshot validation

function jpeg(width: number, height: number): Buffer {
  // SOI, APP0 (JFIF), SOF0 with dimensions, EOI — enough structure to verify.
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.from([0xff, 0xd9])]);
}

test("page screenshots must be bounded JPEGs", () => {
  const ok = inspectJpeg(jpeg(1200, 800));
  assert.equal(ok.width, 1200);
  assert.equal(ok.height, 800);
  assert.equal(validateUploadedMedia(jpeg(1600, 900), "page-screenshot").container, "jpeg");
  assert.throws(() => validateUploadedMedia(jpeg(4000, 3000), "page-screenshot"), MediaValidationError);
  assert.throws(() => validateUploadedMedia(Buffer.from("GIF89a....."), "page-screenshot"), MediaValidationError);
  assert.throws(() => validateUploadedMedia(jpeg(800, 600), "clip-video"), MediaValidationError, "JPEGs are never accepted as clips");
});
