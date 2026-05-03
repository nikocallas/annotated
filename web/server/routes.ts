import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";
import { seedDemoData } from "./seed";
import {
  insertAnnotationSchema,
  insertCommentSchema,
  insertClaimSchema,
} from "@shared/schema";
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
  const parsed = insertClaimSchema.safeParse({
    annotationId,
    claimantName: body?.claimantName,
    claimantEmail: body?.claimantEmail,
    reason: body?.reason,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const ann = await storage.getAnnotation(annotationId);
  if (!ann) return res.status(404).json({ error: "Annotation not found" });
  const claim = await storage.createClaim(parsed.data);
  return res.status(201).json(claim);
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
      // Return the seeded jcal user as the "logged in" demo identity.
      const user = await storage.getUserByUsername("jcal");
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

      // Try to find an existing user by (provider, authId).
      const existing = await storage.getUserByAuth(appProvider, sUser.id);
      if (existing) return res.json({ user: existing });

      // Otherwise create one. Pull display name / handle / avatar from provider
      // metadata, fall back to sensible defaults.
      const meta = (sUser.user_metadata ?? {}) as Record<string, unknown>;
      const displayName =
        (meta.full_name as string | undefined) ||
        (meta.name as string | undefined) ||
        (meta.user_name as string | undefined) ||
        (sUser.email ? sUser.email.split("@")[0] : "user");
      const rawHandle =
        (meta.user_name as string | undefined) ||
        (meta.preferred_username as string | undefined) ||
        (sUser.email ? sUser.email.split("@")[0] : sUser.id.slice(0, 8));
      const baseUsername = rawHandle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "user";

      // Ensure unique username — append a short suffix if taken.
      let username = baseUsername;
      for (let i = 0; i < 5; i++) {
        const taken = await storage.getUserByUsername(username);
        if (!taken) break;
        username = `${baseUsername}${Math.floor(Math.random() * 10000)}`;
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
  app.get(
    "/api/users",
    asyncHandler(async (_req, res) => {
      const users = await storage.listUsers();
      return res.json(users);
    })
  );

  app.get(
    "/api/users/:id",
    asyncHandler(async (req, res) => {
      const user = await storage.getUser(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      const [followers, following] = await Promise.all([
        storage.followerCount(user.id),
        storage.followingCount(user.id),
      ]);
      const annotations = await storage.listAnnotations({ userId: user.id, limit: 100 });
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
      const limit = Math.min(100, Number(req.query.limit ?? 50));
      const annotations = await storage.listAnnotations({ followerOf, limit });
      return res.json(annotations);
    })
  );

  // ---- ANNOTATIONS / CLIPS ----------------------------------------------
  app.get(
    "/api/annotations/:id",
    asyncHandler(async (req, res) => {
      const ann = await storage.getAnnotationWithUser(String(req.params.id));
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
      const parsed = insertCommentSchema.safeParse({
        annotationId: String(req.params.id),
        userId: req.body?.userId,
        body: req.body?.body,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const ann = await storage.getAnnotation(String(req.params.id));
      if (!ann) return res.status(404).json({ error: "Annotation not found" });
      const user = await storage.getUser(parsed.data.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      const comment = await storage.createComment(parsed.data);
      return res.status(201).json({ ...comment, user });
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

      const toEmail = process.env.SUPPORT_TO_EMAIL || "niko@laymen.com";
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
