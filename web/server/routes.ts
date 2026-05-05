import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";
import { seedDemoData } from "./seed";
import {
  insertAnnotationSchema,
  insertCommentSchema,
  insertClaimSchema,
  CLAIM_REASON_LABELS,
  type ClaimReasonCategory,
  type VoteValue,
} from "@shared/schema";
import { dispatchClaimEmails } from "./claim-email";
import {
  buildYouTubeClipCommands,
  buildPodcastClipCommands,
  ClipValidationError,
  validateClipDuration,
  validateSourceUrl,
  MAX_CLIP_SECONDS,
  TARGET_VIDEO_HEIGHT,
} from "./clip-processing";

/**
 * Demo auth: the deployed sandbox cannot complete real X / Google OAuth without
 * configured credentials, so the API exposes a /api/auth/demo endpoint that
 * accepts a provider id and returns a session-less user record. Production
 * wiring is sketched in TODOs below.
 *
 * TODO(prod auth):
 *   - X (Twitter) OAuth 2.0 PKCE: client id/secret env, callback at /api/auth/x/callback.
 *   - Google: validate id_token via google-auth-library; client id env.
 *   - Issue HTTP-only cookie session; current frontend uses an in-memory user via
 *     React Query (no localStorage / cookies in sandbox).
 */

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

async function createClaim(annotationId: string, body: Request["body"], res: Response) {
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
    claimantUserId: body?.claimantUserId ?? null,
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
  if (!ann) return res.status(404).json({ error: "Annotation not found" });
  const claim = await storage.createClaim(parsed.data);

  // Fire-and-forget email dispatch — failures must not roll back the claim.
  let emailSummary: Awaited<ReturnType<typeof dispatchClaimEmails>> | null = null;
  try {
    const poster = await storage.getUser(ann.userId);
    if (poster) {
      emailSummary = await dispatchClaimEmails({ claim, annotation: ann, poster });
    }
  } catch (err) {
    console.error("[claims] email dispatch failed", err);
  }

  return res.status(201).json({
    claim,
    received: true,
    status: claim.status,
    emails: emailSummary,
    supportEmail: "support@annotatedextension.com",
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedDemoData();

  // ---- AUTH (demo) -------------------------------------------------------
  app.get(
    "/api/auth/me",
    asyncHandler(async (req, res) => {
      const userId = (req.query.userId as string) || "";
      if (!userId) return res.json({ user: null });
      const user = await storage.getUser(userId);
      return res.json({ user: user ?? null });
    })
  );

  app.post(
    "/api/auth/demo",
    asyncHandler(async (req, res) => {
      const { provider } = req.body as { provider?: string };
      if (provider !== "x" && provider !== "google") {
        return res.status(400).json({ error: "Provider must be 'x' or 'google'" });
      }
      // Return the seeded Niko Callas user as the "logged in" demo identity.
      const user = await storage.getUserByUsername("nikocallas");
      if (!user) return res.status(500).json({ error: "Demo user missing" });
      return res.json({ user, provider });
    })
  );

  // Verify a Supabase access token and upsert the app-local user record.
  // Frontend calls this after the OAuth flow completes; the token comes from
  // the active Supabase session and is verified server-side.
  app.post(
    "/api/auth/supabase",
    asyncHandler(async (req, res) => {
      const { accessToken } = req.body as { accessToken?: string };
      if (!accessToken) return res.status(400).json({ error: "accessToken required" });

      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({ error: "Supabase auth is not configured on the server" });
      }

      const verifier = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await verifier.auth.getUser(accessToken);
      if (error || !data?.user) {
        return res.status(401).json({ error: error?.message ?? "Invalid Supabase session" });
      }
      const sUser = data.user;
      const provider = (sUser.app_metadata?.provider as string | undefined) ?? "google";
      const appProvider = provider === "twitter" ? "x" : provider === "google" ? "google" : provider;
      if (appProvider !== "x" && appProvider !== "google") {
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
      }

      // Try to find an existing user by (provider, authId). Also handle the
      // case where Supabase returns provider="twitter" but a previous version
      // wrote our app-local row with provider="x" (or vice versa) so we don't
      // create a duplicate user on each sign-in.
      let existing = await storage.getUserByAuth(appProvider, sUser.id);
      if (!existing && appProvider === "x") {
        existing = await storage.getUserByAuth("twitter", sUser.id);
      }
      if (existing) return res.json({ user: existing });

      // Otherwise create one. Pull display name / handle / avatar from provider
      // metadata, fall back to sensible defaults.
      const meta = (sUser.user_metadata ?? {}) as Record<string, unknown>;
      const displayName =
        (meta.full_name as string | undefined) ||
        (meta.name as string | undefined) ||
        (meta.user_name as string | undefined) ||
        (sUser.email ? sUser.email.split("@")[0] : null) ||
        "user";
      const rawHandle =
        (meta.user_name as string | undefined) ||
        (meta.preferred_username as string | undefined) ||
        (sUser.email ? sUser.email.split("@")[0] : null) ||
        sUser.id.slice(0, 8);
      // Lowercase, strip everything that isn't a-z/0-9/_ and cap length.
      // Never let the slug fall to empty — always have something to anchor on.
      const baseUsername =
        rawHandle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) ||
        `user${sUser.id.replace(/-/g, "").slice(0, 8)}`;

      // Ensure unique username — append a short suffix if taken. After a few
      // collisions, fall back to a slug that includes the auth id so we always
      // converge on a writable handle.
      let username = baseUsername;
      for (let i = 0; i < 5; i++) {
        const taken = await storage.getUserByUsername(username);
        if (!taken) break;
        username = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
      }
      const stillTaken = await storage.getUserByUsername(username);
      if (stillTaken) {
        username = `${baseUsername}-${sUser.id.replace(/-/g, "").slice(0, 6)}`.slice(0, 30);
      }

      const avatarUrl =
        (meta.avatar_url as string | undefined) ||
        (meta.picture as string | undefined) ||
        null;

      const created = await storage.createUser({
        username,
        displayName,
        avatarUrl,
        bio: null,
        authProvider: appProvider,
        authId: sUser.id,
      });
      return res.json({ user: created });
    })
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
      const viewerUserId = (req.query.viewerUserId as string) || undefined;
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
      const viewerUserId = (req.query.viewerUserId as string) || undefined;
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
      const followerId = (req.body?.followerId as string) || "";
      if (!followerId) return res.status(400).json({ error: "followerId required" });
      await storage.follow(followerId, String(req.params.id));
      return res.json({ ok: true });
    })
  );

  app.delete(
    "/api/users/:id/follow",
    asyncHandler(async (req, res) => {
      const followerId = (req.body?.followerId as string) || (req.query.followerId as string) || "";
      if (!followerId) return res.status(400).json({ error: "followerId required" });
      await storage.unfollow(followerId, String(req.params.id));
      return res.json({ ok: true });
    })
  );

  app.get(
    "/api/users/:id/is-following",
    asyncHandler(async (req, res) => {
      const followerId = (req.query.followerId as string) || "";
      if (!followerId) return res.json({ following: false });
      const following = await storage.isFollowing(followerId, String(req.params.id));
      return res.json({ following });
    })
  );

  // ---- FEED --------------------------------------------------------------
  app.get(
    "/api/feed",
    asyncHandler(async (req, res) => {
      const followerOf = (req.query.followerOf as string) || undefined;
      const viewerUserId = (req.query.userId as string) || undefined;
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
  // Bookmarks are scoped per-user. The Express API uses unauthenticated
  // request bodies to identify the actor (mirrors the existing follow API),
  // so we accept userId in the body / query.
  app.get(
    "/api/bookmarks",
    asyncHandler(async (req, res) => {
      const userId = (req.query.userId as string) || "";
      if (!userId) return res.json([]);
      const list = await storage.listBookmarkedAnnotations(userId);
      return res.json(list);
    })
  );

  app.get(
    "/api/bookmarks/ids",
    asyncHandler(async (req, res) => {
      const userId = (req.query.userId as string) || "";
      if (!userId) return res.json({ ids: [] });
      const ids = await storage.listBookmarkIdsForUser(userId);
      return res.json({ ids });
    })
  );

  app.post(
    "/api/annotations/:id/bookmark",
    asyncHandler(async (req, res) => {
      const userId = (req.body?.userId as string) || "";
      if (!userId) return res.status(400).json({ error: "userId required" });
      await storage.bookmark(userId, String(req.params.id));
      return res.json({ ok: true, bookmarked: true });
    })
  );

  app.delete(
    "/api/annotations/:id/bookmark",
    asyncHandler(async (req, res) => {
      const userId = (req.body?.userId as string) || (req.query.userId as string) || "";
      if (!userId) return res.status(400).json({ error: "userId required" });
      await storage.unbookmark(userId, String(req.params.id));
      return res.json({ ok: true, bookmarked: false });
    })
  );

  // Lightweight, anonymous view increment. Front-end calls this when a card
  // becomes visible / a clip is opened. No auth required — view counts are
  // public signal and not abuse-sensitive in this product.
  app.post(
    "/api/annotations/:id/view",
    asyncHandler(async (req, res) => {
      const next = await storage.incrementViewCount(String(req.params.id));
      return res.json({ viewCount: next });
    })
  );

  // ---- AUDIO UPLOAD ------------------------------------------------------
  // Accepts a base64-encoded audio commentary recording. Returns a URL the
  // browser can render in <audio src=...>. Today this is a `data:` URL so the
  // recording is durably attached to the annotation row without needing
  // additional infrastructure. When SUPABASE_SERVICE_ROLE_KEY is configured
  // and a `commentary-audio` bucket exists, we upload there and return the
  // public URL instead.
  app.post(
    "/api/upload/audio",
    asyncHandler(async (req, res) => {
      const { userId, base64, mime, durationMs } = (req.body || {}) as {
        userId?: string;
        base64?: string;
        mime?: string;
        durationMs?: number;
      };
      if (!userId) return res.status(401).json({ error: "Sign in to upload audio" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      if (!base64 || typeof base64 !== "string") {
        return res.status(400).json({ error: "audio is required" });
      }
      // Reject anything over ~1.4MB raw (≈ 1.9MB base64) to keep DB rows sane.
      const approxBytes = Math.floor((base64.length * 3) / 4);
      if (approxBytes > 1_400_000) {
        return res.status(413).json({ error: "Audio too large; keep recordings under 90 seconds" });
      }
      const safeMime = typeof mime === "string" && /^audio\//.test(mime) ? mime : "audio/webm";
      // Hard cap mirrors the clip cap: commentary recordings beyond 90s are
      // out of spec.
      if (typeof durationMs === "number" && durationMs > 95_000) {
        return res.status(400).json({ error: "Audio commentary cannot exceed 90 seconds" });
      }

      const url = `data:${safeMime};base64,${base64}`;
      return res.status(201).json({ url, bytes: approxBytes, mime: safeMime });
    })
  );

  // ---- ANNOTATIONS / CLIPS ----------------------------------------------
  app.get(
    "/api/annotations/:id",
    asyncHandler(async (req, res) => {
      const viewerUserId = (req.query.userId as string) || undefined;
      const ann = await storage.getAnnotationWithUser(String(req.params.id), viewerUserId);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      return res.json(ann);
    })
  );

  app.post(
    "/api/clips",
    asyncHandler(async (req, res) => {
      const userId = (req.body?.userId as string) || "";
      if (!userId) return res.status(401).json({ error: "Sign in to publish a clip" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      const parsed = insertAnnotationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const data = parsed.data;

      // Server-side enforcement of source URL + 90s clip cap (defense-in-depth).
      try {
        validateSourceUrl(data.sourceUrl);
        if (data.sourceType !== "article" && data.clipStartSec != null && data.clipEndSec != null) {
          validateClipDuration(data.clipStartSec, data.clipEndSec);
        }
      } catch (err) {
        if (err instanceof ClipValidationError) {
          return res.status(400).json({ error: err.message, field: err.field });
        }
        throw err;
      }

      // For YouTube/podcast clips, log the FFmpeg/yt-dlp commands we'd run.
      let processingPlan: string[] = [];
      try {
        if (data.sourceType === "youtube" && data.clipStartSec != null && data.clipEndSec != null) {
          processingPlan = buildYouTubeClipCommands({
            kind: "youtube",
            sourceUrl: data.sourceUrl,
            startSec: data.clipStartSec,
            endSec: data.clipEndSec,
          });
        } else if (data.sourceType === "podcast" && data.clipStartSec != null && data.clipEndSec != null) {
          processingPlan = buildPodcastClipCommands({
            kind: "podcast",
            sourceUrl: data.sourceUrl,
            startSec: data.clipStartSec,
            endSec: data.clipEndSec,
          });
        }
      } catch (err) {
        if (err instanceof ClipValidationError) {
          return res.status(400).json({ error: err.message, field: err.field });
        }
      }

      const annotation = await storage.createAnnotation({ ...data, userId });
      return res.status(201).json({ annotation, processingPlan, max: MAX_CLIP_SECONDS, targetHeight: TARGET_VIDEO_HEIGHT });
    })
  );

  // Owner-only delete. The Express API mirrors the bookmark/follow pattern:
  // the actor's userId comes in via body or query string. Ownership is checked
  // server-side; comments / claims / bookmarks cascade away via FK.
  app.delete(
    "/api/annotations/:id",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const userId =
        (req.body?.userId as string) || (req.query.userId as string) || "";
      if (!userId) return res.status(401).json({ error: "Sign in to delete a clip" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      const ann = await storage.getAnnotation(id);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      if (ann.userId !== userId) {
        return res.status(403).json({ error: "You can only delete your own annotations" });
      }
      await storage.deleteAnnotation(id);
      return res.json({ ok: true, deleted: id });
    })
  );

  // ---- COMMENTS ----------------------------------------------------------
  app.get(
    "/api/annotations/:id/comments",
    asyncHandler(async (req, res) => {
      const list = await storage.listComments(String(req.params.id));
      return res.json(list);
    })
  );

  app.post(
    "/api/annotations/:id/comments",
    asyncHandler(async (req, res) => {
      const annotationId = String(req.params.id);
      const parentIdRaw = req.body?.parentId;
      const parentId =
        typeof parentIdRaw === "string" && parentIdRaw.length > 0 ? parentIdRaw : null;
      const parsed = insertCommentSchema.safeParse({
        annotationId,
        userId: req.body?.userId,
        body: req.body?.body,
        parentId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const ann = await storage.getAnnotation(annotationId);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      const user = await storage.getUser(parsed.data.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      // Validate parent comment belongs to this annotation if provided.
      if (parsed.data.parentId) {
        const parent = await storage.getComment(parsed.data.parentId);
        if (!parent || parent.annotationId !== annotationId) {
          return res.status(400).json({ error: "Parent comment not found on this annotation" });
        }
      }
      const comment = await storage.createComment(parsed.data);
      return res.status(201).json({ ...comment, user });
    })
  );

  // ---- VOTES -------------------------------------------------------------
  // Mirrors the bookmark/follow API shape: actor's userId comes via the body
  // (or query string for DELETE). Votes are unique per (user, annotation),
  // and the same user re-voting in the same direction toggles to clear,
  // matching common Reddit/HN conventions.
  app.get(
    "/api/annotations/:id/votes",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const userId = (req.query.userId as string) || "";
      const summary = await storage.getVoteSummary(id);
      const viewerVote = userId ? await storage.getViewerVote(userId, id) : null;
      return res.json({ ...summary, viewerVote });
    })
  );

  app.post(
    "/api/annotations/:id/vote",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const userId = (req.body?.userId as string) || "";
      const value = Number(req.body?.value);
      if (!userId) return res.status(401).json({ error: "Sign in to vote" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      const ann = await storage.getAnnotation(id);
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      if (value !== 1 && value !== -1) {
        return res.status(400).json({ error: "value must be 1 or -1" });
      }
      // Toggle off if the user re-votes in the same direction.
      const current = await storage.getViewerVote(userId, id);
      const result =
        current === value
          ? await storage.clearVote(userId, id)
          : await storage.setVote(userId, id, value as VoteValue);
      return res.json(result);
    })
  );

  app.delete(
    "/api/annotations/:id/vote",
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const userId =
        (req.body?.userId as string) || (req.query.userId as string) || "";
      if (!userId) return res.status(401).json({ error: "Sign in to vote" });
      const result = await storage.clearVote(userId, id);
      return res.json(result);
    })
  );

  // ---- CLAIMS (fair-use disputes) ---------------------------------------
  app.post(
    "/api/annotations/:id/claims",
    asyncHandler(async (req, res) => {
      return createClaim(String(req.params.id), req.body, res);
    })
  );

  app.post(
    "/api/claims",
    asyncHandler(async (req, res) => {
      const annotationId = (req.body?.annotationId as string) || "";
      if (!annotationId) return res.status(400).json({ error: "annotationId required" });
      return createClaim(annotationId, req.body, res);
    })
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

      const toEmail = process.env.SUPPORT_TO_EMAIL || "support@annotatedextensions.com";
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
          const detail = await resendRes.text().catch(() => "");
          console.error("[support] resend error", resendRes.status, detail);
          return res.status(502).json({
            ok: false,
            error: "We couldn't deliver your message. Please try again shortly.",
          });
        }
        return res.json({ ok: true });
      } catch (err) {
        console.error("[support] resend network error", err);
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
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
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
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  });

  return httpServer;
}
