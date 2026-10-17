export type MediaKind = "clip-video" | "clip-audio" | "commentary-audio" | "page-screenshot";

// Screenshots are stored small: enough to show what the page or X post looked
// like, never a full-resolution copy of someone else's page.
export const MAX_SCREENSHOT_DIMENSION = 1600;

export interface VerifiedMedia {
  durationSeconds: number;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  container: "webm" | "jpeg";
}

export class MediaValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

function readVint(buffer: Buffer, offset: number, keepMarker: boolean): Vint | null {
  const first = buffer[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) return null;
  let value = keepMarker ? first : first & (marker - 1);
  let unknown = !keepMarker && (first & (marker - 1)) === marker - 1;
  for (let index = 1; index < length; index++) {
    const byte = buffer[offset + index];
    value = value * 256 + byte;
    if (!keepMarker && byte !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

function unsigned(buffer: Buffer, start: number, end: number): number {
  let value = 0;
  for (let index = start; index < end; index++) value = value * 256 + buffer[index];
  return value;
}

const MASTER_IDS = new Set([
  0x1a45dfa3, // EBML
  0x18538067, // Segment
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0xe0, // Video
  0xe1, // Audio
  0x1f43b675, // Cluster
  0xa0, // BlockGroup
]);

export function inspectWebM(buffer: Buffer): VerifiedMedia {
  if (buffer.length < 16 || buffer.readUInt32BE(0) !== 0x1a45dfa3) {
    throw new MediaValidationError("Uploaded media is not a WebM container");
  }

  let docType = "";
  let timecodeScale = 1_000_000;
  let declaredDurationSeconds = 0;
  let maxTimecodeUnits = 0;
  let width: number | null = null;
  let height: number | null = null;
  let hasVideo = false;
  let hasAudio = false;
  let visited = 0;

  function walk(
    start: number,
    end: number,
    depth: number,
    clusterTimecode = 0,
    stopAtSiblingId: number | null = null,
  ): number {
    if (depth > 12) throw new MediaValidationError("WebM metadata nesting is invalid");
    let offset = start;
    let activeClusterTimecode = clusterTimecode;
    while (offset < end && offset < buffer.length) {
      if (++visited > 250_000) throw new MediaValidationError("WebM metadata is too complex");
      const id = readVint(buffer, offset, true);
      if (!id) break;
      // MediaRecorder writes a streamable Segment containing consecutive
      // unknown-sized Clusters. A following Cluster closes the previous one;
      // it is a sibling, not another nested master element.
      if (stopAtSiblingId !== null && id.value === stopAtSiblingId) return offset;
      const size = readVint(buffer, offset + id.length, false);
      if (!size) break;
      const dataStart = offset + id.length + size.length;
      const declaredEnd = size.unknown ? end : dataStart + size.value;
      let dataEnd = Math.min(declaredEnd, end, buffer.length);
      if (dataEnd < dataStart) throw new MediaValidationError("WebM element size is invalid");

      switch (id.value) {
        case 0x4282:
          docType = buffer.toString("utf8", dataStart, dataEnd).toLowerCase();
          break;
        case 0x2ad7b1:
          timecodeScale = unsigned(buffer, dataStart, dataEnd) || timecodeScale;
          break;
        case 0x4489: {
          const length = dataEnd - dataStart;
          const units = length === 4
            ? buffer.readFloatBE(dataStart)
            : length === 8
              ? buffer.readDoubleBE(dataStart)
              : 0;
          if (Number.isFinite(units) && units > 0) {
            declaredDurationSeconds = units * timecodeScale / 1_000_000_000;
          }
          break;
        }
        case 0x83: {
          const trackType = unsigned(buffer, dataStart, dataEnd);
          if (trackType === 1) hasVideo = true;
          if (trackType === 2) hasAudio = true;
          break;
        }
        case 0xb0:
          width = unsigned(buffer, dataStart, dataEnd) || null;
          break;
        case 0xba:
          height = unsigned(buffer, dataStart, dataEnd) || null;
          break;
        case 0xe7:
          activeClusterTimecode = unsigned(buffer, dataStart, dataEnd);
          maxTimecodeUnits = Math.max(maxTimecodeUnits, activeClusterTimecode);
          break;
        case 0xa3:
        case 0xa1: {
          const track = readVint(buffer, dataStart, false);
          if (track && dataStart + track.length + 2 <= dataEnd) {
            const relative = buffer.readInt16BE(dataStart + track.length);
            maxTimecodeUnits = Math.max(maxTimecodeUnits, activeClusterTimecode + relative);
          }
          break;
        }
      }

      if (MASTER_IDS.has(id.value) && dataEnd > dataStart) {
        const nestedClusterTimecode = id.value === 0x1f43b675 ? 0 : activeClusterTimecode;
        const childEnd = walk(
          dataStart,
          dataEnd,
          depth + 1,
          nestedClusterTimecode,
          id.value === 0x1f43b675 && size.unknown ? 0x1f43b675 : null,
        );
        if (size.unknown && childEnd < dataEnd) dataEnd = childEnd;
      }
      offset = dataEnd > offset ? dataEnd : offset + 1;
    }
    return offset;
  }

  walk(0, buffer.length, 0);

  if (docType !== "webm" && docType !== "matroska") {
    throw new MediaValidationError("Uploaded media does not declare a WebM document type");
  }
  const observedDurationSeconds = maxTimecodeUnits * timecodeScale / 1_000_000_000;
  const durationSeconds = Math.max(declaredDurationSeconds, observedDurationSeconds);
  return {
    durationSeconds,
    width,
    height,
    hasVideo,
    hasAudio,
    container: "webm",
  };
}

/**
 * Verifies a baseline or progressive JPEG and reads its pixel dimensions from
 * the first start-of-frame segment. Anything else is rejected.
 */
export function inspectJpeg(buffer: Buffer): VerifiedMedia {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new MediaValidationError("Uploaded screenshot is not a JPEG image");
  }
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) throw new MediaValidationError("JPEG structure is invalid");
    const marker = buffer[offset + 1];
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) {
      throw new MediaValidationError("JPEG segment size is invalid");
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (length < 7) throw new MediaValidationError("JPEG frame header is invalid");
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (!width || !height) throw new MediaValidationError("JPEG dimensions are invalid");
      return { durationSeconds: 0, width, height, hasVideo: false, hasAudio: false, container: "jpeg" };
    }
    offset += 2 + length;
  }
  throw new MediaValidationError("Unable to read the screenshot dimensions");
}

export function validateUploadedMedia(buffer: Buffer, kind: MediaKind): VerifiedMedia {
  if (kind === "page-screenshot") {
    const image = inspectJpeg(buffer);
    if ((image.width ?? 0) > MAX_SCREENSHOT_DIMENSION || (image.height ?? 0) > MAX_SCREENSHOT_DIMENSION) {
      throw new MediaValidationError(
        `Screenshot is ${image.width}x${image.height}; the limit is ${MAX_SCREENSHOT_DIMENSION}px per side`,
      );
    }
    return image;
  }
  const media = inspectWebM(buffer);
  if (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0) {
    throw new MediaValidationError("Unable to verify the uploaded media duration");
  }
  if (media.durationSeconds > 90.5) {
    throw new MediaValidationError("Uploaded media exceeds the 90-second limit");
  }
  if (kind === "clip-video") {
    if (!media.hasVideo || !media.width || !media.height) {
      throw new MediaValidationError("Video clip does not contain a verifiable video track");
    }
    if (media.height > 240) {
      throw new MediaValidationError(`Video clip is ${media.height}p; Annotated requires 240p or lower`);
    }
  } else {
    if (!media.hasAudio || media.hasVideo) {
      throw new MediaValidationError("Audio upload must contain audio only");
    }
  }
  return media;
}
