import {
  users,
  follows,
  annotations,
  comments,
  claims,
  type User,
  type InsertUser,
  type Follow,
  type Annotation,
  type InsertAnnotation,
  type Comment,
  type InsertComment,
  type Claim,
  type InsertClaim,
  type AnnotationWithRelations,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Bootstrap schema if first run
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  auth_provider TEXT NOT NULL,
  auth_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(follower_id, following_id)
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_title TEXT,
  source_author TEXT,
  source_image TEXT,
  source_publication TEXT,
  clip_start_sec INTEGER,
  clip_end_sec INTEGER,
  clip_text TEXT,
  clip_media_url TEXT,
  clip_status TEXT NOT NULL DEFAULT 'ready',
  commentary_text TEXT,
  commentary_audio_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL,
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_created ON annotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_annotation ON comments(annotation_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
`);

export const db = drizzle(sqlite);

const now = () => Math.floor(Date.now() / 1000);

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByAuth(provider: string, authId: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  createUser(input: InsertUser): Promise<User>;

  // Annotations
  getAnnotation(id: string): Promise<Annotation | undefined>;
  getAnnotationWithUser(id: string): Promise<AnnotationWithRelations | undefined>;
  listAnnotations(opts?: { userId?: string; limit?: number; followerOf?: string }): Promise<AnnotationWithRelations[]>;
  createAnnotation(input: InsertAnnotation & { userId: string }): Promise<Annotation>;
  updateAnnotation(id: string, patch: Partial<Annotation>): Promise<Annotation | undefined>;

  // Comments
  listComments(annotationId: string): Promise<(Comment & { user: User })[]>;
  createComment(input: InsertComment): Promise<Comment>;

  // Follows
  follow(followerId: string, followingId: string): Promise<void>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  followerCount(userId: string): Promise<number>;
  followingCount(userId: string): Promise<number>;

  // Claims
  createClaim(input: InsertClaim): Promise<Claim>;
  listClaimsForAnnotation(annotationId: string): Promise<Claim[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string) {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async getUserByAuth(provider: string, authId: string) {
    return db
      .select()
      .from(users)
      .where(and(eq(users.authProvider, provider), eq(users.authId, authId)))
      .get();
  }
  async listUsers() {
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
  }
  async createUser(input: InsertUser) {
    const row: User = {
      id: randomUUID(),
      createdAt: now(),
      avatarUrl: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      ...input,
    };
    return db.insert(users).values(row).returning().get();
  }

  async getAnnotation(id: string) {
    return db.select().from(annotations).where(eq(annotations.id, id)).get();
  }
  async getAnnotationWithUser(id: string) {
    const ann = await this.getAnnotation(id);
    if (!ann) return undefined;
    const user = await this.getUser(ann.userId);
    if (!user) return undefined;
    const cc = db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.annotationId, id))
      .get();
    return { ...ann, user, commentCount: Number(cc?.count ?? 0) };
  }
  async listAnnotations(opts: { userId?: string; limit?: number; followerOf?: string } = {}) {
    const limit = opts.limit ?? 50;
    let rows: Annotation[];
    if (opts.userId) {
      rows = db
        .select()
        .from(annotations)
        .where(eq(annotations.userId, opts.userId))
        .orderBy(desc(annotations.createdAt))
        .limit(limit)
        .all();
    } else if (opts.followerOf) {
      const followingIds = db
        .select({ id: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, opts.followerOf))
        .all()
        .map((r) => r.id);
      if (followingIds.length === 0) return [];
      rows = db
        .select()
        .from(annotations)
        .where(inArray(annotations.userId, followingIds))
        .orderBy(desc(annotations.createdAt))
        .limit(limit)
        .all();
    } else {
      rows = db
        .select()
        .from(annotations)
        .where(eq(annotations.isPublic, 1))
        .orderBy(desc(annotations.createdAt))
        .limit(limit)
        .all();
    }
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const userRows = db.select().from(users).where(inArray(users.id, userIds)).all();
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const annIds = rows.map((r) => r.id);
    const counts = db
      .select({ id: comments.annotationId, count: sql<number>`count(*)` })
      .from(comments)
      .where(inArray(comments.annotationId, annIds))
      .groupBy(comments.annotationId)
      .all();
    const countMap = new Map(counts.map((c) => [c.id, Number(c.count)]));
    return rows
      .filter((r) => userMap.has(r.userId))
      .map((r) => ({ ...r, user: userMap.get(r.userId)!, commentCount: countMap.get(r.id) ?? 0 }));
  }
  async createAnnotation(input: InsertAnnotation & { userId: string }) {
    const row: Annotation = {
      id: randomUUID(),
      createdAt: now(),
      clipStatus: "ready",
      clipMediaUrl: null,
      sourceTitle: input.sourceTitle ?? null,
      sourceAuthor: input.sourceAuthor ?? null,
      sourceImage: input.sourceImage ?? null,
      sourcePublication: input.sourcePublication ?? null,
      clipStartSec: input.clipStartSec ?? null,
      clipEndSec: input.clipEndSec ?? null,
      clipText: input.clipText ?? null,
      commentaryText: input.commentaryText ?? null,
      commentaryAudioUrl: input.commentaryAudioUrl ?? null,
      isPublic: input.isPublic ?? 1,
      userId: input.userId,
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType,
    };
    return db.insert(annotations).values(row).returning().get();
  }
  async updateAnnotation(id: string, patch: Partial<Annotation>) {
    db.update(annotations).set(patch).where(eq(annotations.id, id)).run();
    return this.getAnnotation(id);
  }

  async listComments(annotationId: string) {
    const rows = db
      .select()
      .from(comments)
      .where(eq(comments.annotationId, annotationId))
      .orderBy(desc(comments.createdAt))
      .all();
    if (!rows.length) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const userRows = db.select().from(users).where(inArray(users.id, userIds)).all();
    const map = new Map(userRows.map((u) => [u.id, u]));
    return rows.filter((r) => map.has(r.userId)).map((r) => ({ ...r, user: map.get(r.userId)! }));
  }
  async createComment(input: InsertComment) {
    const row: Comment = { id: randomUUID(), createdAt: now(), ...input };
    return db.insert(comments).values(row).returning().get();
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return;
    const existing = db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .get();
    if (existing) return;
    db.insert(follows)
      .values({ id: randomUUID(), followerId, followingId, createdAt: now() })
      .run();
  }
  async unfollow(followerId: string, followingId: string) {
    db.delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .run();
  }
  async isFollowing(followerId: string, followingId: string) {
    return !!db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .get();
  }
  async followerCount(userId: string) {
    const r = db
      .select({ c: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId))
      .get();
    return Number(r?.c ?? 0);
  }
  async followingCount(userId: string) {
    const r = db
      .select({ c: sql<number>`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .get();
    return Number(r?.c ?? 0);
  }

  async createClaim(input: InsertClaim) {
    const row: Claim = { id: randomUUID(), createdAt: now(), status: "pending", ...input };
    return db.insert(claims).values(row).returning().get();
  }
  async listClaimsForAnnotation(annotationId: string) {
    return db.select().from(claims).where(eq(claims.annotationId, annotationId)).all();
  }
}

export const storage = new DatabaseStorage();
