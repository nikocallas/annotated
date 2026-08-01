export const MAX_CLIP_SECONDS: number;
export const MAX_CLIP_TEXT_WORDS: number;
export const TARGET_VIDEO_HEIGHT: number;
export function countWords(text: unknown): number;
export function detectSourceType(url: string, options?: { xAsArticle?: boolean }): "youtube" | "podcast" | "article" | "x" | "unknown";
export function sameMediaSource(left: string, right: string): boolean;
export function capturePlan(sourceType: string, startSec: number, endSec: number): {
  kind: "video" | "audio";
  uploadKind: "clip-video" | "clip-audio";
  startSec: number;
  durationMs: number;
  targetHeight: number | null;
};
export function isValidAuthHandoff(message: unknown): boolean;
export function nextPublishStatus(current: string, event: string): "idle" | "publishing" | "published";
