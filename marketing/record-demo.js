// Render a product-accurate, caption-led Annotated demo from local HTML scenes.
// The scenes use real Chrome-extension and production feed/detail captures.
// Run from the repository root with: npm --prefix web run demo:render
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(join(here, "../web/package.json"));
const { chromium } = requireFromWeb("playwright");
const scenesDir = join(here, "scenes");
const recordingsDir = join(here, "recordings");
const fileUrl = (name) => `file://${resolve(scenesDir, name)}`;

const scenes = [
  { name: "01-intro", file: "scene-intro.html", ms: 4000 },
  { name: "02-youtube", file: "scene-youtube.html", ms: 8000 },
  { name: "03-article", file: "scene-nyt.html", ms: 8000 },
  { name: "04-podcast", file: "scene-podcast.html", ms: 8000 },
  { name: "05-feed", file: "scene-feed.html", ms: 9500 },
  { name: "06-detail", file: "scene-detail.html", ms: 8000 },
  { name: "07-outro", file: "scene-outro.html", ms: 4500 },
];

rmSync(recordingsDir, { recursive: true, force: true });
mkdirSync(recordingsDir, { recursive: true });

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const rendered = [];

for (const scene of scenes) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "no-preference",
    recordVideo: { dir: recordingsDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(fileUrl(scene.file), { waitUntil: "load" });
  await page.waitForTimeout(scene.ms);
  const video = page.video();
  await page.close();
  await context.close();
  const output = join(recordingsDir, `${scene.name}.webm`);
  renameSync(await video.path(), output);
  rendered.push(output);
  console.log(`rendered ${scene.name}`);
}

await browser.close();

const listPath = join(recordingsDir, "concat.txt");
writeFileSync(listPath, rendered.map((path) => `file '${path}'`).join("\n"), "utf8");

const outputPath = join(here, "../web/client/public/media/annotated-demo.mp4");
const posterPath = join(here, "../web/client/public/media/annotated-demo-poster.jpg");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const encode = spawnSync(ffmpeg, [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", listPath,
  "-vf", "fps=30,scale=1280:720:flags=lanczos,format=yuv420p",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-an",
  outputPath,
], { stdio: "inherit" });

if (encode.status !== 0) process.exit(encode.status ?? 1);

const poster = spawnSync(ffmpeg, [
  "-y", "-ss", "00:00:05.800", "-i", outputPath,
  "-frames:v", "1", "-q:v", "2", posterPath,
], { stdio: "inherit" });
if (poster.status !== 0) process.exit(poster.status ?? 1);

console.log(`demo video: ${outputPath}`);
console.log(`demo poster: ${posterPath}`);
