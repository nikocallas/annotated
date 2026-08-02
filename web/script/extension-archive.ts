import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";

const FIXED_ARCHIVE_TIME = new Date("2000-01-01T00:00:00.000Z");
const excludedDirectoryNames = new Set([".git", "__MACOSX", "dist", "node_modules"]);

function shouldExclude(path: string) {
  const name = path.split("/").at(-1) ?? path;
  return (
    name === ".DS_Store" ||
    name.endsWith(".d.mts") ||
    name.endsWith(".md") ||
    name.endsWith(".map") ||
    /^\.env(?:\.|$)/i.test(name)
  );
}

function listArchiveFiles(root: string) {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = resolve(directory, entry.name);
      const archivePath = relative(root, fullPath).split("\\").join("/");
      if (entry.isDirectory()) {
        if (!excludedDirectoryNames.has(entry.name)) walk(fullPath);
      } else if (entry.isFile() && !shouldExclude(archivePath)) {
        files.push(archivePath);
      }
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

export function buildExtensionArchive(extensionDir: string, outFile: string) {
  if (!existsSync(extensionDir)) throw new Error(`extension/ not found at ${extensionDir}`);
  const stagingDir = mkdtempSync(resolve(tmpdir(), "annotated-extension-archive-"));
  const files = listArchiveFiles(extensionDir);

  try {
    for (const archivePath of files) {
      const source = resolve(extensionDir, archivePath);
      const target = resolve(stagingDir, archivePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      chmodSync(target, 0o644);
      utimesSync(target, FIXED_ARCHIVE_TIME, FIXED_ARCHIVE_TIME);
    }

    mkdirSync(dirname(outFile), { recursive: true });
    if (existsSync(outFile)) rmSync(outFile);
    execFileSync("zip", ["-X", "-q", outFile, "-@"], {
      cwd: stagingDir,
      env: { ...process.env, TZ: "UTC" },
      input: `${files.join("\n")}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (!statSync(outFile).size) throw new Error(`archive is empty: ${outFile}`);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
