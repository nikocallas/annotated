import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Hard cap on the number of source words a Reading/article clip may contain.
// Enforced in the extension UI, the web client preview, and on the API.
export const MAX_CLIP_TEXT_WORDS = 100;

export function countClipTextWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = String(text).trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

// USERS — auth provider is x or google only (no email/password)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  authProvider: text("auth_provider").notNull(), // 'x' | 'google'
  authId: text("auth_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// FOLLOWS
export const follows = sqliteTable("follows", {
  id: text("id").primaryKey(),
  followerId: text("follower_id").notNull(),
  followingId: text("following_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Follow = typeof follows.$inferSelect;

// ANNOTATION TYPES — what kind of take a post is. Judges on This Week in
// Startups E2338 asked for exactly this ("hot take, fact check, steelman,
// receipts, explainer"); "dispute" and "context" carry Jason's original idea:
// highlight a sentence on the web and dispute it or add context.
export const ANNOTATION_TYPES = [
  "dispute",
  "fact-check",
  "context",
  "hot-take",
  "steelman",
  "receipts",
  "explainer",
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const ANNOTATION_TYPE_LABELS: Record<AnnotationType, string> = {
  dispute: "Dispute",
  "fact-check": "Fact check",
  context: "Context",
  "hot-take": "Hot take",
  steelman: "Steelman",
  receipts: "Receipts",
  explainer: "Explainer",
};

export const ANNOTATION_TYPE_DESCRIPTIONS: Record<AnnotationType, string> = {
  dispute: "This claim is wrong or misleading",
  "fact-check": "Checking whether this holds up",
  context: "What's missing from this",
  "hot-take": "A strong opinion",
  steelman: "The best version of this argument",
  receipts: "Evidence that proves the point",
  explainer: "What this means, in plain terms",
};

export function isAnnotationType(value: unknown): value is AnnotationType {
  return typeof value === "string" && (ANNOTATION_TYPES as readonly string[]).includes(value);
}

// Hashtags typed into commentary ("#ai", "#climate") are the feed's topics.
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags: string[] = [];
  const pattern = /(^|[^\w&#])#([A-Za-z0-9_À-ɏ]{2,40})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const tag = match[2].toLowerCase();
    // Pure numbers ("#1") are rankings, not topics.
    if (!/^\d+$/.test(tag) && tags.indexOf(tag) === -1) tags.push(tag);
  }
  return tags;
}

// ANNOTATIONS
export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceType: text("source_type").notNull(), // 'youtube' | 'article' | 'podcast'
  sourceTitle: text("source_title"),
  sourceAuthor: text("source_author"),
  sourceImage: text("source_image"),
  sourcePublication: text("source_publication"),
  // Clip
  clipStartSec: integer("clip_start_sec"),
  clipEndSec: integer("clip_end_sec"),
  clipText: text("clip_text"),
  clipMediaUrl: text("clip_media_url"),
  clipThumbnailUrl: text("clip_thumbnail_url"),
  clipStatus: text("clip_status").notNull().default("ready"), // processing | ready | failed
  // Commentary
  commentaryText: text("commentary_text"),
  commentaryAudioUrl: text("commentary_audio_url"),
  annotationType: text("annotation_type"), // AnnotationType | null
  // Meta
  isPublic: integer("is_public").notNull().default(1),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// BOOKMARKS — a user has saved an annotation for later
export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  annotationId: text("annotation_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Bookmark = typeof bookmarks.$inferSelect;

export const insertAnnotationSchema = createInsertSchema(annotations)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    clipStatus: true,
    clipMediaUrl: true,
    clipThumbnailUrl: true,
  })
  .extend({
    sourceUrl: z.string().url("A valid source URL is required").refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    }, "Source URL must use HTTPS and cannot contain credentials"),
    sourceType: z.enum(["youtube", "article", "podcast"]),
    sourceTitle: z.string().trim().min(1).max(500).optional().nullable(),
    sourceAuthor: z.string().trim().min(1).max(200).optional().nullable(),
    sourceImage: z.string().url().refine((value) => new URL(value).protocol === "https:", "Source image must use HTTPS").optional().nullable(),
    sourcePublication: z.string().trim().min(1).max(200).optional().nullable(),
    clipStartSec: z.number().int().min(0).optional().nullable(),
    clipEndSec: z.number().int().min(0).optional().nullable(),
    clipText: z.string().max(10000).optional().nullable(),
    commentaryText: z.string().trim().max(4000).optional().nullable(),
    commentaryAudioUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "Commentary audio must use HTTPS").optional().nullable(),
    isPublic: z.union([z.literal(0), z.literal(1)]).optional(),
    annotationType: z.enum(ANNOTATION_TYPES).optional().nullable(),
  })
  .refine(
    (data) => {
      // Enforce 90s max for video/audio clips
      if (data.clipStartSec != null && data.clipEndSec != null) {
        const dur = data.clipEndSec - data.clipStartSec;
        return dur > 0 && dur <= 90;
      }
      return true;
    },
    { message: "Clip duration must be 1–90 seconds", path: ["clipEndSec"] }
  )
  .refine(
    (data) => {
      // Article requires clipText, video/audio require start+end
      if (data.sourceType === "article") return !!data.clipText && data.clipText.length > 0;
      return data.clipStartSec != null && data.clipEndSec != null;
    },
    { message: "Article needs text; video/audio need a start and end second" }
  )
  .refine(
    (data) => {
      // Hard 100-word cap on Reading/article source text.
      if (data.sourceType !== "article") return true;
      return countClipTextWords(data.clipText) <= MAX_CLIP_TEXT_WORDS;
    },
    {
      message: `Source text exceeds the ${MAX_CLIP_TEXT_WORDS}-word fair-use cap. Trim the passage and try again.`,
      path: ["clipText"],
    },
  );

export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotations.$inferSelect;

// COMMENTS — threaded via optional parent_id self-reference
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  annotationId: text("annotation_id").notNull(),
  userId: text("user_id").notNull(),
  parentId: text("parent_id"),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertCommentSchema = createInsertSchema(comments)
  .omit({ id: true, createdAt: true })
  .extend({
    body: z.string().min(1).max(2000),
    parentId: z.string().optional().nullable(),
  });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// VOTES — per-user upvote/downvote on annotations.
export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  annotationId: text("annotation_id").notNull(),
  value: integer("value").notNull(), // +1 | -1
  createdAt: integer("created_at").notNull(),
});

export type Vote = typeof votes.$inferSelect;
export type VoteValue = 1 | -1;

// CLAIMS — fair-use disputes
export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  annotationId: text("annotation_id").notNull(),
  claimantUserId: text("claimant_user_id"),
  claimantName: text("claimant_name").notNull(),
  claimantEmail: text("claimant_email").notNull(),
  reasonCategory: text("reason_category"),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("received"), // received | reviewing | resolved | rejected
  createdAt: integer("created_at").notNull(),
});

export const CLAIM_REASON_CATEGORIES = [
  "uses_too_much",
  "reposts_heart",
  "insufficient_commentary",
  "misattribution",
  "paid_or_subscriber_content",
  "copyrighted_media",
  "other",
] as const;
export type ClaimReasonCategory = (typeof CLAIM_REASON_CATEGORIES)[number];

export const CLAIM_REASON_LABELS: Record<ClaimReasonCategory, string> = {
  uses_too_much: "Uses too much of my original work",
  reposts_heart: "Reposts the heart or most valuable part of my work",
  insufficient_commentary: "Does not add sufficient commentary or transformation",
  misattribution: "Misattributes or removes credit to the original source",
  paid_or_subscriber_content: "Uses my paid/subscriber-only content without permission",
  copyrighted_media: "Contains copyrighted audio/video/image/text I own",
  other: "Other copyright or fair use concern",
};

export const insertClaimSchema = createInsertSchema(claims)
  .omit({ id: true, createdAt: true, status: true })
  .extend({
    claimantUserId: z.string().optional().nullable(),
    claimantName: z.string().trim().min(1).max(200),
    claimantEmail: z.string().trim().email().max(320),
    reasonCategory: z.enum(CLAIM_REASON_CATEGORIES),
    reason: z.string().trim().min(1).max(4000),
    details: z.string().trim().max(4000).optional().nullable(),
  });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// ANNOTATION REQUESTS — "put a bounty on a story": ask the community, or one
// specific person, to annotate or fact-check a URL.
export const annotationRequests = sqliteTable("annotation_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title"),
  note: text("note"),
  requestedUserId: text("requested_user_id"),
  status: text("status").notNull().default("open"), // open | fulfilled | closed
  fulfilledAnnotationId: text("fulfilled_annotation_id"),
  createdAt: integer("created_at").notNull(),
  fulfilledAt: integer("fulfilled_at"),
});

export const insertAnnotationRequestSchema = z.object({
  sourceUrl: z.string().url("A valid source URL is required").refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Source URL must use HTTPS and cannot contain credentials"),
  sourceTitle: z.string().trim().min(1).max(500).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  requestedUsername: z.string().trim().min(1).max(64).optional().nullable(),
});
export type InsertAnnotationRequest = z.infer<typeof insertAnnotationRequestSchema>;
export type AnnotationRequest = typeof annotationRequests.$inferSelect;

export interface AnnotationRequestWithRelations extends AnnotationRequest {
  user: User;
  requestedUser: User | null;
  fulfilledAnnotation: { id: string } | null;
}

// Composite shape used by feed UI
export interface AnnotationWithRelations extends Annotation {
  user: User;
  commentCount: number;
  // Net score (upvotes - downvotes). Always present; defaults to 0 when no votes.
  voteScore: number;
  upvotes: number;
  downvotes: number;
  // The current viewer's vote on this annotation, if any. The server derives
  // the viewer from a verified bearer token; otherwise this remains null.
  viewerVote: VoteValue | null;
}

// Comment shape returned by the API; includes the author and the (optional)
// list of replies. Replies are returned at most one nesting level deep — the
// API still allows arbitrary depth in the table, but the UI flattens deeper
// chains under the original top-level comment to keep the view readable.
export interface CommentWithReplies extends Comment {
  user: User;
  replies: (Comment & { user: User })[];
}
