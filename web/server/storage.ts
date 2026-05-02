import {
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
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage layer for annotated.
 *
 * - When SUPABASE_URL + SUPABASE_ANON_KEY are present, we use SupabaseStorage,
 *   which talks to the live Postgres database. This is the production path on
 *   Vercel.
 * - When the env vars are absent (e.g. local dev, smoke tests, CI), we fall
 *   back to MemoryStorage so the API still works without any infrastructure.
 *   MemoryStorage is intentionally process-local and is not durable.
 *
 * The two implementations satisfy the same `IStorage` contract so the routes
 * never have to know which backend is active.
 */

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
  listAnnotations(opts?: {
    userId?: string;
    limit?: number;
    followerOf?: string;
  }): Promise<AnnotationWithRelations[]>;
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

// ---------- Row shape helpers (snake_case ↔ camelCase) -----------------------
//
// Supabase returns snake_case column names. We normalize to the camelCase shape
// the rest of the API and frontend expect (which mirrors the Drizzle schema).

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  auth_provider: string;
  auth_id: string;
  created_at: number;
};

function userFromRow(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    authProvider: r.auth_provider,
    authId: r.auth_id,
    createdAt: Number(r.created_at),
  };
}

function userToRow(u: User): UserRow {
  return {
    id: u.id,
    username: u.username,
    display_name: u.displayName,
    avatar_url: u.avatarUrl ?? null,
    bio: u.bio ?? null,
    auth_provider: u.authProvider,
    auth_id: u.authId,
    created_at: u.createdAt,
  };
}

type AnnotationRow = {
  id: string;
  user_id: string;
  source_url: string;
  source_type: string;
  source_title: string | null;
  source_author: string | null;
  source_image: string | null;
  source_publication: string | null;
  clip_start_sec: number | null;
  clip_end_sec: number | null;
  clip_text: string | null;
  clip_media_url: string | null;
  clip_status: string;
  commentary_text: string | null;
  commentary_audio_url: string | null;
  is_public: number;
  created_at: number;
};

function annotationFromRow(r: AnnotationRow): Annotation {
  return {
    id: r.id,
    userId: r.user_id,
    sourceUrl: r.source_url,
    sourceType: r.source_type,
    sourceTitle: r.source_title,
    sourceAuthor: r.source_author,
    sourceImage: r.source_image,
    sourcePublication: r.source_publication,
    clipStartSec: r.clip_start_sec,
    clipEndSec: r.clip_end_sec,
    clipText: r.clip_text,
    clipMediaUrl: r.clip_media_url,
    clipStatus: r.clip_status,
    commentaryText: r.commentary_text,
    commentaryAudioUrl: r.commentary_audio_url,
    isPublic: r.is_public,
    createdAt: Number(r.created_at),
  };
}

function annotationToRow(a: Annotation): AnnotationRow {
  return {
    id: a.id,
    user_id: a.userId,
    source_url: a.sourceUrl,
    source_type: a.sourceType,
    source_title: a.sourceTitle ?? null,
    source_author: a.sourceAuthor ?? null,
    source_image: a.sourceImage ?? null,
    source_publication: a.sourcePublication ?? null,
    clip_start_sec: a.clipStartSec ?? null,
    clip_end_sec: a.clipEndSec ?? null,
    clip_text: a.clipText ?? null,
    clip_media_url: a.clipMediaUrl ?? null,
    clip_status: a.clipStatus,
    commentary_text: a.commentaryText ?? null,
    commentary_audio_url: a.commentaryAudioUrl ?? null,
    is_public: a.isPublic,
    created_at: a.createdAt,
  };
}

type CommentRow = {
  id: string;
  annotation_id: string;
  user_id: string;
  body: string;
  created_at: number;
};

function commentFromRow(r: CommentRow): Comment {
  return {
    id: r.id,
    annotationId: r.annotation_id,
    userId: r.user_id,
    body: r.body,
    createdAt: Number(r.created_at),
  };
}

type ClaimRow = {
  id: string;
  annotation_id: string;
  claimant_name: string;
  claimant_email: string;
  reason: string;
  status: string;
  created_at: number;
};

function claimFromRow(r: ClaimRow): Claim {
  return {
    id: r.id,
    annotationId: r.annotation_id,
    claimantName: r.claimant_name,
    claimantEmail: r.claimant_email,
    reason: r.reason,
    status: r.status,
    createdAt: Number(r.created_at),
  };
}

// ---------- Supabase storage -------------------------------------------------

export class SupabaseStorage implements IStorage {
  constructor(private client: SupabaseClient) {}

  async getUser(id: string) {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? userFromRow(data as UserRow) : undefined;
  }
  async getUserByUsername(username: string) {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    return data ? userFromRow(data as UserRow) : undefined;
  }
  async getUserByAuth(provider: string, authId: string) {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .eq("auth_provider", provider)
      .eq("auth_id", authId)
      .maybeSingle();
    if (error) throw error;
    return data ? userFromRow(data as UserRow) : undefined;
  }
  async listUsers() {
    const { data, error } = await this.client
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => userFromRow(r as UserRow));
  }
  async createUser(input: InsertUser) {
    const user: User = {
      id: randomUUID(),
      createdAt: now(),
      avatarUrl: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      username: input.username,
      displayName: input.displayName,
      authProvider: input.authProvider,
      authId: input.authId,
    };
    const { error } = await this.client.from("users").insert(userToRow(user));
    if (error) throw error;
    return user;
  }

  async getAnnotation(id: string) {
    const { data, error } = await this.client
      .from("annotations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? annotationFromRow(data as AnnotationRow) : undefined;
  }
  async getAnnotationWithUser(id: string) {
    const ann = await this.getAnnotation(id);
    if (!ann) return undefined;
    const user = await this.getUser(ann.userId);
    if (!user) return undefined;
    const { count, error } = await this.client
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("annotation_id", id);
    if (error) throw error;
    return { ...ann, user, commentCount: Number(count ?? 0) };
  }
  async listAnnotations(opts: { userId?: string; limit?: number; followerOf?: string } = {}) {
    const limit = opts.limit ?? 50;
    let query = this.client.from("annotations").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.userId) {
      query = query.eq("user_id", opts.userId);
    } else if (opts.followerOf) {
      const { data: follows, error: fErr } = await this.client
        .from("follows")
        .select("following_id")
        .eq("follower_id", opts.followerOf);
      if (fErr) throw fErr;
      const ids = (follows ?? []).map((r: { following_id: string }) => r.following_id);
      if (ids.length === 0) return [];
      query = query.in("user_id", ids);
    } else {
      query = query.eq("is_public", 1);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r) => annotationFromRow(r as AnnotationRow));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const { data: userRows, error: uErr } = await this.client
      .from("users")
      .select("*")
      .in("id", userIds);
    if (uErr) throw uErr;
    const userMap = new Map(
      (userRows ?? []).map((r) => {
        const u = userFromRow(r as UserRow);
        return [u.id, u] as const;
      })
    );
    const annIds = rows.map((r) => r.id);
    const { data: countRows, error: cErr } = await this.client
      .from("comments")
      .select("annotation_id")
      .in("annotation_id", annIds);
    if (cErr) throw cErr;
    const countMap = new Map<string, number>();
    for (const row of countRows ?? []) {
      const aid = (row as { annotation_id: string }).annotation_id;
      countMap.set(aid, (countMap.get(aid) ?? 0) + 1);
    }
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
    const { error } = await this.client.from("annotations").insert(annotationToRow(row));
    if (error) throw error;
    return row;
  }
  async updateAnnotation(id: string, patch: Partial<Annotation>) {
    const update: Partial<AnnotationRow> = {};
    if ("clipMediaUrl" in patch) update.clip_media_url = patch.clipMediaUrl ?? null;
    if ("clipStatus" in patch && patch.clipStatus) update.clip_status = patch.clipStatus;
    if ("commentaryText" in patch) update.commentary_text = patch.commentaryText ?? null;
    if ("commentaryAudioUrl" in patch) update.commentary_audio_url = patch.commentaryAudioUrl ?? null;
    if ("isPublic" in patch && typeof patch.isPublic === "number") update.is_public = patch.isPublic;
    if (Object.keys(update).length) {
      const { error } = await this.client.from("annotations").update(update).eq("id", id);
      if (error) throw error;
    }
    return this.getAnnotation(id);
  }

  async listComments(annotationId: string) {
    const { data, error } = await this.client
      .from("comments")
      .select("*")
      .eq("annotation_id", annotationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).map((r) => commentFromRow(r as CommentRow));
    if (!rows.length) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const { data: uData, error: uErr } = await this.client
      .from("users")
      .select("*")
      .in("id", userIds);
    if (uErr) throw uErr;
    const map = new Map(
      (uData ?? []).map((r) => {
        const u = userFromRow(r as UserRow);
        return [u.id, u] as const;
      })
    );
    return rows.filter((r) => map.has(r.userId)).map((r) => ({ ...r, user: map.get(r.userId)! }));
  }
  async createComment(input: InsertComment) {
    const row: Comment = {
      id: randomUUID(),
      createdAt: now(),
      annotationId: input.annotationId,
      userId: input.userId,
      body: input.body,
    };
    const { error } = await this.client.from("comments").insert({
      id: row.id,
      annotation_id: row.annotationId,
      user_id: row.userId,
      body: row.body,
      created_at: row.createdAt,
    });
    if (error) throw error;
    return row;
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return;
    const { data: existing } = await this.client
      .from("follows")
      .select("id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (existing) return;
    const { error } = await this.client.from("follows").insert({
      id: randomUUID(),
      follower_id: followerId,
      following_id: followingId,
      created_at: now(),
    });
    if (error) throw error;
  }
  async unfollow(followerId: string, followingId: string) {
    const { error } = await this.client
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", followingId);
    if (error) throw error;
  }
  async isFollowing(followerId: string, followingId: string) {
    const { data, error } = await this.client
      .from("follows")
      .select("id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }
  async followerCount(userId: string) {
    const { count, error } = await this.client
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId);
    if (error) throw error;
    return Number(count ?? 0);
  }
  async followingCount(userId: string) {
    const { count, error } = await this.client
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId);
    if (error) throw error;
    return Number(count ?? 0);
  }

  async createClaim(input: InsertClaim) {
    const row: Claim = {
      id: randomUUID(),
      createdAt: now(),
      status: "pending",
      annotationId: input.annotationId,
      claimantName: input.claimantName,
      claimantEmail: input.claimantEmail,
      reason: input.reason,
    };
    const { error } = await this.client.from("claims").insert({
      id: row.id,
      annotation_id: row.annotationId,
      claimant_name: row.claimantName,
      claimant_email: row.claimantEmail,
      reason: row.reason,
      status: row.status,
      created_at: row.createdAt,
    });
    if (error) throw error;
    return row;
  }
  async listClaimsForAnnotation(annotationId: string) {
    const { data, error } = await this.client
      .from("claims")
      .select("*")
      .eq("annotation_id", annotationId);
    if (error) throw error;
    return (data ?? []).map((r) => claimFromRow(r as ClaimRow));
  }
}

// ---------- In-memory fallback ----------------------------------------------
//
// Used when Supabase env vars are absent. Process-local; data does not survive
// a serverless cold start. Adequate for `npm run dev` smoke tests.

export class MemoryStorage implements IStorage {
  private users = new Map<string, User>();
  private follows = new Map<string, Follow>();
  private annotations = new Map<string, Annotation>();
  private comments = new Map<string, Comment>();
  private claims = new Map<string, Claim>();

  async getUser(id: string) {
    return this.users.get(id);
  }
  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }
  async getUserByAuth(provider: string, authId: string) {
    return Array.from(this.users.values()).find((u) => u.authProvider === provider && u.authId === authId);
  }
  async listUsers() {
    return Array.from(this.users.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  async createUser(input: InsertUser) {
    const u: User = {
      id: randomUUID(),
      createdAt: now(),
      avatarUrl: input.avatarUrl ?? null,
      bio: input.bio ?? null,
      username: input.username,
      displayName: input.displayName,
      authProvider: input.authProvider,
      authId: input.authId,
    };
    this.users.set(u.id, u);
    return u;
  }

  async getAnnotation(id: string) {
    return this.annotations.get(id);
  }
  async getAnnotationWithUser(id: string) {
    const ann = this.annotations.get(id);
    if (!ann) return undefined;
    const user = this.users.get(ann.userId);
    if (!user) return undefined;
    const cc = Array.from(this.comments.values()).filter((c) => c.annotationId === id).length;
    return { ...ann, user, commentCount: cc };
  }
  async listAnnotations(opts: { userId?: string; limit?: number; followerOf?: string } = {}) {
    const limit = opts.limit ?? 50;
    let rows = Array.from(this.annotations.values());
    if (opts.userId) {
      rows = rows.filter((a) => a.userId === opts.userId);
    } else if (opts.followerOf) {
      const followingIds = new Set(
        Array.from(this.follows.values()).filter((f) => f.followerId === opts.followerOf).map((f) => f.followingId)
      );
      if (followingIds.size === 0) return [];
      rows = rows.filter((a) => followingIds.has(a.userId));
    } else {
      rows = rows.filter((a) => a.isPublic === 1);
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    rows = rows.slice(0, limit);
    return rows
      .filter((r) => this.users.has(r.userId))
      .map((r) => ({
        ...r,
        user: this.users.get(r.userId)!,
        commentCount: Array.from(this.comments.values()).filter((c) => c.annotationId === r.id).length,
      }));
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
    this.annotations.set(row.id, row);
    return row;
  }
  async updateAnnotation(id: string, patch: Partial<Annotation>) {
    const cur = this.annotations.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.annotations.set(id, next);
    return next;
  }

  async listComments(annotationId: string) {
    const rows = Array.from(this.comments.values())
      .filter((c) => c.annotationId === annotationId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return rows
      .filter((r) => this.users.has(r.userId))
      .map((r) => ({ ...r, user: this.users.get(r.userId)! }));
  }
  async createComment(input: InsertComment) {
    const row: Comment = {
      id: randomUUID(),
      createdAt: now(),
      annotationId: input.annotationId,
      userId: input.userId,
      body: input.body,
    };
    this.comments.set(row.id, row);
    return row;
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return;
    const dup = Array.from(this.follows.values()).find(
      (f) => f.followerId === followerId && f.followingId === followingId
    );
    if (dup) return;
    const f: Follow = { id: randomUUID(), followerId, followingId, createdAt: now() };
    this.follows.set(f.id, f);
  }
  async unfollow(followerId: string, followingId: string) {
    for (const id of Array.from(this.follows.keys())) {
      const f = this.follows.get(id)!;
      if (f.followerId === followerId && f.followingId === followingId) this.follows.delete(id);
    }
  }
  async isFollowing(followerId: string, followingId: string) {
    return !!Array.from(this.follows.values()).find(
      (f) => f.followerId === followerId && f.followingId === followingId
    );
  }
  async followerCount(userId: string) {
    return Array.from(this.follows.values()).filter((f) => f.followingId === userId).length;
  }
  async followingCount(userId: string) {
    return Array.from(this.follows.values()).filter((f) => f.followerId === userId).length;
  }

  async createClaim(input: InsertClaim) {
    const row: Claim = {
      id: randomUUID(),
      createdAt: now(),
      status: "pending",
      annotationId: input.annotationId,
      claimantName: input.claimantName,
      claimantEmail: input.claimantEmail,
      reason: input.reason,
    };
    this.claims.set(row.id, row);
    return row;
  }
  async listClaimsForAnnotation(annotationId: string) {
    return Array.from(this.claims.values()).filter((c) => c.annotationId === annotationId);
  }
}

// ---------- Active storage selection ----------------------------------------

function buildStorage(): { storage: IStorage; backend: "supabase" | "memory" } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    return { storage: new SupabaseStorage(client), backend: "supabase" };
  }
  return { storage: new MemoryStorage(), backend: "memory" };
}

const built = buildStorage();
export const storage: IStorage = built.storage;
export const storageBackend = built.backend;
