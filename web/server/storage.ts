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
  type Bookmark,
  type Vote,
  type VoteValue,
  type CommentWithReplies,
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
  // Availability
  healthCheck(): Promise<void>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByAuth(provider: string, authId: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  createUser(input: InsertUser): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Annotations
  getAnnotation(id: string): Promise<Annotation | undefined>;
  getAnnotationWithUser(
    id: string,
    viewerUserId?: string,
  ): Promise<AnnotationWithRelations | undefined>;
  listAnnotations(opts?: {
    userId?: string;
    limit?: number;
    followerOf?: string;
    viewerUserId?: string;
  }): Promise<AnnotationWithRelations[]>;
  createAnnotation(input: InsertAnnotation & { userId: string }): Promise<Annotation>;
  updateAnnotation(id: string, patch: Partial<Annotation>): Promise<Annotation | undefined>;
  deleteAnnotation(id: string): Promise<void>;

  // Comments (threaded — replies hang under their parent)
  listComments(annotationId: string): Promise<CommentWithReplies[]>;
  createComment(input: InsertComment): Promise<Comment>;
  getComment(id: string): Promise<Comment | undefined>;

  // Votes
  setVote(userId: string, annotationId: string, value: VoteValue): Promise<{ score: number; upvotes: number; downvotes: number; viewerVote: VoteValue }>;
  clearVote(userId: string, annotationId: string): Promise<{ score: number; upvotes: number; downvotes: number; viewerVote: null }>;
  getViewerVote(userId: string, annotationId: string): Promise<VoteValue | null>;
  getVoteSummary(annotationId: string): Promise<{ score: number; upvotes: number; downvotes: number }>;

  // Follows
  follow(followerId: string, followingId: string): Promise<void>;
  unfollow(followerId: string, followingId: string): Promise<void>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  followerCount(userId: string): Promise<number>;
  followingCount(userId: string): Promise<number>;

  // Claims
  createClaim(input: InsertClaim): Promise<Claim>;
  listClaimsForAnnotation(annotationId: string): Promise<Claim[]>;

  // Bookmarks
  bookmark(userId: string, annotationId: string): Promise<void>;
  unbookmark(userId: string, annotationId: string): Promise<void>;
  isBookmarked(userId: string, annotationId: string): Promise<boolean>;
  listBookmarkedAnnotations(userId: string): Promise<AnnotationWithRelations[]>;
  listBookmarkIdsForUser(userId: string): Promise<string[]>;

  // View count
  incrementViewCount(annotationId: string): Promise<number>;
  getMostViewedAnnotation(): Promise<AnnotationWithRelations | undefined>;
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
  clip_thumbnail_url: string | null;
  clip_status: string;
  commentary_text: string | null;
  commentary_audio_url: string | null;
  is_public: number;
  view_count?: number | null;
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
    clipThumbnailUrl: r.clip_thumbnail_url ?? null,
    clipStatus: r.clip_status,
    commentaryText: r.commentary_text,
    commentaryAudioUrl: r.commentary_audio_url,
    isPublic: r.is_public,
    viewCount: Number(r.view_count ?? 0),
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
    clip_thumbnail_url: a.clipThumbnailUrl ?? null,
    clip_status: a.clipStatus,
    commentary_text: a.commentaryText ?? null,
    commentary_audio_url: a.commentaryAudioUrl ?? null,
    is_public: a.isPublic,
    view_count: a.viewCount ?? 0,
    created_at: a.createdAt,
  };
}

type CommentRow = {
  id: string;
  annotation_id: string;
  user_id: string;
  parent_id?: string | null;
  body: string;
  created_at: number;
};

function commentFromRow(r: CommentRow): Comment {
  return {
    id: r.id,
    annotationId: r.annotation_id,
    userId: r.user_id,
    parentId: r.parent_id ?? null,
    body: r.body,
    createdAt: Number(r.created_at),
  };
}

type VoteRow = {
  id: string;
  user_id: string;
  annotation_id: string;
  value: number;
  created_at: number;
};

function voteFromRow(r: VoteRow): Vote {
  return {
    id: r.id,
    userId: r.user_id,
    annotationId: r.annotation_id,
    value: Number(r.value),
    createdAt: Number(r.created_at),
  };
}

// Convert a flat list of comments + a user lookup into the nested tree the
// detail page renders. Replies of replies get flattened into the nearest
// top-level ancestor's reply list — so the UI never has to indent more than
// one level, matching the design constraint.
function nestComments(
  rows: Comment[],
  userMap: Map<string, User>,
): CommentWithReplies[] {
  // Build a parent → ancestor lookup so we can collapse deep chains.
  const byId = new Map<string, Comment>();
  for (const r of rows) byId.set(r.id, r);
  const topAncestor = (id: string): string => {
    let cur = byId.get(id);
    let safety = 0;
    while (cur?.parentId && byId.has(cur.parentId) && safety < 100) {
      cur = byId.get(cur.parentId);
      safety++;
    }
    return cur?.id ?? id;
  };
  const tops = rows
    .filter((r) => !r.parentId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const repliesByTop = new Map<string, (Comment & { user: User })[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const top = topAncestor(r.parentId);
    if (!byId.has(top)) continue;
    const u = userMap.get(r.userId);
    if (!u) continue;
    const arr = repliesByTop.get(top) ?? [];
    arr.push({ ...r, user: u });
    repliesByTop.set(top, arr);
  }
  return tops
    .filter((t) => userMap.has(t.userId))
    .map((t) => ({
      ...t,
      user: userMap.get(t.userId)!,
      replies: (repliesByTop.get(t.id) ?? []).sort((a, b) => a.createdAt - b.createdAt),
    }));
}

type ClaimRow = {
  id: string;
  annotation_id: string;
  claimant_user_id?: string | null;
  claimant_name: string;
  claimant_email: string;
  reason_category?: string | null;
  reason: string;
  details?: string | null;
  status: string;
  created_at: number;
};

function claimFromRow(r: ClaimRow): Claim {
  return {
    id: r.id,
    annotationId: r.annotation_id,
    claimantUserId: r.claimant_user_id ?? null,
    claimantName: r.claimant_name,
    claimantEmail: r.claimant_email,
    reasonCategory: r.reason_category ?? null,
    reason: r.reason,
    details: r.details ?? null,
    status: r.status,
    createdAt: Number(r.created_at),
  };
}

// ---------- Supabase storage -------------------------------------------------

export class SupabaseStorage implements IStorage {
  constructor(private client: SupabaseClient) {}

  async healthCheck() {
    const { error } = await this.client.from("users").select("id").limit(1);
    if (error) throw error;
  }

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
  async deleteUser(id: string) {
    const { error } = await this.client.from("users").delete().eq("id", id);
    if (error) throw error;
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
  async getAnnotationWithUser(id: string, viewerUserId?: string) {
    const ann = await this.getAnnotation(id);
    if (!ann) return undefined;
    const user = await this.getUser(ann.userId);
    if (!user) return undefined;
    const { count, error } = await this.client
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("annotation_id", id);
    if (error) throw error;
    const summary = await this.getVoteSummary(id);
    const viewerVote = viewerUserId ? await this.getViewerVote(viewerUserId, id) : null;
    return {
      ...ann,
      user,
      commentCount: Number(count ?? 0),
      voteScore: summary.score,
      upvotes: summary.upvotes,
      downvotes: summary.downvotes,
      viewerVote,
    };
  }
  async listAnnotations(opts: { userId?: string; limit?: number; followerOf?: string; viewerUserId?: string } = {}) {
    const limit = opts.limit ?? 50;
    let query = this.client.from("annotations").select("*").order("created_at", { ascending: false }).limit(limit);
    if (opts.userId) {
      query = query.eq("user_id", opts.userId);
      if (opts.viewerUserId !== opts.userId) query = query.eq("is_public", 1);
    } else if (opts.followerOf) {
      const { data: follows, error: fErr } = await this.client
        .from("follows")
        .select("following_id")
        .eq("follower_id", opts.followerOf);
      if (fErr) throw fErr;
      const ids = (follows ?? []).map((r: { following_id: string }) => r.following_id);
      if (ids.length === 0) return [];
      query = query.in("user_id", ids).eq("is_public", 1);
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
    // Aggregate votes for the entire batch in one query.
    const { data: voteRows, error: vErr } = await this.client
      .from("votes")
      .select("annotation_id, user_id, value")
      .in("annotation_id", annIds);
    if (vErr) throw vErr;
    const upMap = new Map<string, number>();
    const downMap = new Map<string, number>();
    const viewerVoteMap = new Map<string, VoteValue>();
    for (const row of voteRows ?? []) {
      const r = row as { annotation_id: string; user_id: string; value: number };
      if (Number(r.value) === 1) upMap.set(r.annotation_id, (upMap.get(r.annotation_id) ?? 0) + 1);
      else if (Number(r.value) === -1) downMap.set(r.annotation_id, (downMap.get(r.annotation_id) ?? 0) + 1);
      if (opts.viewerUserId && r.user_id === opts.viewerUserId) {
        viewerVoteMap.set(r.annotation_id, (Number(r.value) === 1 ? 1 : -1) as VoteValue);
      }
    }
    return rows
      .filter((r) => userMap.has(r.userId))
      .map((r) => {
        const upvotes = upMap.get(r.id) ?? 0;
        const downvotes = downMap.get(r.id) ?? 0;
        return {
          ...r,
          user: userMap.get(r.userId)!,
          commentCount: countMap.get(r.id) ?? 0,
          voteScore: upvotes - downvotes,
          upvotes,
          downvotes,
          viewerVote: viewerVoteMap.get(r.id) ?? null,
        };
      });
  }
  async createAnnotation(input: InsertAnnotation & { userId: string }) {
    const row: Annotation = {
      id: randomUUID(),
      createdAt: now(),
      // Video/audio annotations enter the clip-processing queue and render as
      // a clip facade (no full-source embed) until clipMediaUrl is populated.
      // Article clips don't need processing — clipText is the asset itself.
      clipStatus: input.sourceType === "article" ? "ready" : "processing",
      clipMediaUrl: null,
      clipThumbnailUrl: null,
      sourceTitle: input.sourceTitle ?? null,
      sourceAuthor: input.sourceAuthor ?? null,
      sourceImage: input.sourceImage ?? null,
      sourcePublication: input.sourcePublication ?? null,
      clipStartSec: input.clipStartSec ?? null,
      clipEndSec: input.clipEndSec ?? null,
      clipText: input.clipText ?? null,
      commentaryText: input.commentaryText ?? null,
      commentaryAudioUrl: input.commentaryAudioUrl ?? null,
      // Media annotations remain private while the extension captures and the
      // server verifies their artifact. Finalization publishes atomically.
      isPublic: input.sourceType === "article" ? (input.isPublic ?? 1) : 0,
      viewCount: 0,
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
    if ("clipThumbnailUrl" in patch) update.clip_thumbnail_url = patch.clipThumbnailUrl ?? null;
    if ("clipStatus" in patch && patch.clipStatus) update.clip_status = patch.clipStatus;
    if ("commentaryText" in patch) update.commentary_text = patch.commentaryText ?? null;
    if ("commentaryAudioUrl" in patch) update.commentary_audio_url = patch.commentaryAudioUrl ?? null;
    if ("isPublic" in patch && typeof patch.isPublic === "number") update.is_public = patch.isPublic;
    if ("viewCount" in patch && typeof patch.viewCount === "number") update.view_count = patch.viewCount;
    if (Object.keys(update).length) {
      const { error } = await this.client.from("annotations").update(update).eq("id", id);
      if (error) throw error;
    }
    return this.getAnnotation(id);
  }
  async deleteAnnotation(id: string) {
    // Cascading FKs (comments, claims, bookmarks) clean up automatically.
    const { error } = await this.client.from("annotations").delete().eq("id", id);
    if (error) throw error;
  }

  async listComments(annotationId: string) {
    const { data, error } = await this.client
      .from("comments")
      .select("*")
      .eq("annotation_id", annotationId)
      .order("created_at", { ascending: true });
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
    return nestComments(rows.filter((r) => map.has(r.userId)), map);
  }
  async createComment(input: InsertComment) {
    const row: Comment = {
      id: randomUUID(),
      createdAt: now(),
      annotationId: input.annotationId,
      userId: input.userId,
      parentId: input.parentId ?? null,
      body: input.body,
    };
    const { error } = await this.client.from("comments").insert({
      id: row.id,
      annotation_id: row.annotationId,
      user_id: row.userId,
      parent_id: row.parentId,
      body: row.body,
      created_at: row.createdAt,
    });
    if (error) throw error;
    return row;
  }
  async getComment(id: string) {
    const { data, error } = await this.client
      .from("comments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? commentFromRow(data as CommentRow) : undefined;
  }

  async setVote(userId: string, annotationId: string, value: VoteValue) {
    const { data: existing, error } = await this.client
      .from("votes")
      .select("id")
      .eq("user_id", userId)
      .eq("annotation_id", annotationId)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      const { error: uErr } = await this.client
        .from("votes")
        .update({ value, created_at: now() })
        .eq("id", (existing as { id: string }).id);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await this.client.from("votes").insert({
        id: randomUUID(),
        user_id: userId,
        annotation_id: annotationId,
        value,
        created_at: now(),
      });
      if (iErr) throw iErr;
    }
    const summary = await this.getVoteSummary(annotationId);
    return { ...summary, viewerVote: value };
  }
  async clearVote(userId: string, annotationId: string) {
    const { error } = await this.client
      .from("votes")
      .delete()
      .eq("user_id", userId)
      .eq("annotation_id", annotationId);
    if (error) throw error;
    const summary = await this.getVoteSummary(annotationId);
    return { ...summary, viewerVote: null };
  }
  async getViewerVote(userId: string, annotationId: string) {
    const { data, error } = await this.client
      .from("votes")
      .select("value")
      .eq("user_id", userId)
      .eq("annotation_id", annotationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const v = Number((data as { value: number }).value);
    return (v === 1 ? 1 : v === -1 ? -1 : null) as VoteValue | null;
  }
  async getVoteSummary(annotationId: string) {
    const { data, error } = await this.client
      .from("votes")
      .select("value")
      .eq("annotation_id", annotationId);
    if (error) throw error;
    let upvotes = 0;
    let downvotes = 0;
    for (const row of data ?? []) {
      const v = Number((row as { value: number }).value);
      if (v === 1) upvotes++;
      else if (v === -1) downvotes++;
    }
    return { score: upvotes - downvotes, upvotes, downvotes };
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
      status: "received",
      annotationId: input.annotationId,
      claimantUserId: input.claimantUserId ?? null,
      claimantName: input.claimantName,
      claimantEmail: input.claimantEmail,
      reasonCategory: input.reasonCategory,
      reason: input.reason,
      details: input.details ?? null,
    };
    const { error } = await this.client.from("claims").insert({
      id: row.id,
      annotation_id: row.annotationId,
      claimant_user_id: row.claimantUserId,
      claimant_name: row.claimantName,
      claimant_email: row.claimantEmail,
      reason_category: row.reasonCategory,
      reason: row.reason,
      details: row.details,
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

  async bookmark(userId: string, annotationId: string) {
    const { data: existing } = await this.client
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("annotation_id", annotationId)
      .maybeSingle();
    if (existing) return;
    const { error } = await this.client.from("bookmarks").insert({
      id: randomUUID(),
      user_id: userId,
      annotation_id: annotationId,
      created_at: now(),
    });
    if (error) throw error;
  }
  async unbookmark(userId: string, annotationId: string) {
    const { error } = await this.client
      .from("bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("annotation_id", annotationId);
    if (error) throw error;
  }
  async isBookmarked(userId: string, annotationId: string) {
    const { data, error } = await this.client
      .from("bookmarks")
      .select("id")
      .eq("user_id", userId)
      .eq("annotation_id", annotationId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }
  async listBookmarkIdsForUser(userId: string) {
    const { data, error } = await this.client
      .from("bookmarks")
      .select("annotation_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r: { annotation_id: string }) => r.annotation_id);
  }
  async listBookmarkedAnnotations(userId: string) {
    const ids = await this.listBookmarkIdsForUser(userId);
    if (ids.length === 0) return [];
    const { data, error } = await this.client
      .from("annotations")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []).map((r) => annotationFromRow(r as AnnotationRow));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const { data: userRows } = await this.client.from("users").select("*").in("id", userIds);
    const userMap = new Map(
      (userRows ?? []).map((r) => {
        const u = userFromRow(r as UserRow);
        return [u.id, u] as const;
      })
    );
    const annIds = rows.map((r) => r.id);
    const { data: countRows } = await this.client
      .from("comments")
      .select("annotation_id")
      .in("annotation_id", annIds);
    const countMap = new Map<string, number>();
    for (const row of countRows ?? []) {
      const aid = (row as { annotation_id: string }).annotation_id;
      countMap.set(aid, (countMap.get(aid) ?? 0) + 1);
    }
    const { data: voteRows } = await this.client
      .from("votes")
      .select("annotation_id, user_id, value")
      .in("annotation_id", annIds);
    const upMap = new Map<string, number>();
    const downMap = new Map<string, number>();
    const viewerVoteMap = new Map<string, VoteValue>();
    for (const row of voteRows ?? []) {
      const r = row as { annotation_id: string; user_id: string; value: number };
      if (Number(r.value) === 1) upMap.set(r.annotation_id, (upMap.get(r.annotation_id) ?? 0) + 1);
      else if (Number(r.value) === -1) downMap.set(r.annotation_id, (downMap.get(r.annotation_id) ?? 0) + 1);
      if (r.user_id === userId) {
        viewerVoteMap.set(r.annotation_id, (Number(r.value) === 1 ? 1 : -1) as VoteValue);
      }
    }
    return rows
      .filter((r) => userMap.has(r.userId))
      .map((r) => {
        const upvotes = upMap.get(r.id) ?? 0;
        const downvotes = downMap.get(r.id) ?? 0;
        return {
          ...r,
          user: userMap.get(r.userId)!,
          commentCount: countMap.get(r.id) ?? 0,
          voteScore: upvotes - downvotes,
          upvotes,
          downvotes,
          viewerVote: viewerVoteMap.get(r.id) ?? null,
        };
      });
  }

  async incrementViewCount(annotationId: string) {
    const { data, error } = await this.client.rpc("increment_annotation_view", {
      target_annotation_id: annotationId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }
  async getMostViewedAnnotation() {
    const { data, error } = await this.client
      .from("annotations")
      .select("*")
      .eq("is_public", 1)
      .order("view_count", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const ann = annotationFromRow(data as AnnotationRow);
    const user = await this.getUser(ann.userId);
    if (!user) return undefined;
    const { count } = await this.client
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("annotation_id", ann.id);
    const summary = await this.getVoteSummary(ann.id);
    return {
      ...ann,
      user,
      commentCount: Number(count ?? 0),
      voteScore: summary.score,
      upvotes: summary.upvotes,
      downvotes: summary.downvotes,
      viewerVote: null,
    };
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
  private bookmarks = new Map<string, Bookmark>();
  private votes = new Map<string, Vote>();

  async healthCheck() {}

  private voteSummary(annotationId: string) {
    let upvotes = 0;
    let downvotes = 0;
    for (const v of Array.from(this.votes.values())) {
      if (v.annotationId !== annotationId) continue;
      if (v.value === 1) upvotes++;
      else if (v.value === -1) downvotes++;
    }
    return { score: upvotes - downvotes, upvotes, downvotes };
  }
  private viewerVoteFor(userId: string | undefined, annotationId: string): VoteValue | null {
    if (!userId) return null;
    for (const v of Array.from(this.votes.values())) {
      if (v.userId === userId && v.annotationId === annotationId) {
        return (v.value === 1 ? 1 : v.value === -1 ? -1 : null) as VoteValue | null;
      }
    }
    return null;
  }

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
  async deleteUser(id: string) {
    this.users.delete(id);
    for (const [annotationId, annotation] of Array.from(this.annotations.entries())) {
      if (annotation.userId === id) await this.deleteAnnotation(annotationId);
    }
    for (const [followId, follow] of Array.from(this.follows.entries())) {
      if (follow.followerId === id || follow.followingId === id) this.follows.delete(followId);
    }
    for (const [commentId, comment] of Array.from(this.comments.entries())) {
      if (comment.userId === id) this.comments.delete(commentId);
    }
    for (const [bookmarkId, bookmark] of Array.from(this.bookmarks.entries())) {
      if (bookmark.userId === id) this.bookmarks.delete(bookmarkId);
    }
    for (const [voteId, vote] of Array.from(this.votes.entries())) {
      if (vote.userId === id) this.votes.delete(voteId);
    }
    for (const [claimId, claim] of Array.from(this.claims.entries())) {
      if (claim.claimantUserId === id) this.claims.set(claimId, { ...claim, claimantUserId: null });
    }
  }

  async getAnnotation(id: string) {
    return this.annotations.get(id);
  }
  async getAnnotationWithUser(id: string, viewerUserId?: string) {
    const ann = this.annotations.get(id);
    if (!ann) return undefined;
    const user = this.users.get(ann.userId);
    if (!user) return undefined;
    const cc = Array.from(this.comments.values()).filter((c) => c.annotationId === id).length;
    const summary = this.voteSummary(id);
    return {
      ...ann,
      user,
      commentCount: cc,
      voteScore: summary.score,
      upvotes: summary.upvotes,
      downvotes: summary.downvotes,
      viewerVote: this.viewerVoteFor(viewerUserId, id),
    };
  }
  async listAnnotations(opts: { userId?: string; limit?: number; followerOf?: string; viewerUserId?: string } = {}) {
    const limit = opts.limit ?? 50;
    let rows = Array.from(this.annotations.values());
    if (opts.userId) {
      rows = rows.filter((a) => a.userId === opts.userId);
      if (opts.viewerUserId !== opts.userId) rows = rows.filter((a) => a.isPublic === 1);
    } else if (opts.followerOf) {
      const followingIds = new Set(
        Array.from(this.follows.values()).filter((f) => f.followerId === opts.followerOf).map((f) => f.followingId)
      );
      if (followingIds.size === 0) return [];
      rows = rows.filter((a) => followingIds.has(a.userId) && a.isPublic === 1);
    } else {
      rows = rows.filter((a) => a.isPublic === 1);
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    rows = rows.slice(0, limit);
    return rows
      .filter((r) => this.users.has(r.userId))
      .map((r) => {
        const summary = this.voteSummary(r.id);
        return {
          ...r,
          user: this.users.get(r.userId)!,
          commentCount: Array.from(this.comments.values()).filter((c) => c.annotationId === r.id).length,
          voteScore: summary.score,
          upvotes: summary.upvotes,
          downvotes: summary.downvotes,
          viewerVote: this.viewerVoteFor(opts.viewerUserId, r.id),
        };
      });
  }
  async createAnnotation(input: InsertAnnotation & { userId: string }) {
    const row: Annotation = {
      id: randomUUID(),
      createdAt: now(),
      // Video/audio annotations enter the clip-processing queue and render as
      // a clip facade (no full-source embed) until clipMediaUrl is populated.
      clipStatus: input.sourceType === "article" ? "ready" : "processing",
      clipMediaUrl: null,
      clipThumbnailUrl: null,
      sourceTitle: input.sourceTitle ?? null,
      sourceAuthor: input.sourceAuthor ?? null,
      sourceImage: input.sourceImage ?? null,
      sourcePublication: input.sourcePublication ?? null,
      clipStartSec: input.clipStartSec ?? null,
      clipEndSec: input.clipEndSec ?? null,
      clipText: input.clipText ?? null,
      commentaryText: input.commentaryText ?? null,
      commentaryAudioUrl: input.commentaryAudioUrl ?? null,
      isPublic: input.sourceType === "article" ? (input.isPublic ?? 1) : 0,
      viewCount: 0,
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
  async deleteAnnotation(id: string) {
    this.annotations.delete(id);
    for (const cid of Array.from(this.comments.keys())) {
      if (this.comments.get(cid)?.annotationId === id) this.comments.delete(cid);
    }
    for (const bid of Array.from(this.bookmarks.keys())) {
      if (this.bookmarks.get(bid)?.annotationId === id) this.bookmarks.delete(bid);
    }
    for (const clid of Array.from(this.claims.keys())) {
      if (this.claims.get(clid)?.annotationId === id) this.claims.delete(clid);
    }
    for (const vid of Array.from(this.votes.keys())) {
      if (this.votes.get(vid)?.annotationId === id) this.votes.delete(vid);
    }
  }

  async listComments(annotationId: string) {
    const rows = Array.from(this.comments.values())
      .filter((c) => c.annotationId === annotationId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const userMap = new Map<string, User>();
    for (const r of rows) {
      const u = this.users.get(r.userId);
      if (u) userMap.set(u.id, u);
    }
    return nestComments(rows, userMap);
  }
  async createComment(input: InsertComment) {
    const row: Comment = {
      id: randomUUID(),
      createdAt: now(),
      annotationId: input.annotationId,
      userId: input.userId,
      parentId: input.parentId ?? null,
      body: input.body,
    };
    this.comments.set(row.id, row);
    return row;
  }
  async getComment(id: string) {
    return this.comments.get(id);
  }

  async setVote(userId: string, annotationId: string, value: VoteValue) {
    const existingId = Array.from(this.votes.entries()).find(
      ([, v]) => v.userId === userId && v.annotationId === annotationId,
    )?.[0];
    if (existingId) {
      const cur = this.votes.get(existingId)!;
      this.votes.set(existingId, { ...cur, value, createdAt: now() });
    } else {
      const v: Vote = {
        id: randomUUID(),
        userId,
        annotationId,
        value,
        createdAt: now(),
      };
      this.votes.set(v.id, v);
    }
    const summary = this.voteSummary(annotationId);
    return { ...summary, viewerVote: value };
  }
  async clearVote(userId: string, annotationId: string) {
    for (const id of Array.from(this.votes.keys())) {
      const v = this.votes.get(id)!;
      if (v.userId === userId && v.annotationId === annotationId) this.votes.delete(id);
    }
    const summary = this.voteSummary(annotationId);
    return { ...summary, viewerVote: null };
  }
  async getViewerVote(userId: string, annotationId: string) {
    return this.viewerVoteFor(userId, annotationId);
  }
  async getVoteSummary(annotationId: string) {
    return this.voteSummary(annotationId);
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
      status: "received",
      annotationId: input.annotationId,
      claimantUserId: input.claimantUserId ?? null,
      claimantName: input.claimantName,
      claimantEmail: input.claimantEmail,
      reasonCategory: input.reasonCategory,
      reason: input.reason,
      details: input.details ?? null,
    };
    this.claims.set(row.id, row);
    return row;
  }
  async listClaimsForAnnotation(annotationId: string) {
    return Array.from(this.claims.values()).filter((c) => c.annotationId === annotationId);
  }

  async bookmark(userId: string, annotationId: string) {
    const dup = Array.from(this.bookmarks.values()).find(
      (b) => b.userId === userId && b.annotationId === annotationId
    );
    if (dup) return;
    const b: Bookmark = { id: randomUUID(), userId, annotationId, createdAt: now() };
    this.bookmarks.set(b.id, b);
  }
  async unbookmark(userId: string, annotationId: string) {
    for (const id of Array.from(this.bookmarks.keys())) {
      const b = this.bookmarks.get(id)!;
      if (b.userId === userId && b.annotationId === annotationId) this.bookmarks.delete(id);
    }
  }
  async isBookmarked(userId: string, annotationId: string) {
    return !!Array.from(this.bookmarks.values()).find(
      (b) => b.userId === userId && b.annotationId === annotationId
    );
  }
  async listBookmarkIdsForUser(userId: string) {
    return Array.from(this.bookmarks.values())
      .filter((b) => b.userId === userId)
      .map((b) => b.annotationId);
  }
  async listBookmarkedAnnotations(userId: string) {
    const ids = new Set(await this.listBookmarkIdsForUser(userId));
    if (ids.size === 0) return [];
    const rows = Array.from(this.annotations.values())
      .filter((a) => ids.has(a.id))
      .sort((a, b) => b.createdAt - a.createdAt);
    return rows
      .filter((r) => this.users.has(r.userId))
      .map((r) => {
        const summary = this.voteSummary(r.id);
        return {
          ...r,
          user: this.users.get(r.userId)!,
          commentCount: Array.from(this.comments.values()).filter((c) => c.annotationId === r.id).length,
          voteScore: summary.score,
          upvotes: summary.upvotes,
          downvotes: summary.downvotes,
          viewerVote: this.viewerVoteFor(userId, r.id),
        };
      });
  }

  async incrementViewCount(annotationId: string) {
    const cur = this.annotations.get(annotationId);
    if (!cur) return 0;
    const next = (cur.viewCount ?? 0) + 1;
    this.annotations.set(annotationId, { ...cur, viewCount: next });
    return next;
  }
  async getMostViewedAnnotation() {
    const rows = Array.from(this.annotations.values())
      .filter((a) => a.isPublic === 1)
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    const top = rows[0];
    if (!top) return undefined;
    const user = this.users.get(top.userId);
    if (!user) return undefined;
    const cc = Array.from(this.comments.values()).filter((c) => c.annotationId === top.id).length;
    const summary = this.voteSummary(top.id);
    return {
      ...top,
      user,
      commentCount: cc,
      voteScore: summary.score,
      upvotes: summary.upvotes,
      downvotes: summary.downvotes,
      viewerVote: null,
    };
  }
}

// ---------- Active storage selection ----------------------------------------

export class StorageUnavailableError extends Error {
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export type StorageBackend = "supabase" | "memory" | "unavailable";

function unavailableStorage(message: string): IStorage {
  const error = new StorageUnavailableError(message);
  return new Proxy({} as IStorage, {
    get(_target, property) {
      if (property === "healthCheck") {
        return async () => {
          throw error;
        };
      }
      return async () => {
        throw error;
      };
    },
  });
}

function buildStorage(): { storage: IStorage; backend: StorageBackend } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_ANON_KEY;
  if (process.env.NODE_ENV === "production" && url && !serviceKey) {
    return {
      storage: unavailableStorage("Production Supabase persistence requires a server-only service role key"),
      backend: "unavailable",
    };
  }
  const key = serviceKey || publishableKey;
  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    return { storage: new SupabaseStorage(client), backend: "supabase" };
  }
  if (url || serviceKey || publishableKey) {
    return {
      storage: unavailableStorage("Supabase persistence is partially configured"),
      backend: "unavailable",
    };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      storage: unavailableStorage("Durable Supabase persistence is not configured"),
      backend: "unavailable",
    };
  }
  return { storage: new MemoryStorage(), backend: "memory" };
}

const built = buildStorage();
export const storage: IStorage = built.storage;
export const storageBackend = built.backend;
