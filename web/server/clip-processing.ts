/**
 * Clip processing scaffolding.
 *
 * In a production deployment this module hands off video/audio extraction to
 * a job queue (BullMQ + Redis) running yt-dlp + FFmpeg, and stores results in
 * Cloudflare R2 / S3. The deployed demo runs without those credentials, so we
 * validate input and return the FFmpeg command we *would* run, instead of
 * actually invoking the binary.
 *
 * TODO(prod):
 *   - Wire R2/S3 client (env: R2_ACCESS_KEY_ID, R2_SECRET, R2_BUCKET)
 *   - Replace inline processing with BullMQ enqueue (env: REDIS_URL)
 *   - Background worker: download via yt-dlp, transcode via ffmpeg, upload, then
 *     update annotation with clip_media_url + clip_status='ready'.
 */

export const MAX_CLIP_SECONDS = 90;
export const TARGET_VIDEO_HEIGHT = 240; // must be < 480 per spec

export interface ClipPlan {
  kind: "youtube" | "podcast";
  sourceUrl: string;
  startSec: number;
  endSec: number;
}

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
    if (!/^https?:$/.test(u.protocol)) {
      throw new Error("Source URL must use http(s)");
    }
  } catch {
    throw new ClipValidationError("sourceUrl", "Source URL is not a valid URL");
  }
}

/** Returns the yt-dlp + ffmpeg shell commands that would produce the clip. */
export function buildYouTubeClipCommands(plan: ClipPlan) {
  validateSourceUrl(plan.sourceUrl);
  validateClipDuration(plan.startSec, plan.endSec);
  const safeUrl = plan.sourceUrl.replace(/"/g, "");
  return [
    `yt-dlp -f "bestvideo[height<=480]+bestaudio/best[height<=480]" --download-sections "*${plan.startSec}-${plan.endSec}" -o raw_clip.mp4 "${safeUrl}"`,
    // Downscale to 240p and re-encode to baseline H.264 for browser playback.
    `ffmpeg -y -i raw_clip.mp4 -vf "scale=-2:${TARGET_VIDEO_HEIGHT}" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 64k -movflags +faststart output_240p.mp4`,
  ];
}

export function buildPodcastClipCommands(plan: ClipPlan) {
  validateSourceUrl(plan.sourceUrl);
  const dur = validateClipDuration(plan.startSec, plan.endSec);
  const safeUrl = plan.sourceUrl.replace(/"/g, "");
  return [
    `yt-dlp -x --audio-format mp3 -o raw_audio.mp3 "${safeUrl}"`,
    `ffmpeg -y -i raw_audio.mp3 -ss ${plan.startSec} -t ${dur} -c:a aac -b:a 128k podcast_clip.m4a`,
  ];
}
