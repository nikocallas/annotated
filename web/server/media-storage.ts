import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { MediaValidationError, validateUploadedMedia, type MediaKind } from "./media-validation";

const LIMITS: Record<MediaKind, { bucket: string; mime: string; maxBytes: number }> = {
  "clip-video": { bucket: "clip-media", mime: "video/webm", maxBytes: 20 * 1024 * 1024 },
  "clip-audio": { bucket: "clip-media", mime: "audio/webm", maxBytes: 8 * 1024 * 1024 },
  "commentary-audio": { bucket: "commentary-audio", mime: "audio/webm", maxBytes: 2 * 1024 * 1024 },
};

export class MediaStorageError extends Error {
  constructor(readonly statusCode: 400 | 403 | 503, message: string) {
    super(message);
    this.name = "MediaStorageError";
  }
}

export interface MediaUploadRow {
  id: string;
  user_id: string;
  annotation_id: string | null;
  kind: MediaKind;
  bucket: string;
  object_path: string;
  mime: string;
  status: "pending" | "ready" | "attached" | "failed" | "orphaned";
  bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  has_video: boolean | null;
  has_audio: boolean | null;
  public_url: string | null;
  created_at: number;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new MediaStorageError(503, "Media storage is not configured");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function mediaStorageHealthCheck() {
  const client = adminClient();
  const [clips, commentary] = await Promise.all([
    client.storage.getBucket("clip-media"),
    client.storage.getBucket("commentary-audio"),
  ]);
  if (clips.error || !clips.data || commentary.error || !commentary.data) {
    throw new MediaStorageError(503, "Required media buckets are unavailable");
  }
}

function settings(kind: unknown): { kind: MediaKind; bucket: string; mime: string; maxBytes: number } {
  if (kind !== "clip-video" && kind !== "clip-audio" && kind !== "commentary-audio") {
    throw new MediaStorageError(400, "Unsupported media upload kind");
  }
  const mediaKind: MediaKind = kind;
  return { kind: mediaKind, ...LIMITS[mediaKind] };
}

function assertObjectOwnership(userId: string, kind: MediaKind, path: string) {
  const prefix = `${userId}/${kind}/`;
  if (!path.startsWith(prefix) || path.includes("..") || path.includes("\\")) {
    throw new MediaStorageError(403, "Media object does not belong to this user");
  }
}

export async function createSignedMediaUpload(input: {
  userId: string;
  kind: unknown;
  mime: unknown;
  sizeBytes: unknown;
}) {
  const config = settings(input.kind);
  const mime = typeof input.mime === "string" ? input.mime.split(";")[0].toLowerCase() : "";
  const sizeBytes = Number(input.sizeBytes);
  if (mime !== config.mime) {
    throw new MediaStorageError(400, `${config.kind} must use ${config.mime}`);
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > config.maxBytes) {
    throw new MediaStorageError(400, `${config.kind} exceeds its upload size limit`);
  }

  const client = adminClient();
  const uploadId = randomUUID();
  const path = `${input.userId}/${config.kind}/${uploadId}.webm`;
  const { error: intentError } = await client.from("media_uploads").insert({
    id: uploadId,
    user_id: input.userId,
    annotation_id: null,
    kind: config.kind,
    bucket: config.bucket,
    object_path: path,
    mime: config.mime,
    status: "pending",
    created_at: Math.floor(Date.now() / 1000),
  });
  if (intentError) throw new MediaStorageError(503, "Unable to create a media upload intent");

  const { data, error } = await client.storage
    .from(config.bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl) {
    await client.from("media_uploads").delete().eq("id", uploadId);
    throw new MediaStorageError(503, "Unable to create a media upload URL");
  }
  return {
    uploadId,
    kind: config.kind,
    bucket: config.bucket,
    path,
    signedUrl: data.signedUrl,
    token: data.token,
    mime: config.mime,
    maxBytes: config.maxBytes,
  };
}

export async function finalizeMediaUpload(input: {
  userId: string;
  uploadId: unknown;
}) {
  const client = adminClient();
  const uploadId = typeof input.uploadId === "string" ? input.uploadId : "";
  const { data: recordData, error: recordError } = await client
    .from("media_uploads")
    .select("*")
    .eq("id", uploadId)
    .maybeSingle();
  if (recordError || !recordData) throw new MediaStorageError(400, "Media upload intent was not found");
  const record = recordData as MediaUploadRow;
  if (record.user_id !== input.userId) throw new MediaStorageError(403, "Media upload does not belong to this user");
  const config = settings(record.kind);
  const path = record.object_path;
  assertObjectOwnership(input.userId, config.kind, path);
  if ((record.status === "ready" || record.status === "attached") && record.public_url) {
    return {
      uploadId: record.id,
      kind: record.kind,
      bucket: record.bucket,
      path,
      url: record.public_url,
      bytes: Number(record.bytes ?? 0),
      mime: record.mime,
      durationSeconds: Number(record.duration_seconds ?? 0),
      width: record.width,
      height: record.height,
      container: "webm" as const,
      hasVideo: !!record.has_video,
      hasAudio: !!record.has_audio,
    };
  }
  if (record.status !== "pending") throw new MediaStorageError(400, "Media upload is not finalizable");
  const { data, error } = await client.storage.from(config.bucket).download(path);
  if (error || !data) {
    throw new MediaStorageError(400, "Uploaded media object was not found");
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length <= 0 || buffer.length > config.maxBytes) {
    await client.storage.from(config.bucket).remove([path]);
    await client.from("media_uploads").update({ status: "failed" }).eq("id", record.id);
    throw new MediaStorageError(400, "Uploaded media object has an invalid size");
  }

  let media;
  try {
    media = validateUploadedMedia(buffer, config.kind);
  } catch (error) {
    await client.storage.from(config.bucket).remove([path]);
    await client.from("media_uploads").update({ status: "failed" }).eq("id", record.id);
    if (error instanceof MediaValidationError) throw error;
    throw new MediaStorageError(400, "Uploaded media could not be verified");
  }

  // A transient metadata-write failure must not destroy a valid user upload.
  // Leave the intent pending so the same finalize request can be retried.
  const { data: publicData } = client.storage.from(config.bucket).getPublicUrl(path);
  const { data: updated, error: updateError } = await client.from("media_uploads").update({
    status: "ready",
    bytes: buffer.length,
    duration_seconds: media.durationSeconds,
    width: media.width,
    height: media.height,
    has_video: media.hasVideo,
    has_audio: media.hasAudio,
    public_url: publicData.publicUrl,
  }).eq("id", record.id).eq("user_id", input.userId).eq("status", "pending").select("id").maybeSingle();
  if (updateError || !updated) throw new MediaStorageError(503, "Unable to finalize media metadata");
  return {
    uploadId: record.id,
    kind: config.kind,
    bucket: config.bucket,
    path,
    url: publicData.publicUrl,
    bytes: buffer.length,
    mime: config.mime,
    ...media,
  };
}

export async function readyMediaUpload(userId: string, uploadId: unknown, kind: MediaKind) {
  const id = typeof uploadId === "string" ? uploadId : "";
  const { data, error } = await adminClient()
    .from("media_uploads")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("kind", kind)
    .in("status", ["ready", "attached"])
    .maybeSingle();
  if (error || !data) throw new MediaStorageError(400, "Verified media upload was not found");
  return data as MediaUploadRow;
}

export async function inspectMediaUpload(userId: string, uploadId: unknown) {
  const id = typeof uploadId === "string" ? uploadId : "";
  const { data, error } = await adminClient()
    .from("media_uploads")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new MediaStorageError(400, "Media upload intent was not found");
  return data as MediaUploadRow;
}

export async function attachMediaUpload(userId: string, uploadId: string, annotationId: string) {
  const client = adminClient();
  const { data: incoming, error: incomingError } = await client
    .from("media_uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("user_id", userId)
    .in("status", ["ready", "attached"])
    .maybeSingle();
  if (incomingError || !incoming) throw new MediaStorageError(400, "Verified media upload was not found");
  const record = incoming as MediaUploadRow;

  const { error } = await client.rpc("attach_media_upload", {
    p_user_id: userId,
    p_upload_id: uploadId,
    p_annotation_id: annotationId,
  });
  if (error) {
    if (/not found|not owned|already attached|not ready|requires a/i.test(error.message)) {
      throw new MediaStorageError(400, "Verified media upload could not be attached");
    }
    throw new MediaStorageError(503, "Unable to attach verified media");
  }

  // Cleanup happens only after the transaction has atomically pointed the
  // annotation at the winner. Failures are safe to defer to maintenance.
  const { data: orphaned, error: orphanError } = await client
    .from("media_uploads")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", record.kind)
    .eq("status", "orphaned")
    .is("annotation_id", null);
  if (orphanError) {
    console.warn(JSON.stringify({ event: "media_orphan_cleanup_deferred" }));
    return;
  }
  for (const stale of (orphaned ?? []) as MediaUploadRow[]) {
    try {
      assertObjectOwnership(userId, stale.kind, stale.object_path);
      const { error: removeError } = await client.storage.from(stale.bucket).remove([stale.object_path]);
      if (removeError) throw removeError;
      const { error: rowError } = await client
        .from("media_uploads")
        .delete()
        .eq("id", stale.id)
        .eq("user_id", userId)
        .eq("status", "orphaned");
      if (rowError) throw rowError;
    } catch {
      console.warn(JSON.stringify({ event: "media_orphan_cleanup_deferred", uploadId: stale.id }));
    }
  }
}

export async function deleteAnnotationMedia(userId: string, annotationId: string) {
  const client = adminClient();
  const { data, error } = await client
    .from("media_uploads")
    .select("*")
    .eq("annotation_id", annotationId)
    .eq("user_id", userId);
  if (error) throw new MediaStorageError(503, "Unable to inspect annotation media");
  for (const record of (data ?? []) as MediaUploadRow[]) {
    assertObjectOwnership(userId, record.kind, record.object_path);
    const { error: removeError } = await client.storage.from(record.bucket).remove([record.object_path]);
    if (removeError) throw new MediaStorageError(503, "Unable to remove annotation media");
    const { error: rowError } = await client.from("media_uploads").delete().eq("id", record.id).eq("user_id", userId);
    if (rowError) throw new MediaStorageError(503, "Unable to remove annotation media metadata");
  }
}

export async function deleteAllUserMedia(userId: string) {
  const client = adminClient();
  const { data, error } = await client.from("media_uploads").select("*").eq("user_id", userId);
  if (error) throw new MediaStorageError(503, "Unable to inspect account media");
  for (const record of (data ?? []) as MediaUploadRow[]) {
    assertObjectOwnership(userId, record.kind, record.object_path);
    const { error: removeError } = await client.storage.from(record.bucket).remove([record.object_path]);
    if (removeError) throw new MediaStorageError(503, "Unable to remove account media");
  }
}

export async function cleanupExpiredMediaUploads(options: { cutoffSeconds?: number; limit?: number } = {}) {
  const client = adminClient();
  const cutoff = Math.floor(Date.now() / 1000) - Math.max(3_600, options.cutoffSeconds ?? 24 * 60 * 60);
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  const { data, error } = await client
    .from("media_uploads")
    .select("*")
    .lt("created_at", cutoff)
    .or("status.in.(pending,ready,failed,orphaned),annotation_id.is.null")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new MediaStorageError(503, "Unable to inspect stale media");

  let removed = 0;
  const failures: string[] = [];
  for (const record of (data ?? []) as MediaUploadRow[]) {
    try {
      assertObjectOwnership(record.user_id, record.kind, record.object_path);
      const { error: removeError } = await client.storage.from(record.bucket).remove([record.object_path]);
      if (removeError) throw removeError;
      const { error: rowError } = await client.from("media_uploads").delete().eq("id", record.id);
      if (rowError) throw rowError;
      removed += 1;
    } catch {
      failures.push(record.id);
    }
  }
  return { scanned: data?.length ?? 0, removed, failures: failures.length };
}

export interface MediaStorageService {
  healthCheck: typeof mediaStorageHealthCheck;
  createSignedMediaUpload: typeof createSignedMediaUpload;
  finalizeMediaUpload: typeof finalizeMediaUpload;
  readyMediaUpload: typeof readyMediaUpload;
  inspectMediaUpload: typeof inspectMediaUpload;
  attachMediaUpload: typeof attachMediaUpload;
  deleteAnnotationMedia: typeof deleteAnnotationMedia;
  cleanupExpiredMediaUploads: typeof cleanupExpiredMediaUploads;
  deleteAllUserMedia: typeof deleteAllUserMedia;
}

export const mediaStorageService: MediaStorageService = {
  healthCheck: mediaStorageHealthCheck,
  createSignedMediaUpload,
  finalizeMediaUpload,
  readyMediaUpload,
  inspectMediaUpload,
  attachMediaUpload,
  deleteAnnotationMedia,
  cleanupExpiredMediaUploads,
  deleteAllUserMedia,
};
