import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const ignoredDirectories = new Set([".git", "node_modules", ".vercel"]);
const ignoredFiles = new Set([
  "web/script/security-scan.ts",
]);
const patterns = [
  new RegExp(["eyJ", "[A-Za-z0-9_-]{20,}", "\\.", "eyJ", "[A-Za-z0-9_-]{20,}", "\\.", "[A-Za-z0-9_-]{20,}"].join("")),
  new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join("")),
  new RegExp(["(?:ghp|github_pat|sk_live|sb_secret)_", "[A-Za-z0-9_-]{16,}"].join("")),
  new RegExp(["VERCEL_", "TOKEN\\s*=\\s*", "[^\\s<>{}\\[\\]]{16,}"].join(""), "i"),
];

const findings: string[] = [];
function walk(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = resolve(directory, entry.name);
    const path = relative(repoRoot, full);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() && !lstatSync(full).isSymbolicLink()) continue;
    if (ignoredFiles.has(path) || /\.(zip|png|jpe?g|gif|webp|mp4|webm|woff2?)$/i.test(path)) continue;
    let body: Buffer;
    try {
      body = readFileSync(full);
    } catch {
      continue;
    }
    if (body.length > 5_000_000 || body.includes(0)) continue;
    const text = body.toString("utf8");
    if (patterns.some((pattern) => pattern.test(text))) findings.push(path);
  }
}

walk(repoRoot);
assert.equal(findings.length, 0, `possible committed or bundled secret in: ${findings.join(", ")}`);

const history = execFileSync(
  "git",
  [
    "log",
    "-p",
    "--full-history",
    "--all",
    "--",
    ".",
    ":(exclude)web/script/security-scan.ts",
    ":(exclude)*.zip",
    ":(exclude)*.png",
    ":(exclude)*.jpg",
    ":(exclude)*.jpeg",
    ":(exclude)*.gif",
    ":(exclude)*.webp",
    ":(exclude)*.woff",
    ":(exclude)*.woff2",
  ],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
);
assert.equal(
  patterns.some((pattern) => pattern.test(history)),
  false,
  "possible secret pattern in repository history",
);

const historicalNames = execFileSync(
  "git",
  ["log", "--all", "--name-only", "--pretty=format:"],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
)
  .split("\n")
  .map((path) => path.trim())
  .filter(Boolean);
const sensitiveName = /(^|\/)(\.env($|\.)|.*credentials.*|.*service.?account.*|id_(rsa|ed25519)$)/i;
const unexpectedSensitiveNames = [...new Set(historicalNames)].filter(
  (path) => path !== "web/.env.example" && sensitiveName.test(path),
);
assert.equal(
  unexpectedSensitiveNames.length,
  0,
  `sensitive-looking filename in repository history: ${unexpectedSensitiveNames.join(", ")}`,
);

console.log("working-tree and repository-history secret-pattern scan passed");
