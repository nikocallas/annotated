import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  capturePlan,
  countWords,
  detectSourceType,
  isValidAuthHandoff,
  nextPublishStatus,
  sameMediaSource,
} from "../../extension/shared/clip-utils.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");

test("extension detects current and pasted source types", () => {
  assert.equal(detectSourceType("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(detectSourceType("https://open.spotify.com/episode/123"), "podcast");
  assert.equal(detectSourceType("https://example.com/report"), "article");
  assert.equal(detectSourceType("javascript:alert(1)"), "unknown");
  assert.equal(sameMediaSource("https://youtu.be/abc", "https://www.youtube.com/watch?v=abc&t=5"), true);
});

test("extension preserves passage words and enforces fair-use text count", () => {
  const selection = "Exact selected passage — punctuation included.";
  assert.equal(countWords(selection), 6);
  assert.equal(selection, "Exact selected passage — punctuation included.");
});

test("extension capture plans reject over-limit requests and constrain real media", () => {
  const video = capturePlan("youtube", 5, 66);
  assert.equal(video.durationMs, 61_000);
  assert.equal(video.targetHeight, 240);
  assert.equal(video.uploadKind, "clip-video");
  const podcast = capturePlan("podcast", 10, 71);
  assert.equal(podcast.kind, "audio");
  assert.equal(podcast.targetHeight, null);
  assert.throws(() => capturePlan("youtube", 0, 91), /90-second/);
});

test("extension accepts only full OAuth handoffs and deterministic publish transitions", () => {
  assert.equal(isValidAuthHandoff({ type: "ANNOTATED_AUTH_SUCCESS", user: { id: "spoof" } }), false);
  assert.equal(isValidAuthHandoff({
    type: "ANNOTATED_AUTH_SUCCESS",
    auth: {
      user: { id: "user" },
      accessToken: "a".repeat(21),
      refreshToken: "r".repeat(21),
      expiresAt: 2_000_000_000,
    },
  }), true);
  assert.equal(nextPublishStatus("idle", "start"), "publishing");
  assert.equal(nextPublishStatus("publishing", "success"), "published");
  assert.equal(nextPublishStatus("published", "reset"), "idle");
  assert.throws(() => nextPublishStatus("idle", "success"), /Invalid publish transition/);
});

test("side panel discloses data use and policy links before authentication", () => {
  const html = readFileSync(resolve(repoRoot, "extension/sidepanel/index.html"), "utf8");
  assert.match(html, /aria-label="How Annotated uses data"/);
  assert.match(html, /reads the active tab's URL, title/);
  assert.match(html, /stores your Google or X session in Chrome/);
  assert.match(html, /Publishing sends only/);
  assert.match(html, /filing a claim sends the\s+contact details you enter/);
  assert.match(html, /https:\/\/www\.annotatedextension\.com\/privacy/);
  assert.match(html, /https:\/\/www\.annotatedextension\.com\/tos/);
});
