// annotated — shared TypeScript types
// Mirror of web/shared/schema.ts. The extension consumes plain JS, but these
// types are useful for IDEs and any future TS extension build.

export type SourceType = "youtube" | "article" | "podcast";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  authProvider: "x" | "google";
  authId: string;
  createdAt: number;
}

export interface Annotation {
  id: string;
  userId: string;
  sourceUrl: string;
  sourceType: SourceType;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceImage: string | null;
  sourcePublication: string | null;
  clipStartSec: number | null;
  clipEndSec: number | null;
  clipText: string | null;
  clipMediaUrl: string | null;
  clipStatus: "processing" | "ready" | "failed";
  commentaryText: string | null;
  commentaryAudioUrl: string | null;
  isPublic: number;
  createdAt: number;
}

export interface AnnotationWithRelations extends Annotation {
  user: User;
  commentCount: number;
}

export interface Comment {
  id: string;
  annotationId: string;
  userId: string;
  body: string;
  createdAt: number;
}

export interface Claim {
  id: string;
  annotationId: string;
  claimantName: string;
  claimantEmail: string;
  reason: string;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  createdAt: number;
}

export const MAX_CLIP_SECONDS = 90;
export const TARGET_VIDEO_HEIGHT = 240;
