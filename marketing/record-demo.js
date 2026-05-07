// Records each animated HTML scene at 1280x720, plus a real recording of
// www.annotatedextension.com (landing + feed scroll), then concatenates into
// a single MP4 via ffmpeg-static. Output: marketing/annotated-demo.mp4.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const here = dirname(fileURLToPath(import.meta.url));
const scenesDir = join(here, "scenes");
const recDir = join(here, "recordings");
const fileUrl = (rel) => "file://" + resolve(scenesDir, rel);

const SCENES = [
  { name: "01-intro",   url: fileUrl("scene-intro.html"),   ms: 3000 },
  { name: "02-youtube", url: fileUrl("scene-youtube.html"), ms: 7500 },
  { name: "03-nyt",     url: fileUrl("scene-nyt.html"),     ms: 7000 },
  { name: "04-podcast", url: fileUrl("scene-podcast.html"), ms: 7500 },
  { name: "05-feed",    url: "https://www.annotatedextension.com/", ms: 11000, action: "tourAnnotations" },
  { name: "06-outro",   url: fileUrl("scene-outro.html"),   ms: 4000 },
];

// Clean recordings dir
try { rmSync(recDir, { recursive: true, force: true }); } catch {}
try { renameSync(recDir, recDir); } catch {}
import("node:fs").then((fs) => fs.mkdirSync(recDir, { recursive: true }));

const browser = await chromium.launch();
const finals = [];

for (const scene of SCENES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: recDir, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();

  if (scene.action === "tourAnnotations") {
    // Tour real annotation detail pages so the recording shows actual product
    // output — a YouTube clip playing in-range, then a Spotify clip — instead
    // of the landing-page hero.
    await page.goto("https://www.annotatedextension.com/#/a/seed-ann-niko-45", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(5500);
    // Hash-route to the next annotation without a full reload — preserves the
    // recording's smoothness and stays inside the SPA.
    await page.evaluate(() => {
      window.location.hash = "#/a/seed-ann-niko-35";
    });
    await page.waitForTimeout(5400);
  } else {
    await page.goto(scene.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(scene.ms);
  }

  const video = page.video();
  await page.close();
  await ctx.close();
  const rawPath = await video.path();
  const renamed = join(recDir, `${scene.name}.webm`);
  renameSync(rawPath, renamed);
  finals.push(renamed);
  console.log(`✓ ${scene.name}`);
}

await browser.close();

// ── Concatenate via ffmpeg ──────────────────────────────────────────────────
// Each WebM input is decoded and re-encoded to a uniform 1280x720 30fps H.264
// stream so the concat is glitch-free even if Playwright's per-scene framerate
// varied. -movflags +faststart puts the moov atom up front for streaming.
const listPath = join(recDir, "concat.txt");
writeFileSync(listPath, finals.map((p) => `file '${p}'`).join("\n"), "utf8");

const out = join(here, "annotated-demo.mp4");
const args = [
  "-y",
  "-f", "concat", "-safe", "0", "-i", listPath,
  "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-an",
  out,
];
console.log("\nffmpeg", args.slice(0, 6).join(" "), "…");
const ff = spawnSync(ffmpegPath, args, { stdio: ["ignore", "inherit", "inherit"] });
if (ff.status !== 0) {
  console.error("ffmpeg failed");
  process.exit(ff.status ?? 1);
}
console.log(`\nMP4 written → ${out}`);
