// Build the minimal, byte-reproducible Chrome Web Store upload archive.
import { resolve } from "node:path";
import { buildExtensionArchive } from "./extension-archive";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const extensionDir = resolve(repoRoot, "extension");
const outFile = process.env.CWS_ZIP_OUT ?? resolve(repoRoot, "annotated-chrome-web-store.zip");

buildExtensionArchive(extensionDir, outFile);
console.log(`packaged Chrome Web Store upload → ${outFile}`);
