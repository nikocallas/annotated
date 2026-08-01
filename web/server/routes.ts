import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  storage as defaultStorage,
  storageBackend as defaultStorageBackend,
  StorageUnavailableError,
  type IStorage,
  type StorageBackend,
} from "./storage";
import {
  authService as defaultAuthService,
  ApiAuthError,
  type AuthService,
} from "./auth";
import {
  insertAnnotationSchema,
  insertCommentSchema,
  insertClaimSchema,
  CLAIM_REASON_LABELS,
  MAX_CLIP_TEXT_WORDS,
  countClipTextWords,
  type ClaimReasonCategory,
  type VoteValue,
} from "@shared/schema";
import { dispatchClaimEmails } from "./claim-email";
import {
  claimModerationService as defaultClaimModeration,
  ClaimModerationError,
  type ClaimModerationService,
  type ModerationStatus,
} from "./claim-moderation";
import {
  ClipValidationError,
  validateClipDuration,
  validateSourceUrl,
  MAX_CLIP_SECONDS,
  TARGET_VIDEO_HEIGHT,
} from "./clip-processing";
import {
  mediaStorageService as defaultMediaStorageService,
  type MediaStorageService,
  MediaStorageError,
} from "./media-storage";
import { MediaValidationError } from "./media-validation";

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function redactInternalIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactInternalIdentity);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "authId") continue;
    output[key] = redactInternalIdentity(nested);
  }
  return output;
}

function safeOptionalHttpsUrl(value: unknown): string | null | undefined {
  if (value == null || value === "") return value == null ? value : null;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : null;
  } catch {
    return null;
  }
}

async function createClaim(
  storage: IStorage,
  annotationId: string,
  body: Request["body"],
  claimantUserId: string | null,
  emailDispatcher: typeof dispatchClaimEmails,
  moderation: ClaimModerationService,
  res: Response,
) {
  // Browser autofill bots commonly populate this visually hidden field. Do
  // not persist it, and do not disclose that the trap was hit.
  if (typeof body?.website === "string" && body.website.trim()) {
    return res.status(201).json({ received: true, status: "received", claim: { id: "received" } });
  }
  const reasonCategory = body?.reasonCategory as string | undefined;
  const details = typeof body?.details === "string" ? body.details.trim() : "";
  const explicitReason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const label =
    reasonCategory && reasonCategory in CLAIM_REASON_LABELS
      ? CLAIM_REASON_LABELS[reasonCategory as ClaimReasonCategory]
      : null;
  // Compose a human-readable summary for the legacy `reason` column. New
  // clients always send a category; older clients (e.g. extension < 1.3) sent
  // a free-text reason — keep accepting it so existing builds keep working.
  const reasonSummary =
    label && details
      ? `${label} — ${details}`
      : label
        ? label
        : explicitReason || "";

  const parsed = insertClaimSchema.safeParse({
    annotationId,
    claimantUserId,
    claimantName: body?.claimantName,
    claimantEmail: body?.claimantEmail,
    reasonCategory: reasonCategory ?? "other",
    reason: reasonSummary || (label ?? "Other copyright or fair use concern"),
    details: details || null,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const ann = await storage.getAnnotation(annotationId);
  if (!ann || ann.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
  const claim = await storage.createClaim(parsed.data);

  // Fire-and-forget email dispatch — failures must not roll back the claim.
  let emailSummary: Awaited<ReturnType<typeof dispatchClaimEmails>> | null = null;
  try {
    const poster = await storage.getUser(ann.userId);
    if (poster) {
      emailSummary = await emailDispatcher({ claim, annotation: ann, poster });
      await moderation.recordNotifications(claim.id, emailSummary);
    }
  } catch (err) {
    console.error("[claims] email dispatch failed", err);
  }

  return res.status(201).json({
    claim,
    received: true,
    status: claim.status,
    notifications: emailSummary
      ? {
          confirmationSent: emailSummary.filer.sent,
          posterNotified: emailSummary.poster.sent,
        }
      : { confirmationSent: false, posterNotified: false },
    supportEmail: "support@annotatedextension.com",
  });
}

const READINESS_TIMEOUT_MS = 4_000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new StorageUnavailableError(`Storage readiness timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RouteDependencies {
  storage?: IStorage;
  storageBackend?: StorageBackend;
  auth?: AuthService;
  claimModeration?: ClaimModerationService;
  claimEmailDispatcher?: typeof dispatchClaimEmails;
  mediaStorage?: MediaStorageService;
}

export function registerRoutes(
  httpServer: Server,
  app: Express,
  dependencies: RouteDependencies = {},
): Server {
  const storage = dependencies.storage ?? defaultStorage;
  const storageBackend = dependencies.storageBackend ?? defaultStorageBackend;
  const auth = dependencies.auth ?? defaultAuthService;
  const moderation = dependencies.claimModeration ?? defaultClaimModeration;
  const claimEmailDispatcher = dependencies.claimEmailDispatcher ?? dispatchClaimEmails;
  const mediaStorage = dependencies.mediaStorage ?? defaultMediaStorageService;
  // OAuth provider subject IDs are internal authorization material and never
  // belong in public/API JSON, including nested feed/profile user objects.
  app.use((_req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => sendJson(redactInternalIdentity(body))) as typeof res.json;
    next();
  });
  // Liveness deliberately has no database dependency. It must remain useful
  // while Supabase is paused, warming, or unavailable.
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ status: "ok", service: "annotated-api", timestamp: new Date().toISOString() });
  });

  // Readiness proves that this instance can reach its durable store. Memory
  // storage is valid only in development/tests and is never production-ready.
  app.get(
    "/api/ready",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const checks: Record<string, "ok" | "unavailable" | "missing"> = {
        database: "unavailable",
        mediaStorage: process.env.NODE_ENV === "production" ? "unavailable" : "ok",
        oauth: process.env.NODE_ENV === "production" ? "missing" : "ok",
        notifications: process.env.NODE_ENV === "production" ? "missing" : "ok",
        moderation: process.env.NODE_ENV === "production" ? "missing" : "ok",
        maintenance: process.env.NODE_ENV === "production" ? "missing" : "ok",
      };
      try {
        await withTimeout(
          Promise.all([
            storage.healthCheck().then(() => { checks.database = "ok"; }),
            ...(process.env.NODE_ENV === "production"
              ? [mediaStorage.healthCheck().then(() => { checks.mediaStorage = "ok"; })]
              : []),
          ]),
          READINESS_TIMEOUT_MS,
        );
        if (process.env.NODE_ENV === "production" && storageBackend !== "supabase") {
          throw new StorageUnavailableError("Production requires durable Supabase persistence");
        }
        if (process.env.NODE_ENV === "production") {
          checks.oauth = process.env.SUPABASE_ANON_KEY ? "ok" : "missing";
          checks.notifications = process.env.RESEND_API_KEY && process.env.SUPPORT_TO_EMAIL ? "ok" : "missing";
          checks.moderation = process.env.MODERATOR_AUTH_IDS ? "ok" : "missing";
          checks.maintenance = process.env.CRON_SECRET ? "ok" : "missing";
          if (Object.values(checks).some((status) => status !== "ok")) {
            return res.status(503).json({ status: "not_ready", storage: storageBackend, checks });
          }
        }
        return res.json({ status: "ready", storage: storageBackend, checks });
      } catch (error) {
        console.error("[readiness] storage unavailable", error);
        return res.status(503).json({ status: "not_ready", storage: storageBackend, checks });
      }
    }),
  );

  // ---- AUTH --------------------------------------------------------------
  app.get(
    "/api/auth/me",
    asyncHandler(async (req, res) => {
      const user = await auth.optionalActor(req);
      return res.json({ user: user ?? null });
    })
  );

  app.delete(
    "/api/account",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      if (req.body?.confirmation !== "DELETE") {
        return res.status(400).json({ error: "Type DELETE to confirm account deletion" });
      }
      if (storageBackend === "supabase") await mediaStorage.deleteAllUserMedia(actor.id);
      await storage.deleteUser(actor.id);
      await auth.deleteIdentity(actor);
      res.setHeader("Clear-Site-Data", '"cache", "cookies", "storage"');
      return res.json({ ok: true, deleted: true });
    }),
  );

  // Verify the bearer token and synchronize its app-local profile. The access
  // token is never accepted from the JSON body.
  app.post(
    "/api/auth/supabase",
    asyncHandler(async (req, res) => {
      const user = await auth.synchronizeActor(req);
      return res.json({ user });
    })
  );

  // Extension sessions use the same Supabase refresh token rotation as the
  // website, proxied through the API so the extension needs no broad host
  // permission for Supabase itself.
  app.post(
    "/api/auth/refresh",
    asyncHandler(async (req, res) => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
      const session = await auth.refreshSession(refreshToken);
      res.setHeader("Cache-Control", "no-store");
      return res.json(session);
    }),
  );

  // ---- USERS -------------------------------------------------------------
  // Suggested users — order matters for "People worth following" rail.
  // Niko is the demo-author, so he isn't suggested back to himself; the
  // rail filters out the current user client-side as well.
  const SUGGESTED_ORDER = ["nikocallas", "fmaks", "volodyaa", "nazar"];
  app.get(
    "/api/users",
    asyncHandler(async (_req, res) => {
      const users = await storage.listUsers();
      const ranked = [...users].sort((a, b) => {
        const ai = SUGGESTED_ORDER.indexOf(a.username);
        const bi = SUGGESTED_ORDER.indexOf(b.username);
        const av = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const bv = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        if (av !== bv) return av - bv;
        return b.createdAt - a.createdAt;
      });
      return res.json(ranked);
    })
  );

  // Look up by username — used by /u/:username profile route. The route is
  // registered before /api/users/:id so usernames don't collide with UUIDs.
  app.get(
    "/api/users/by-username/:username",
    asyncHandler(async (req, res) => {
      const raw = String(req.params.username || "");
      const username = raw.toLowerCase();
      const viewer = await auth.optionalActor(req);
      const viewerUserId = viewer?.id;
      const user = await storage.getUserByUsername(username);
      if (!user) return res.status(404).json({ error: "User not found" });
      const [followers, following] = await Promise.all([
        storage.followerCount(user.id),
        storage.followingCount(user.id),
      ]);
      const annotations = await storage.listAnnotations({ userId: user.id, limit: 100, viewerUserId });
      return res.json({ user, followers, following, annotations });
    })
  );

  app.get(
    "/api/users/:id",
    asyncHandler(async (req, res) => {
      const viewer = await auth.optionalActor(req);
      const viewerUserId = viewer?.id;
      const user = await storage.getUser(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      const [followers, following] = await Promise.all([
        storage.followerCount(user.id),
        storage.followingCount(user.id),
      ]);
      const annotations = await storage.listAnnotations({ userId: user.id, limit: 100, viewerUserId });
      return res.json({ user, followers, following, annotations });
    })
  );

  app.post(
    "/api/users/:id/follow",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const targetId = String(req.params.id);
      if (targetId === actor.id) return res.status(400).json({ error: "You cannot follow yourself" });
      if (!(await storage.getUser(targetId))) return res.status(404).json({ error: "User not found" });
      await storage.follow(actor.id, targetId);
      return res.json({ ok: true });
    })
  );

  app.delete(
    "/api/users/:id/follow",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      await storage.unfollow(actor.id, String(req.params.id));
      return res.json({ ok: true });
    })
  );

  app.get(
    "/api/users/:id/is-following",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const following = await storage.isFollowing(actor.id, String(req.params.id));
      return res.json({ following });
    })
  );

  // ---- FEED --------------------------------------------------------------
  app.get(
    "/api/feed",
    asyncHandler(async (req, res) => {
      const viewer = await auth.optionalActor(req);
      const followingRequested = req.query.followerOf !== undefined;
      if (followingRequested && !viewer) {
        throw new ApiAuthError(401, "Sign in required");
      }
      const followerOf = followingRequested ? viewer!.id : undefined;
      const viewerUserId = viewer?.id;
      const limit = Math.min(100, Number(req.query.limit ?? 60));
      const shuffle = req.query.shuffle === "1" || req.query.shuffle === "true";
      const annotations = await storage.listAnnotations({ followerOf, limit, viewerUserId });
      if (shuffle) {
        // Fisher–Yates with a per-request seed so each feed load reorders.
        for (let i = annotations.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [annotations[i], annotations[j]] = [annotations[j], annotations[i]];
        }
      }
      return res.json(annotations);
    })
  );

  // Most-viewed annotation across the platform — surfaced on the feed right rail.
  app.get(
    "/api/feed/most-viewed",
    asyncHandler(async (_req, res) => {
      const top = await storage.getMostViewedAnnotation();
      return res.json(top ?? null);
    })
  );

  // ---- BOOKMARKS ---------------------------------------------------------
  // Bookmarks are scoped exclusively by the verified bearer identity.
  app.get(
    "/api/bookmarks",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const list = await storage.listBookmarkedAnnotations(actor.id);
      return res.json(list);
    })
  );

  app.get(
    "/api/bookmarks/ids",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const ids = await storage.listBookmarkIdsForUser(actor.id);
      return res.json({ ids });
    })
  );

  app.post(
    "/api/annotations/:id/bookmark",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const id = String(req.params.id);
      const annotation = await storage.getAnnotation(id);
      if (!annotation || annotation.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      await storage.bookmark(actor.id, id);
      return res.json({ ok: true, bookmarked: true });
    })
  );

  app.delete(
    "/api/annotations/:id/bookmark",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      await storage.unbookmark(actor.id, String(req.params.id));
      return res.json({ ok: true, bookmarked: false });
    })
  );

  // Lightweight, anonymous view increment. Front-end calls this when a card
  // becomes visible / a clip is opened. No auth required — view counts are
  // public signal and not abuse-sensitive in this product.
  app.post(
    "/api/annotations/:id/view",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const annotation = await storage.getAnnotation(id);
      if (!annotation || annotation.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      const next = await storage.incrementViewCount(id);
      return res.json({ viewCount: next });
    })
  );

  // ---- DIRECT MEDIA UPLOADS ----------------------------------------------
  // The API signs a user-scoped object path, then verifies the completed WebM
  // directly from Storage before publishing its URL. Large blobs never travel
  // through Vercel JSON and client-reported duration/resolution is not trusted.
  app.post(
    "/api/uploads/sign",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const upload = await mediaStorage.createSignedMediaUpload({
        userId: actor.id,
        kind: req.body?.kind,
        mime: req.body?.mime,
        sizeBytes: req.body?.sizeBytes,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json(upload);
    }),
  );

  app.post(
    "/api/uploads/finalize",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const intent = await mediaStorage.inspectMediaUpload(actor.id, req.body?.uploadId);
      if (intent.kind === "clip-video" || intent.kind === "clip-audio") {
        const annotationId = typeof req.body?.annotationId === "string" ? req.body.annotationId : "";
        const annotationForClip = await storage.getAnnotation(annotationId);
        if (!annotationForClip) return res.status(404).json({ error: "Annotation not found" });
        if (annotationForClip.userId !== actor.id) {
          return res.status(403).json({ error: "You can only attach media to your own annotation" });
        }
        const expectedKind = annotationForClip.sourceType === "youtube" ? "clip-video" : "clip-audio";
        if (intent.kind !== expectedKind) {
          return res.status(400).json({ error: `This source requires ${expectedKind}` });
        }
      }
      const media = await mediaStorage.finalizeMediaUpload({
        userId: actor.id,
        uploadId: req.body?.uploadId,
      });

      if (media.kind === "clip-video" || media.kind === "clip-audio") {
        const annotationId = typeof req.body?.annotationId === "string" ? req.body.annotationId : "";
        // Attach the verified intent first. If this step fails, the annotation
        // remains private/processing instead of exposing an untracked URL.
        await mediaStorage.attachMediaUpload(actor.id, media.uploadId, annotationId);
        await storage.updateAnnotation(annotationId, {
          clipMediaUrl: media.url,
          clipStatus: "ready",
          isPublic: 1,
        });
      }
      return res.status(201).json(media);
    }),
  );

  app.post(
    "/api/annotations/:id/clip-failed",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      const annotation = await storage.getAnnotation(String(req.params.id));
      if (!annotation) return res.status(404).json({ error: "Annotation not found" });
      if (annotation.userId !== actor.id) {
        return res.status(403).json({ error: "You can only update your own annotation" });
      }
      await storage.updateAnnotation(annotation.id, { clipStatus: "failed", isPublic: 0 });
      return res.json({ ok: true });
    }),
  );

  // ---- ANNOTATIONS / CLIPS ----------------------------------------------
  app.get(
    "/api/annotations/:id",
    asyncHandler(async (req, res) => {
      const viewer = await auth.optionalActor(req);
      const viewerUserId = viewer?.id;
      const ann = await storage.getAnnotationWithUser(String(req.params.id), viewerUserId);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      if (ann.isPublic !== 1 && ann.userId !== viewerUserId) {
        return res.status(404).json({ error: "Annotation not found" });
      }
      return res.json(ann);
    })
  );

  app.post(
    "/api/clips",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);

      if (req.body?.commentaryAudioUrl) {
        return res.status(400).json({ error: "Use a verified commentaryAudioUploadId instead of a media URL" });
      }
      const commentaryUploadId = typeof req.body?.commentaryAudioUploadId === "string"
        ? req.body.commentaryAudioUploadId
        : null;
      let commentaryAudioUrl: string | null = null;
      if (commentaryUploadId) {
        const upload = await mediaStorage.readyMediaUpload(actor.id, commentaryUploadId, "commentary-audio");
        commentaryAudioUrl = upload.public_url;
      }
      const parsed = insertAnnotationSchema.safeParse({
        ...req.body,
        // Open Graph images are supplied by arbitrary source pages. A page
        // with a malformed or insecure image URL must not block publishing;
        // simply omit that optional decoration.
        sourceImage: safeOptionalHttpsUrl(req.body?.sourceImage),
        // This field is never accepted from the caller. The verified Storage
        // URL is attached after request validation below.
        commentaryAudioUrl: null,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const data = { ...parsed.data, commentaryAudioUrl };

      // Server-side enforcement of source URL + 90s clip cap (defense-in-depth).
      try {
        validateSourceUrl(data.sourceUrl);
        if (data.sourceType !== "article" && data.clipStartSec != null && data.clipEndSec != null) {
          validateClipDuration(data.clipStartSec, data.clipEndSec);
        }
        if (data.sourceType === "article") {
          const words = countClipTextWords(data.clipText);
          if (words > MAX_CLIP_TEXT_WORDS) {
            return res.status(400).json({
              error: `Source text is ${words} words. Max allowed is ${MAX_CLIP_TEXT_WORDS} words.`,
              field: "clipText",
            });
          }
        }
      } catch (err) {
        if (err instanceof ClipValidationError) {
          return res.status(400).json({ error: err.message, field: err.field });
        }
        throw err;
      }

      const annotation = await storage.createAnnotation({ ...data, userId: actor.id });
      if (commentaryUploadId) {
        try {
          await mediaStorage.attachMediaUpload(actor.id, commentaryUploadId, annotation.id);
        } catch (error) {
          await storage.deleteAnnotation(annotation.id);
          throw error;
        }
      }
      return res.status(201).json({ annotation, max: MAX_CLIP_SECONDS, targetHeight: TARGET_VIDEO_HEIGHT });
    })
  );

  // Owner-only delete. Actor identity always comes from the bearer token;
  // comments, claims, bookmarks, and votes cascade via foreign keys.
  app.delete(
    "/api/annotations/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const actor = await auth.requireActor(req);
      const ann = await storage.getAnnotation(id);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      if (ann.userId !== actor.id) {
        return res.status(403).json({ error: "You can only delete your own annotations" });
      }
      if (storageBackend === "supabase") {
        await mediaStorage.deleteAnnotationMedia(actor.id, id);
      }
      await storage.deleteAnnotation(id);
      return res.json({ ok: true, deleted: id });
    })
  );

  // Vercel Cron sends CRON_SECRET as a bearer token. This server-only task
  // clears abandoned upload intents and objects after a 24-hour grace period.
  app.get(
    "/api/maintenance/media",
    asyncHandler(async (req, res) => {
      const expected = process.env.CRON_SECRET;
      const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!expected) return res.status(503).json({ error: "Media maintenance is not configured" });
      const expectedBytes = Buffer.from(expected);
      const tokenBytes = Buffer.from(token);
      if (!token || tokenBytes.length !== expectedBytes.length || !timingSafeEqual(tokenBytes, expectedBytes)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const result = await mediaStorage.cleanupExpiredMediaUploads();
      return res.json({ ok: true, ...result });
    }),
  );

  // ---- COMMENTS ----------------------------------------------------------
  app.get(
    "/api/annotations/:id/comments",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const annotation = await storage.getAnnotation(id);
      if (!annotation || annotation.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      const list = await storage.listComments(id);
      return res.json(list);
    })
  );

  app.post(
    "/api/annotations/:id/comments",
    asyncHandler(async (req, res) => {
      const annotationId = String(req.params.id);
      const actor = await auth.requireActor(req);
      const parentIdRaw = req.body?.parentId;
      const parentId =
        typeof parentIdRaw === "string" && parentIdRaw.length > 0 ? parentIdRaw : null;
      const parsed = insertCommentSchema.safeParse({
        annotationId,
        userId: actor.id,
        body: req.body?.body,
        parentId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const ann = await storage.getAnnotation(annotationId);
      if (!ann || ann.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      // Validate parent comment belongs to this annotation if provided.
      if (parsed.data.parentId) {
        const parent = await storage.getComment(parsed.data.parentId);
        if (!parent || parent.annotationId !== annotationId) {
          return res.status(400).json({ error: "Parent comment not found on this annotation" });
        }
      }
      const comment = await storage.createComment(parsed.data);
      return res.status(201).json({ ...comment, user: actor });
    })
  );

  // ---- VOTES -------------------------------------------------------------
  // Mirrors the bookmark/follow API shape. The actor always comes from the
  // verified bearer token. Votes are unique per (user, annotation), and the
  // same user re-voting in the same direction toggles to clear, matching
  // common Reddit/HN conventions.
  app.get(
    "/api/annotations/:id/votes",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const annotation = await storage.getAnnotation(id);
      if (!annotation || annotation.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      const actor = await auth.optionalActor(req);
      const summary = await storage.getVoteSummary(id);
      const viewerVote = actor ? await storage.getViewerVote(actor.id, id) : null;
      return res.json({ ...summary, viewerVote });
    })
  );

  app.post(
    "/api/annotations/:id/vote",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const actor = await auth.requireActor(req);
      const value = Number(req.body?.value);
      const ann = await storage.getAnnotation(id);
      if (!ann || ann.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      if (value !== 1 && value !== -1) {
        return res.status(400).json({ error: "value must be 1 or -1" });
      }
      // Toggle off if the user re-votes in the same direction.
      const current = await storage.getViewerVote(actor.id, id);
      const result =
        current === value
          ? await storage.clearVote(actor.id, id)
          : await storage.setVote(actor.id, id, value as VoteValue);
      return res.json(result);
    })
  );

  app.delete(
    "/api/annotations/:id/vote",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const actor = await auth.requireActor(req);
      const result = await storage.clearVote(actor.id, id);
      return res.json(result);
    })
  );

  // ---- CLAIMS (fair-use disputes) ---------------------------------------
  app.post(
    "/api/annotations/:id/claims",
    asyncHandler(async (req, res) => {
      const actor = await auth.optionalActor(req);
      return createClaim(storage, String(req.params.id), req.body, actor?.id ?? null, claimEmailDispatcher, moderation, res);
    })
  );

  app.post(
    "/api/claims",
    asyncHandler(async (req, res) => {
      const annotationId = (req.body?.annotationId as string) || "";
      if (!annotationId) return res.status(400).json({ error: "annotationId required" });
      const actor = await auth.optionalActor(req);
      return createClaim(storage, annotationId, req.body, actor?.id ?? null, claimEmailDispatcher, moderation, res);
    })
  );

  // Moderator access requires both a verified OAuth session and an auth
  // subject explicitly allowlisted in MODERATOR_AUTH_IDS. Claimant contact
  // data is never exposed through public endpoints.
  app.get(
    "/api/admin/claims",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      if (!moderation.isModerator(actor)) throw new ClaimModerationError(403, "Moderator access required");
      const claims = await moderation.listClaims(Number(req.query.limit ?? 100));
      res.setHeader("Cache-Control", "no-store");
      return res.json({ claims });
    }),
  );

  app.patch(
    "/api/admin/claims/:id",
    asyncHandler(async (req, res) => {
      const actor = await auth.requireActor(req);
      if (!moderation.isModerator(actor)) throw new ClaimModerationError(403, "Moderator access required");
      const status = req.body?.status as ModerationStatus;
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      if (!["reviewing", "resolved", "rejected"].includes(status) || !note || note.length > 4000) {
        return res.status(400).json({ error: "A valid status and moderation note are required" });
      }
      const claim = await moderation.moderate(String(req.params.id), status, note, actor);
      return res.json({ claim });
    }),
  );

  // ---- SUPPORT (contact form) -------------------------------------------
  // Sends an email via Resend's REST API. The destination address is held
  // server-side in SUPPORT_TO_EMAIL and is never exposed to the browser.
  app.post(
    "/api/support",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as {
        name?: unknown;
        email?: unknown;
        subject?: unknown;
        message?: unknown;
        website?: unknown;
      };

      // Honeypot: bots typically auto-fill every field. Humans never see it.
      // Pretend success to avoid signaling the trap.
      if (typeof body.website === "string" && body.website.trim().length > 0) {
        return res.json({ ok: true });
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (!email) return res.status(400).json({ ok: false, error: "Email is required." });
      if (!message) return res.status(400).json({ ok: false, error: "Message is required." });
      // Loose RFC-5322-ish check; precise validation happens on delivery anyway.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
      }
      if (name.length > 200 || email.length > 320 || subject.length > 300 || message.length > 10000) {
        return res.status(400).json({ ok: false, error: "One or more fields exceed the maximum length." });
      }

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          ok: false,
          error:
            "Email delivery is not configured on the server. Please try again later.",
        });
      }

      const toEmail = process.env.SUPPORT_TO_EMAIL || "support@annotatedextension.com";
      const fromEmail =
        process.env.SUPPORT_FROM_EMAIL || "Annotated Support <onboarding@resend.dev>";

      const escapeHtml = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const safeSubject = subject
        ? `[Annotated Support] ${subject}`.slice(0, 200)
        : "[Annotated Support] New message";

      const textBody = [
        `Name: ${name || "(not provided)"}`,
        `Email: ${email}`,
        `Subject: ${subject || "(none)"}`,
        "",
        message,
      ].join("\n");

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5;">
          <p><strong>Name:</strong> ${escapeHtml(name || "(not provided)")}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Subject:</strong> ${escapeHtml(subject || "(none)")}</p>
          <hr />
          <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(message)}</pre>
        </div>
      `.trim();

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [toEmail],
            reply_to: email,
            subject: safeSubject,
            text: textBody,
            html: htmlBody,
          }),
        });
        if (!resendRes.ok) {
          await resendRes.body?.cancel().catch(() => {});
          console.error("[support] resend error", { status: resendRes.status });
          return res.status(502).json({
            ok: false,
            error: "We couldn't deliver your message. Please try again shortly.",
          });
        }
        return res.json({ ok: true });
      } catch (err) {
        console.error("[support] resend network error", { name: err instanceof Error ? err.name : "Error" });
        return res.status(502).json({
          ok: false,
          error: "We couldn't deliver your message. Please try again shortly.",
        });
      }
    })
  );

  // ---- Public landing-page metadata (server-rendered in deploy: SPA only,
  //      but we expose meta for the API so an SSR layer could consume it).
  app.get(
    "/api/annotations/:id/og",
    asyncHandler(async (req, res) => {
      const ann = await storage.getAnnotationWithUser(String(req.params.id));
      if (!ann || ann.isPublic !== 1) return res.status(404).json({ error: "Annotation not found" });
      const title = ann.sourceTitle || "Annotated clip";
      const description =
        ann.commentaryText?.slice(0, 200) ||
        ann.clipText?.slice(0, 200) ||
        `${ann.user.displayName} clipped this from ${ann.sourcePublication ?? "the web"}.`;
      return res.json({
        title: `${title} — annotated by ${ann.user.displayName}`,
        description,
        image: ann.sourceImage,
        sourceUrl: ann.sourceUrl,
      });
    })
  );

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ClipValidationError) {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    if (err instanceof ApiAuthError) {
      return res.status(err.statusCode).json({ error: err.publicMessage });
    }
    if (err instanceof MediaStorageError || err instanceof MediaValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err instanceof StorageUnavailableError) {
      return res.status(503).json({ error: "Service temporarily unavailable" });
    }
    if (err instanceof ClaimModerationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  });

  return httpServer;
}
