import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  clipStatus: text("clip_status").notNull().default("ready"), // processing | ready | failed
  // Commentary
  commentaryText: text("commentary_text"),
  commentaryAudioUrl: text("commentary_audio_url"),
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
  .omit({ id: true, createdAt: true, clipStatus: true, clipMediaUrl: true })
  .extend({
    sourceUrl: z.string().url("A valid source URL is required"),
    sourceType: z.enum(["youtube", "article", "podcast"]),
    clipStartSec: z.number().int().min(0).optional().nullable(),
    clipEndSec: z.number().int().min(0).optional().nullable(),
    clipText: z.string().optional().nullable(),
    commentaryText: z.string().optional().nullable(),
    commentaryAudioUrl: z.string().optional().nullable(),
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
  );

export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type Annotation = typeof annotations.$inferSelect;

// COMMENTS
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  annotationId: text("annotation_id").notNull(),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertCommentSchema = createInsertSchema(comments)
  .omit({ id: true, createdAt: true })
  .extend({ body: z.string().min(1).max(2000) });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// CLAIMS — fair-use disputes
export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  annotationId: text("annotation_id").notNull(),
  claimantName: text("claimant_name").notNull(),
  claimantEmail: text("claimant_email").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | reviewing | resolved | rejected
  createdAt: integer("created_at").notNull(),
});

export const insertClaimSchema = createInsertSchema(claims)
  .omit({ id: true, createdAt: true, status: true })
  .extend({
    claimantName: z.string().min(1).max(200),
    claimantEmail: z.string().email(),
    reason: z.string().min(10).max(4000),
  });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// Composite shape used by feed UI
export interface AnnotationWithRelations extends Annotation {
  user: User;
  commentCount: number;
}
