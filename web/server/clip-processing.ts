/** Shared clip constraints. Actual media is captured by the MV3 extension at
 * 240p, uploaded directly to Supabase Storage, and independently inspected by
 * server/media-validation.ts before an annotation is marked ready. */

export const MAX_CLIP_SECONDS = 90;
export const TARGET_VIDEO_HEIGHT = 240; // must be < 480 per spec

export class ClipValidationError extends Error {
  constructor(public field: string, msg: string) {
    super(msg);
  }
}

export function validateClipDuration(startSec: number, endSec: number) {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    throw new ClipValidationError("range", "Clip start and end must be numbers");
  }
  if (startSec < 0 || endSec <= startSec) {
    throw new ClipValidationError("range", "Clip end must be greater than start");
  }
  const duration = endSec - startSec;
  if (duration > MAX_CLIP_SECONDS) {
    throw new ClipValidationError(
      "duration",
      `Clip is ${duration}s. Max allowed is ${MAX_CLIP_SECONDS}s.`
    );
  }
  return duration;
}

export function validateSourceUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) {
      throw new Error("Source URL must use HTTPS without embedded credentials");
    }
  } catch {
    throw new ClipValidationError("sourceUrl", "Source URL is not a valid URL");
  }
}
