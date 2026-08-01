import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import type { Annotation, Claim, User } from "@shared/schema";
import { ApiAuthError, type AuthService } from "./auth";
import type { ClaimModerationService } from "./claim-moderation";
import type { ClaimEmailDispatchSummary } from "./claim-email";
import { registerRoutes } from "./routes";
import type { MediaStorageService, MediaUploadRow } from "./media-storage";
import { MemoryStorage, type IStorage } from "./storage";

interface Harness {
  baseUrl: string;
  close(): Promise<void>;
}

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

const notificationEvents: Array<{ claimId: string; summary: ClaimEmailDispatchSummary }> = [];
const moderation: ClaimModerationService = {
  isModerator(user) {
    return user.authId === "auth-owner";
  },
  async recordNotifications(claimId, summary) {
    notificationEvents.push({ claimId, summary });
  },
  async listClaims() {
    return [{ id: "reviewable-claim", status: "received", events: [] }];
  },
  async moderate(claimId, status, _note, actor) {
    return {
      id: claimId,
      annotationId: "annotation",
      claimantUserId: null,
      claimantName: "Claimant",
      claimantEmail: "claimant@example.com",
      reasonCategory: "other",
      reason: "Other copyright or fair use concern",
      details: null,
      status,
      createdAt: 1,
    } as Claim;
  },
};
const claimEmailDispatcher = async (): Promise<ClaimEmailDispatchSummary> => ({
  filer: { sent: true },
  poster: { sent: true },
  support: { sent: true },
});

async function harness(
  storage: IStorage,
  auth: AuthService,
  mediaStorage?: MediaStorageService,
  claimModeration: ClaimModerationService = moderation,
  emailDispatcher: typeof claimEmailDispatcher = claimEmailDispatcher,
): Promise<Harness> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const server = createServer(app);
  registerRoutes(server, app, {
    storage,
    storageBackend: "memory",
    auth,
    claimModeration,
    claimEmailDispatcher: emailDispatcher,
    mediaStorage,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function jsonRequest(baseUrl: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json();
  return { response, body };
}

let storage: MemoryStorage;
let server: Harness;
let owner: User;
let attacker: User;

before(async () => {
  storage = new MemoryStorage();
  owner = await storage.createUser({
    username: "owner",
    displayName: "Owner",
    avatarUrl: null,
    bio: null,
    authProvider: "google",
    authId: "auth-owner",
  });
  attacker = await storage.createUser({
    username: "attacker",
    displayName: "Attacker",
    avatarUrl: null,
    bio: null,
    authProvider: "x",
    authId: "auth-attacker",
  });
  server = await harness(storage, fakeAuth(new Map([
    ["owner-token", owner],
    ["attacker-token", attacker],
  ])));
});

after(async () => {
  await server.close();
});

test("anonymous mutations return 401 even when a userId is spoofed", async () => {
  const { response, body } = await jsonRequest(server.baseUrl, "/api/clips", {
    method: "POST",
    body: JSON.stringify({
      userId: owner.id,
      sourceUrl: "https://example.com/article",
      sourceType: "article",
      clipText: "A short source passage — punctuation intact.",
      sourceTitle: "Exact source title",
      sourceAuthor: "Source Author",
      sourcePublication: "Example Journal",
      sourceImage: "http://example.com/insecure.jpg",
    }),
  });
  assert.equal(response.status, 401);
  assert.equal(body.error, "Sign in required");
});

test("all retained authenticated mutation families reject anonymous requests", async () => {
  const annotation = await storage.createAnnotation({
    userId: owner.id,
    sourceUrl: "https://example.com/protected-actions",
    sourceType: "article",
    clipText: "Protected action passage.",
    clipStartSec: null,
    clipEndSec: null,
    sourceTitle: "Protected",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "Example",
    commentaryText: null,
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  const cases = [
    ["POST", `/api/users/${owner.id}/follow`, { followerId: attacker.id }],
    ["POST", `/api/annotations/${annotation.id}/comments`, { userId: attacker.id, body: "spoof" }],
    ["POST", `/api/annotations/${annotation.id}/vote`, { userId: attacker.id, value: 1 }],
    ["POST", `/api/annotations/${annotation.id}/bookmark`, { userId: attacker.id }],
    ["DELETE", `/api/annotations/${annotation.id}`, { userId: attacker.id }],
    ["POST", "/api/uploads/sign", { userId: attacker.id, kind: "clip-video", mime: "video/webm", sizeBytes: 10 }],
  ] as const;
  for (const [method, path, body] of cases) {
    const result = await jsonRequest(server.baseUrl, path, { method, body: JSON.stringify(body) });
    assert.equal(result.response.status, 401, `${method} ${path}`);
  }
});

test("authenticated writes derive ownership from the bearer token", async () => {
  const { response, body } = await jsonRequest(server.baseUrl, "/api/clips", {
    method: "POST",
    headers: { Authorization: "Bearer owner-token" },
    body: JSON.stringify({
      userId: attacker.id,
      sourceUrl: "https://example.com/article",
      sourceType: "article",
      clipText: "A short source passage — punctuation intact.",
      sourceTitle: "Exact source title",
      sourceAuthor: "Source Author",
      sourcePublication: "Example Journal",
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(body.annotation.userId, owner.id);
  assert.equal(body.annotation.clipText, "A short source passage — punctuation intact.");
  assert.equal(body.annotation.sourceTitle, "Exact source title");
  assert.equal(body.annotation.sourceAuthor, "Source Author");
  assert.equal(body.annotation.sourcePublication, "Example Journal");
  assert.equal(body.annotation.sourceImage, null);
});

test("signed upload and finalization bind the verified actor and publish only after attachment", async () => {
  const events: string[] = [];
  class OrderedStorage extends MemoryStorage {
    override async updateAnnotation(id: string, data: Partial<Annotation>) {
      if (data.isPublic === 1) events.push("publish");
      return super.updateAnnotation(id, data);
    }
  }
  const isolatedStorage = new OrderedStorage();
  const mediaOwner = await isolatedStorage.createUser({
    username: "media_owner",
    displayName: "Media Owner",
    avatarUrl: null,
    bio: null,
    authProvider: "google",
    authId: "media-owner-auth",
  });
  const mediaAttacker = await isolatedStorage.createUser({
    username: "media_attacker",
    displayName: "Media Attacker",
    avatarUrl: null,
    bio: null,
    authProvider: "x",
    authId: "media-attacker-auth",
  });
  const row = (userId: string): MediaUploadRow => ({
    id: "upload-1",
    user_id: userId,
    annotation_id: null,
    kind: "clip-video",
    bucket: "clip-media",
    object_path: `${userId}/clip-video/upload-1.webm`,
    mime: "video/webm",
    status: "pending",
    bytes: null,
    duration_seconds: null,
    width: null,
    height: null,
    has_video: null,
    has_audio: null,
    public_url: null,
    created_at: 1,
  });
  const mediaStorage: MediaStorageService = {
    async healthCheck() {},
    async createSignedMediaUpload(input) {
      events.push(`sign:${input.userId}`);
      return {
        uploadId: "upload-1",
        kind: "clip-video",
        bucket: "clip-media",
        path: `${input.userId}/clip-video/upload-1.webm`,
        signedUrl: "https://storage.example.com/signed",
        token: "signed-token",
        mime: "video/webm",
        maxBytes: 20 * 1024 * 1024,
      };
    },
    async inspectMediaUpload(userId) {
      events.push("inspect");
      return row(userId);
    },
    async finalizeMediaUpload({ userId }) {
      events.push("finalize");
      return {
        uploadId: "upload-1",
        kind: "clip-video",
        bucket: "clip-media",
        path: `${userId}/clip-video/upload-1.webm`,
        url: "https://storage.example.com/public/upload-1.webm",
        bytes: 1024,
        mime: "video/webm",
        durationSeconds: 61,
        width: 426,
        height: 240,
        container: "webm",
        hasVideo: true,
        hasAudio: true,
      };
    },
    async readyMediaUpload(userId) {
      return {
        ...row(userId),
        kind: "commentary-audio",
        bucket: "commentary-audio",
        object_path: `${userId}/commentary-audio/upload-1.webm`,
        mime: "audio/webm",
        status: "ready",
        public_url: "http://127.0.0.1:54321/storage/v1/object/public/commentary.webm",
      };
    },
    async attachMediaUpload() { events.push("attach"); },
    async deleteAnnotationMedia() {},
    async cleanupExpiredMediaUploads() { return { scanned: 0, removed: 0, failures: 0 }; },
    async deleteAllUserMedia() {},
  };
  const isolated = await harness(
    isolatedStorage,
    fakeAuth(new Map([
      ["media-owner-token", mediaOwner],
      ["media-attacker-token", mediaAttacker],
    ])),
    mediaStorage,
  );
  try {
    const signed = await jsonRequest(isolated.baseUrl, "/api/uploads/sign", {
      method: "POST",
      headers: { Authorization: "Bearer media-owner-token" },
      body: JSON.stringify({
        userId: mediaAttacker.id,
        kind: "clip-video",
        mime: "video/webm",
        sizeBytes: 1024,
      }),
    });
    assert.equal(signed.response.status, 201);
    assert.equal(signed.body.path, `${mediaOwner.id}/clip-video/upload-1.webm`);

    const created = await jsonRequest(isolated.baseUrl, "/api/clips", {
      method: "POST",
      headers: { Authorization: "Bearer media-owner-token" },
      body: JSON.stringify({
        sourceUrl: "https://www.youtube.com/watch?v=media-contract",
        sourceType: "youtube",
        sourceTitle: "Media contract",
        clipStartSec: 5,
        clipEndSec: 66,
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.annotation.isPublic, 0);

    events.length = 0;
    const finalized = await jsonRequest(isolated.baseUrl, "/api/uploads/finalize", {
      method: "POST",
      headers: { Authorization: "Bearer media-owner-token" },
      body: JSON.stringify({ uploadId: "upload-1", annotationId: created.body.annotation.id }),
    });
    assert.equal(finalized.response.status, 201);
    assert.deepEqual(events, ["inspect", "finalize", "attach", "publish"]);
    assert.equal((await isolatedStorage.getAnnotation(created.body.annotation.id))?.isPublic, 1);

    events.length = 0;
    const crossUser = await jsonRequest(isolated.baseUrl, "/api/uploads/finalize", {
      method: "POST",
      headers: { Authorization: "Bearer media-attacker-token" },
      body: JSON.stringify({ uploadId: "upload-1", annotationId: created.body.annotation.id }),
    });
    assert.equal(crossUser.response.status, 403);
    assert.deepEqual(events, ["inspect"]);

    events.length = 0;
    const article = await jsonRequest(isolated.baseUrl, "/api/clips", {
      method: "POST",
      headers: { Authorization: "Bearer media-owner-token" },
      body: JSON.stringify({
        sourceUrl: "https://example.com/trusted-commentary",
        sourceType: "article",
        sourceTitle: "Trusted commentary",
        clipText: "An exact passage with verified audio commentary.",
        commentaryAudioUploadId: "upload-1",
      }),
    });
    assert.equal(article.response.status, 201);
    assert.match(article.body.annotation.commentaryAudioUrl, /^http:\/\/127\.0\.0\.1/);
    assert.deepEqual(events, ["attach"]);
  } finally {
    await isolated.close();
  }
});

test("a media range over 90 seconds is rejected before annotation creation", async () => {
  const before = await storage.listAnnotations({ userId: owner.id, viewerUserId: owner.id });
  const { response } = await jsonRequest(server.baseUrl, "/api/clips", {
    method: "POST",
    headers: { Authorization: "Bearer owner-token" },
    body: JSON.stringify({
      sourceUrl: "https://www.youtube.com/watch?v=duration-test",
      sourceType: "youtube",
      sourceTitle: "Too long",
      clipStartSec: 0,
      clipEndSec: 91,
    }),
  });
  assert.equal(response.status, 400);
  const after = await storage.listAnnotations({ userId: owner.id, viewerUserId: owner.id });
  assert.equal(after.length, before.length);
});

test("processing and failed media annotations stay private until verified", async () => {
  const privateClip = await storage.createAnnotation({
    userId: owner.id,
    sourceUrl: "https://www.youtube.com/watch?v=private-clip",
    sourceType: "youtube",
    clipText: null,
    clipStartSec: 0,
    clipEndSec: 30,
    sourceTitle: "Processing",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "YouTube",
    commentaryText: null,
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  assert.equal(privateClip.isPublic, 0);
  const anonymous = await jsonRequest(server.baseUrl, `/api/annotations/${privateClip.id}`);
  assert.equal(anonymous.response.status, 404);
  const owned = await jsonRequest(server.baseUrl, `/api/annotations/${privateClip.id}`, {
    headers: { Authorization: "Bearer owner-token" },
  });
  assert.equal(owned.response.status, 200);
  assert.equal(owned.body.clipStatus, "processing");
});

test("one authenticated user cannot delete another user's annotation", async () => {
  const annotation = await storage.createAnnotation({
    userId: owner.id,
    sourceUrl: "https://example.com/owned",
    sourceType: "article",
    clipText: "Owned passage",
    clipStartSec: null,
    clipEndSec: null,
    sourceTitle: "Owned",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "Example",
    commentaryText: null,
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  const { response } = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer attacker-token" },
    body: JSON.stringify({ userId: owner.id }),
  });
  assert.equal(response.status, 403);
  assert(await storage.getAnnotation(annotation.id));
});

test("claims are recorded anonymously, notifications are audited, and moderator access is scoped", async () => {
  const annotation = await storage.createAnnotation({
    userId: owner.id,
    sourceUrl: "https://example.com/claim-source",
    sourceType: "article",
    clipText: "A passage under review.",
    clipStartSec: null,
    clipEndSec: null,
    sourceTitle: "Claim source",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "Example",
    commentaryText: "Commentary",
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  const submitted = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}/claims`, {
    method: "POST",
    body: JSON.stringify({
      claimantName: "Rights Holder",
      claimantEmail: "rights@example.com",
      reasonCategory: "uses_too_much",
      details: "This selection contains the heart of the work.",
    }),
  });
  assert.equal(submitted.response.status, 201);
  assert.equal(submitted.body.claim.claimantUserId, null);
  assert.equal(submitted.body.notifications.confirmationSent, true);
  assert(notificationEvents.some((event) => event.claimId === submitted.body.claim.id));

  const denied = await jsonRequest(server.baseUrl, "/api/admin/claims", {
    headers: { Authorization: "Bearer attacker-token" },
  });
  assert.equal(denied.response.status, 403);
  const listed = await jsonRequest(server.baseUrl, "/api/admin/claims", {
    headers: { Authorization: "Bearer owner-token" },
  });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.claims[0].id, "reviewable-claim");
  const moderated = await jsonRequest(server.baseUrl, `/api/admin/claims/${submitted.body.claim.id}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner-token" },
    body: JSON.stringify({ status: "reviewing", note: "Ownership evidence received." }),
  });
  assert.equal(moderated.response.status, 200);
  assert.equal(moderated.body.claim.status, "reviewing");
});

test("query limits stay finite and bounded before reaching storage or moderation", async () => {
  class RecordingStorage extends MemoryStorage {
    readonly limits: number[] = [];

    override async listAnnotations(opts: Parameters<MemoryStorage["listAnnotations"]>[0] = {}) {
      this.limits.push(opts.limit ?? 50);
      return super.listAnnotations(opts);
    }
  }

  const isolatedStorage = new RecordingStorage();
  const moderator = await isolatedStorage.createUser({
    username: "limit_moderator",
    displayName: "Limit Moderator",
    avatarUrl: null,
    bio: null,
    authProvider: "google",
    authId: "limit-moderator-subject",
  });
  const moderationLimits: number[] = [];
  const isolatedModeration: ClaimModerationService = {
    ...moderation,
    isModerator: () => true,
    async listClaims(limit) {
      moderationLimits.push(limit);
      return [];
    },
  };
  const isolated = await harness(
    isolatedStorage,
    fakeAuth(new Map([["moderator-token", moderator]])),
    undefined,
    isolatedModeration,
  );
  try {
    for (const value of ["NaN", "-3", "9999"]) {
      assert.equal((await jsonRequest(isolated.baseUrl, `/api/feed?limit=${value}`)).response.status, 200);
      assert.equal((await jsonRequest(isolated.baseUrl, `/api/admin/claims?limit=${value}`, {
        headers: { Authorization: "Bearer moderator-token" },
      })).response.status, 200);
    }
    assert.deepEqual(isolatedStorage.limits, [60, 1, 100]);
    assert.deepEqual(moderationLimits, [100, 1, 200]);
  } finally {
    await isolated.close();
  }
});

test("claim notification failures do not log raw provider errors", async () => {
  const isolatedStorage = new MemoryStorage();
  const poster = await isolatedStorage.createUser({
    username: "log_safe_poster",
    displayName: "Log Safe Poster",
    avatarUrl: null,
    bio: null,
    authProvider: "google",
    authId: "log-safe-subject",
  });
  const annotation = await isolatedStorage.createAnnotation({
    userId: poster.id,
    sourceUrl: "https://example.com/log-safe-claim",
    sourceType: "article",
    clipText: "A passage with a notification failure.",
    clipStartSec: null,
    clipEndSec: null,
    sourceTitle: "Log-safe claim",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "Example",
    commentaryText: null,
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  const isolated = await harness(
    isolatedStorage,
    fakeAuth(new Map()),
    undefined,
    moderation,
    async () => { throw new Error("provider payload includes rights-holder@example.com"); },
  );
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const result = await jsonRequest(isolated.baseUrl, `/api/annotations/${annotation.id}/claims`, {
      method: "POST",
      body: JSON.stringify({
        claimantName: "Rights Holder",
        claimantEmail: "rights-holder@example.com",
        reasonCategory: "other",
      }),
    });
    assert.equal(result.response.status, 201);
    const serialized = JSON.stringify(logged);
    assert.match(serialized, /claim_notification_dispatch_failed/);
    assert.doesNotMatch(serialized, /rights-holder@example\.com|provider payload/);
  } finally {
    console.error = originalError;
    await isolated.close();
  }
});

test("follow, comment, reply, vote, and bookmark mutations use the verified actor", async () => {
  const annotation = await storage.createAnnotation({
    userId: owner.id,
    sourceUrl: "https://example.com/social",
    sourceType: "article",
    clipText: "A social interaction passage.",
    clipStartSec: null,
    clipEndSec: null,
    sourceTitle: "Social",
    sourceAuthor: null,
    sourceImage: null,
    sourcePublication: "Example",
    commentaryText: null,
    commentaryAudioUrl: null,
    isPublic: 1,
  });
  const authHeader = { Authorization: "Bearer attacker-token" };
  assert.equal((await jsonRequest(server.baseUrl, `/api/users/${owner.id}/follow`, {
    method: "POST", headers: authHeader, body: JSON.stringify({ followerId: owner.id }),
  })).response.status, 200);
  assert.equal(await storage.isFollowing(attacker.id, owner.id), true);
  assert.equal(await storage.isFollowing(owner.id, owner.id), false);

  const comment = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}/comments`, {
    method: "POST", headers: authHeader, body: JSON.stringify({ userId: owner.id, body: "First note" }),
  });
  assert.equal(comment.response.status, 201);
  assert.equal(comment.body.userId, attacker.id);
  const reply = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}/comments`, {
    method: "POST", headers: authHeader, body: JSON.stringify({ body: "Reply", parentId: comment.body.id }),
  });
  assert.equal(reply.response.status, 201);

  const vote = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}/vote`, {
    method: "POST", headers: authHeader, body: JSON.stringify({ userId: owner.id, value: 1 }),
  });
  assert.equal(vote.response.status, 200);
  assert.equal(await storage.getViewerVote(attacker.id, annotation.id), 1);
  const bookmark = await jsonRequest(server.baseUrl, `/api/annotations/${annotation.id}/bookmark`, {
    method: "POST", headers: authHeader, body: JSON.stringify({ userId: owner.id }),
  });
  assert.equal(bookmark.response.status, 200);
  assert.equal(await storage.isBookmarked(attacker.id, annotation.id), true);
});

test("OAuth subject ids are redacted and account deletion requires explicit confirmation", async () => {
  const isolatedStorage = new MemoryStorage();
  const account = await isolatedStorage.createUser({
    username: "delete_me",
    displayName: "Delete Me",
    avatarUrl: null,
    bio: null,
    authProvider: "google",
    authId: "sensitive-oauth-subject",
  });
  const isolated = await harness(isolatedStorage, fakeAuth(new Map([["delete-token", account]])));
  try {
    const me = await jsonRequest(isolated.baseUrl, "/api/auth/me", {
      headers: { Authorization: "Bearer delete-token" },
    });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.authId, undefined);
    assert.equal((await jsonRequest(isolated.baseUrl, "/api/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer delete-token" },
      body: JSON.stringify({ confirmation: "no" }),
    })).response.status, 400);
    assert(await isolatedStorage.getUser(account.id));
    assert.equal((await jsonRequest(isolated.baseUrl, "/api/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer delete-token" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    })).response.status, 200);
    assert.equal(await isolatedStorage.getUser(account.id), undefined);
  } finally {
    await isolated.close();
  }
});

test("liveness stays healthy while readiness reports a storage outage", async () => {
  class FailingStorage extends MemoryStorage {
    override async healthCheck() {
      throw new Error("database warming");
    }
  }
  const unavailable = await harness(new FailingStorage(), fakeAuth(new Map()));
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const health = await jsonRequest(unavailable.baseUrl, "/api/health");
    const ready = await jsonRequest(unavailable.baseUrl, "/api/ready");
    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, "ok");
    assert.equal(ready.response.status, 503);
    assert.equal(ready.body.status, "not_ready");
    const serialized = JSON.stringify(logged);
    assert.match(serialized, /readiness_unavailable/);
    assert.doesNotMatch(serialized, /database warming/);
  } finally {
    console.error = originalError;
    await unavailable.close();
  }
});

test("unexpected storage failures redact raw details from logs and responses", async () => {
  class FailingFeedStorage extends MemoryStorage {
    override async listAnnotations() {
      throw new Error("sentinel-database-detail");
    }
  }
  const unavailable = await harness(new FailingFeedStorage(), fakeAuth(new Map()));
  const logged: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const result = await jsonRequest(unavailable.baseUrl, "/api/feed");
    assert.equal(result.response.status, 500);
    assert.equal(result.body.error, "Internal server error");
    const serialized = JSON.stringify(logged);
    assert.match(serialized, /api_request_failed/);
    assert.doesNotMatch(serialized, /sentinel-database-detail/);
    assert.doesNotMatch(JSON.stringify(result.body), /sentinel-database-detail/);
  } finally {
    console.error = originalError;
    await unavailable.close();
  }
});
