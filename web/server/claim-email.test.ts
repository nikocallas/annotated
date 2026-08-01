import assert from "node:assert/strict";
import test from "node:test";
import { resolvePosterContact } from "./claim-email";

test("legacy non-UUID author subjects skip the auth admin lookup without raw warnings", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousWarn = console.warn;
  let warned = false;

  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  console.warn = () => {
    warned = true;
  };

  try {
    const result = await resolvePosterContact({
      authId: "google-niko-seed",
      authProvider: "google",
    });
    assert.deepEqual(result, { email: null, source: "not_found" });
    assert.equal(warned, false);
  } finally {
    console.warn = previousWarn;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});
