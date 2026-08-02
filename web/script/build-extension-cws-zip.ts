// Packages the repo's extension/ directory into a clean upload artifact for
// the Chrome Web Store Developer Dashboard. Output is a zip with manifest.json
// at the root (no parent folder, no macOS/dotfile junk, no node_modules, no
// dist artifacts). Run via `npm run build:extension:cws`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const extensionDir = resolve(repoRoot, "extension");
const outFile =
  process.env.CWS_ZIP_OUT ?? resolve(repoRoot, "annotated-chrome-web-store.zip");

if (!existsSync(extensionDir)) {
  console.error(`extension/ not found at ${extensionDir}`);
  process.exit(1);
}

mkdirSync(resolve(outFile, ".."), { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

execFileSync(
  "zip",
  [
    "-X",
    "-r",
    outFile,
    ".",
    "-x",
    "*.DS_Store",
    "**/.DS_Store",
    "__MACOSX/*",
    "node_modules/*",
    "**/node_modules/*",
    "dist/*",
    "**/dist/*",
    ".git/*",
    "*.md",
    "*.d.mts",
    "**/*.d.mts",
  ],
  { cwd: extensionDir, stdio: "inherit" },
);

console.log(`packaged Chrome Web Store upload → ${outFile}`);
