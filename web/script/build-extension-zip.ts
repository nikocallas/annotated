// Packages the repo's extension/ directory into
// web/client/public/downloads/annotated-extension.zip so the static site can
// serve it as a one-click download. Run before the Vite build, or whenever
// the extension changes. Falls back to the system `zip` command for a
// dependency-free implementation.
//
// On Vercel the deploy root is web/, so the sibling extension/ directory is
// not present. In that case we keep the checked-in zip artifact and skip
// repackaging; we only fail when both the source and the zip are missing.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const extensionDir = resolve(repoRoot, "extension");
const outDir = resolve(import.meta.dirname, "..", "client", "public", "downloads");
const outFile = resolve(outDir, "annotated-extension.zip");

if (!existsSync(extensionDir)) {
  if (existsSync(outFile)) {
    console.warn(
      `extension/ not found at ${extensionDir}; using checked-in zip at ${outFile}`,
    );
    process.exit(0);
  }
  console.error(
    `extension/ not found at ${extensionDir} and no prebuilt zip at ${outFile}`,
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) rmSync(outFile);

execFileSync(
  "zip",
  ["-r", outFile, ".", "-x", "*.DS_Store", "node_modules/*", "dist/*"],
  { cwd: extensionDir, stdio: "inherit" },
);

console.log(`packaged extension → ${outFile}`);
