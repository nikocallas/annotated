import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const extensionDir = resolve(repoRoot, "extension");
const manifest = JSON.parse(readFileSync(resolve(extensionDir, "manifest.json"), "utf8")) as {
  manifest_version: number;
  minimum_chrome_version?: string;
  version: string;
  key?: string;
  permissions: string[];
  host_permissions: string[];
  externally_connectable?: { matches?: string[] };
};

assert.equal(manifest.manifest_version, 3, "extension must use Manifest V3");
assert.equal(
  manifest.minimum_chrome_version,
  "116",
  "offscreen tab capture from a service-worker stream ID requires Chrome 116+",
);
assert(manifest.key, "the public Web Store key must pin the unpacked extension ID");
const keyDigest = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest()
  .subarray(0, 16);
const derivedExtensionId = Array.from(keyDigest)
  .flatMap((byte) => [byte >> 4, byte & 15])
  .map((nibble) => String.fromCharCode(97 + nibble))
  .join("");
assert.equal(
  derivedExtensionId,
  "eaealcbiidjigfndjchchbnjdjicbajb",
  "the unpacked build must retain the published extension ID",
);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "extension version must be release-shaped");
assert.deepEqual(
  [...manifest.host_permissions].sort(),
  [
    "https://annotatedextension.com/*",
    "https://www.annotatedextension.com/*",
    "https://cpqmjujhcwpavrsjadjz.supabase.co/*",
  ].sort(),
  "host access must stay limited to the Annotated API/site and its exact media-storage origin",
);
assert.deepEqual(
  [...(manifest.externally_connectable?.matches ?? [])].sort(),
  ["https://annotatedextension.com/*", "https://www.annotatedextension.com/*"].sort(),
  "external auth messages must stay limited to Annotated production origins",
);
const allowedPermissions = new Set([
  "activeTab",
  "offscreen",
  "scripting",
  "sidePanel",
  "storage",
  "tabCapture",
  "tabs",
]);
for (const permission of manifest.permissions) {
  assert(allowedPermissions.has(permission), `unexpected extension permission: ${permission}`);
}

const javascript = [
  "background/service-worker.js",
  "content/content-script.js",
  "offscreen/offscreen.js",
  "sidepanel/sidepanel.js",
  "shared/clip-utils.mjs",
];
for (const file of javascript) {
  const path = resolve(extensionDir, file);
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  const source = readFileSync(path, "utf8");
  assert(!/\beval\s*\(|new\s+Function\s*\(/.test(source), `${file} contains dynamic code execution`);
}

for (const file of ["sidepanel/index.html", "offscreen/offscreen.html"]) {
  const html = readFileSync(resolve(extensionDir, file), "utf8");
  assert(!/<script[^>]+src=["']https?:/i.test(html), `${file} loads a remote script`);
  assert(!/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i.test(html), `${file} loads a remote stylesheet`);
}

const tempDir = mkdtempSync(resolve(tmpdir(), "annotated-extension-check-"));
const zipPath = resolve(tempDir, "annotated-extension.zip");
try {
  execFileSync(
    "zip",
    [
      "-qr",
      zipPath,
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
    { cwd: extensionDir },
  );
  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  assert(entries.includes("manifest.json"), "package must contain manifest.json at its root");
  assert(entries.includes("background/service-worker.js"), "package is missing the service worker");
  assert(entries.includes("sidepanel/index.html"), "package is missing the side panel");
  assert(!entries.some((entry) => /(^|\/)(node_modules|dist|__MACOSX|\.git)(\/|$)/.test(entry)), "package contains build-only files");
  assert(!entries.some((entry) => /\.map$|\.md$|\.d\.mts$|\.DS_Store$|\.env/i.test(entry)), "package contains a stale or sensitive file");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(`extension ${manifest.version} package validation passed`);
