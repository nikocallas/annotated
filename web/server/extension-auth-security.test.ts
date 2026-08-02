import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ANNOTATED_EXTENSION_ID,
  EXTENSION_AUTH_FLOW_MAX_AGE_MS,
  parseStoredExtensionAuthFlow,
} from "../client/src/lib/extension-auth";

const repoRoot = resolve(import.meta.dirname, "..", "..");

test("website OAuth handoff is pinned to the published extension identity", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, "extension/manifest.json"), "utf8"),
  ) as { key: string };
  const digest = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest()
    .subarray(0, 16);
  const derivedId = Array.from(digest)
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode(97 + nibble))
    .join("");

  assert.equal(ANNOTATED_EXTENSION_ID, derivedId);
});

test("stored extension OAuth flow rejects malicious, malformed, stale, and future IDs", () => {
  const now = 2_000_000_000_000;
  assert.deepEqual(
    parseStoredExtensionAuthFlow(
      JSON.stringify({ extensionId: ANNOTATED_EXTENSION_ID, ts: now - 1_000 }),
      now,
    ),
    { extensionId: ANNOTATED_EXTENSION_ID, ts: now - 1_000 },
  );

  for (const raw of [
    null,
    "not-json",
    JSON.stringify({ extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ts: now }),
    JSON.stringify({ extensionId: ANNOTATED_EXTENSION_ID }),
    JSON.stringify({ extensionId: ANNOTATED_EXTENSION_ID, ts: "now" }),
    JSON.stringify({ extensionId: ANNOTATED_EXTENSION_ID, ts: now - EXTENSION_AUTH_FLOW_MAX_AGE_MS - 1 }),
    JSON.stringify({ extensionId: ANNOTATED_EXTENSION_ID, ts: now + 60_001 }),
  ]) {
    assert.equal(parseStoredExtensionAuthFlow(raw, now), null);
  }
});

test("callback sends only to the pinned ID and keeps a real retry path", () => {
  const callback = readFileSync(
    resolve(repoRoot, "web/client/src/pages/auth-callback.tsx"),
    "utf8",
  );
  const login = readFileSync(
    resolve(repoRoot, "web/client/src/pages/login.tsx"),
    "utf8",
  );

  assert.match(callback, /sendMessage\(ANNOTATED_EXTENSION_ID,/);
  assert.doesNotMatch(callback, /sendMessage\(extensionId,/);
  assert.match(callback, /button-extension-handoff-retry/);
  assert.match(callback, /await attemptExtensionHandoff\(\)/);
  assert.doesNotMatch(callback, /reopen the side panel.*picked up/i);
  assert.match(login, /isAnnotatedExtensionId\(extensionId\)/);
});

test("website auth synchronization does not re-enter Supabase session locking", () => {
  const authContext = readFileSync(
    resolve(repoRoot, "web/client/src/lib/auth-context.tsx"),
    "utf8",
  );

  assert.match(authContext, /exchangeSupabaseSession\(accessToken: string\)/);
  assert.match(authContext, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.equal(authContext.match(/exchangeSupabaseSession\(token\)/g)?.length, 2);
  assert.doesNotMatch(authContext, /async function exchangeSupabaseSession\(\)[\s\S]*getSession\(\)/);
});
