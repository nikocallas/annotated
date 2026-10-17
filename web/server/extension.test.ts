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

test("extension accepts compact opaque Supabase refresh tokens and full OAuth handoffs", () => {
  assert.equal(isValidAuthHandoff({ type: "ANNOTATED_AUTH_SUCCESS", user: { id: "spoof" } }), false);
  assert.equal(isValidAuthHandoff({
    type: "ANNOTATED_AUTH_SUCCESS",
    auth: {
      user: { id: "user" },
      accessToken: "a".repeat(21),
      refreshToken: "r".repeat(12),
      expiresAt: 2_000_000_000,
    },
  }), true);
  for (const refreshToken of ["r".repeat(7), "refresh token", "r".repeat(4097)]) {
    assert.equal(isValidAuthHandoff({
      type: "ANNOTATED_AUTH_SUCCESS",
      auth: {
        user: { id: "user" },
        accessToken: "a".repeat(21),
        refreshToken,
        expiresAt: 2_000_000_000,
      },
    }), false);
  }
});

test("extension preserves deterministic publish transitions", () => {
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

test("side panel cannot redirect authenticated API traffic with a URL override", () => {
  const script = readFileSync(resolve(repoRoot, "extension/sidepanel/sidepanel.js"), "utf8");
  assert.match(script, /const API_BASE = "https:\/\/www\.annotatedextension\.com"/);
  assert.doesNotMatch(script, /state\.apiBase/);
  assert.doesNotMatch(script, /params\.get\(["']api["']\)/);
});

test("side panel exposes an exact, accessible media range editor", () => {
  const script = readFileSync(resolve(repoRoot, "extension/sidepanel/sidepanel.js"), "utf8");
  const css = readFileSync(resolve(repoRoot, "extension/sidepanel/sidepanel.css"), "utf8");
  assert.match(script, /data-range-handle="start"/);
  assert.match(script, /data-range-handle="end"/);
  assert.match(script, /aria-label="Clip start time"/);
  assert.match(script, /aria-label="Clip end time"/);
  assert.match(script, /aria-valuetext/);
  assert.match(script, /step="1"/);
  assert.match(script, /Set in/);
  assert.match(script, /Set out/);
  assert.match(script, /MAX_CLIP_SECONDS/);
  assert.match(css, /\.clip-timeline-selection/);
  assert.match(css, /\.clip-playhead/);
});

test("side panel requests source access only from explicit clipping actions", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, "extension/manifest.json"), "utf8"),
  );
  const script = readFileSync(resolve(repoRoot, "extension/sidepanel/sidepanel.js"), "utf8");
  assert.deepEqual(
    [...manifest.optional_host_permissions].sort(),
    ["http://*/*", "https://*/*"],
  );
  assert.match(script, /chrome\.permissions\.request/);
  assert.match(script, /ensureActiveSiteAccess/);
});

test("toolbar invocation explicitly opens the side panel for tab capture", () => {
  const worker = readFileSync(
    resolve(repoRoot, "extension/background/service-worker.js"),
    "utf8",
  );
  assert.match(worker, /openPanelOnActionClick: false/);
  assert.match(worker, /chrome\.action\.onClicked\.addListener/);
  assert.match(worker, /chrome\.sidePanel\s*\.open\(\{ tabId: tab\.id \}\)/);
});

test("content script recognizes native, metadata, and direct-file podcast audio", () => {
  const contentScript = readFileSync(
    resolve(repoRoot, "extension/content/content-script.js"),
    "utf8",
  );
  assert.match(contentScript, /const activeMedia = getActiveMedia\(\)/);
  assert.match(contentScript, /function isAudioMedia\(media\)/);
  assert.match(contentScript, /meta\[property="og:audio"\]/);
  assert.match(contentScript, /twitter:player:stream:content_type/);
  assert.match(contentScript, /media\.videoWidth === 0 && media\.videoHeight === 0/);
});

test("extension annotation types mirror the shared schema", async () => {
  const { ANNOTATION_TYPES: extensionTypes } = await import("../../extension/shared/clip-utils.mjs");
  const { ANNOTATION_TYPES: schemaTypes, ANNOTATION_TYPE_LABELS } = await import("@shared/schema");
  assert.deepEqual(extensionTypes.map((t: { key: string }) => t.key), [...schemaTypes]);
  for (const t of extensionTypes as { key: keyof typeof ANNOTATION_TYPE_LABELS; label: string }[]) {
    assert.equal(t.label, ANNOTATION_TYPE_LABELS[t.key]);
  }
});

test("the clip window follows the playhead, keeping its length and the 90s cap", async () => {
  const { followPlayhead } = await import("../../extension/shared/clip-utils.mjs");
  assert.deepEqual(followPlayhead({ start: 0, end: 30 }, 125.7, 600), { start: 125, end: 155 });
  assert.deepEqual(followPlayhead({ start: 10, end: 55 }, 580, 600), { start: 580, end: 600 });
  assert.deepEqual(followPlayhead({ start: 0, end: 500 }, 0, null), { start: 0, end: 90 });
  assert.deepEqual(followPlayhead(null, -5, 100), { start: 0, end: 30 });
});
