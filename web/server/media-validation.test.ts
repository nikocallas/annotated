import assert from "node:assert/strict";
import test from "node:test";
import { MediaValidationError, validateUploadedMedia } from "./media-validation";

function id(value: number): Buffer {
  const hex = value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, "0");
  return Buffer.from(hex, "hex");
}

function size(value: number): Buffer {
  if (value < 0x7f) return Buffer.from([0x80 | value]);
  if (value < 0x3fff) return Buffer.from([0x40 | (value >> 8), value & 0xff]);
  return Buffer.from([0x20 | (value >> 16), (value >> 8) & 0xff, value & 0xff]);
}

function element(elementId: number, payload: Buffer): Buffer {
  return Buffer.concat([id(elementId), size(payload.length), payload]);
}

function uint(value: number): Buffer {
  if (value <= 0xff) return Buffer.from([value]);
  if (value <= 0xffff) {
    const output = Buffer.alloc(2);
    output.writeUInt16BE(value);
    return output;
  }
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value);
  return output;
}

function fakeWebM(options: { duration: number; video?: { width: number; height: number }; audio?: boolean }) {
  const ebml = element(0x1a45dfa3, element(0x4282, Buffer.from("webm")));
  const scale = 1_000_000;
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(options.duration * 1000);
  const info = element(0x1549a966, Buffer.concat([
    element(0x2ad7b1, uint(scale)),
    element(0x4489, duration),
  ]));
  const tracks: Buffer[] = [];
  if (options.video) {
    tracks.push(element(0xae, Buffer.concat([
      element(0x83, uint(1)),
      element(0xe0, Buffer.concat([
        element(0xb0, uint(options.video.width)),
        element(0xba, uint(options.video.height)),
      ])),
    ])));
  }
  if (options.audio) {
    tracks.push(element(0xae, Buffer.concat([
      element(0x83, uint(2)),
      element(0xe1, Buffer.alloc(0)),
    ])));
  }
  const segment = element(0x18538067, Buffer.concat([info, element(0x1654ae6b, Buffer.concat(tracks))]));
  return Buffer.concat([ebml, segment]);
}

test("accepts a verified 61-second 240p WebM clip", () => {
  const result = validateUploadedMedia(fakeWebM({
    duration: 61,
    video: { width: 426, height: 240 },
    audio: true,
  }), "clip-video");
  assert.equal(result.durationSeconds, 61);
  assert.equal(result.width, 426);
  assert.equal(result.height, 240);
});

test("rejects video above 240p", () => {
  assert.throws(
    () => validateUploadedMedia(fakeWebM({
      duration: 10,
      video: { width: 854, height: 480 },
      audio: true,
    }), "clip-video"),
    (error) => error instanceof MediaValidationError && /requires 240p/.test(error.message),
  );
});

test("rejects media beyond 90 seconds", () => {
  assert.throws(
    () => validateUploadedMedia(fakeWebM({ duration: 91, audio: true }), "clip-audio"),
    (error) => error instanceof MediaValidationError && /90-second/.test(error.message),
  );
});

test("accepts audio-only WebM and rejects video masquerading as audio", () => {
  const audio = validateUploadedMedia(fakeWebM({ duration: 30, audio: true }), "commentary-audio");
  assert.equal(audio.hasAudio, true);
  assert.equal(audio.hasVideo, false);
  assert.throws(() => validateUploadedMedia(fakeWebM({
    duration: 30,
    video: { width: 426, height: 240 },
    audio: true,
  }), "clip-audio"));
});
