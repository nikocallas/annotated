// Build the same reviewed, byte-reproducible extension archive served by the site.
// On Vercel the repository root may exclude extension/, so the checked-in archive
// is served unchanged when the source directory is unavailable.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildExtensionArchive } from "./extension-archive";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const extensionDir = resolve(repoRoot, "extension");
const outFile = resolve(import.meta.dirname, "..", "client", "public", "downloads", "annotated-extension.zip");

if (process.env.VERCEL && existsSync(outFile)) {
  console.log(`using validated extension archive → ${outFile}`);
  process.exit(0);
}

if (!existsSync(extensionDir) && existsSync(outFile)) {
  console.warn(`extension/ not found at ${extensionDir}; using checked-in zip at ${outFile}`);
  process.exit(0);
}

buildExtensionArchive(extensionDir, outFile);
console.log(`packaged extension → ${outFile}`);
