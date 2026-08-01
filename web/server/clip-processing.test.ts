import assert from "node:assert/strict";
import test from "node:test";
import { validateClipDuration, validateSourceUrl } from "./clip-processing";

test("clip range accepts 90 seconds and rejects anything longer", () => {
  assert.equal(validateClipDuration(10, 100), 90);
  assert.throws(() => validateClipDuration(10, 101), /Max allowed is 90s/);
  assert.throws(() => validateClipDuration(4, 4), /greater than start/);
});

test("source URLs require credential-free HTTPS", () => {
  assert.doesNotThrow(() => validateSourceUrl("https://example.com/article"));
  assert.throws(() => validateSourceUrl("http://example.com/article"), /valid URL/);
  assert.throws(() => validateSourceUrl("https://user:pass@example.com/article"), /valid URL/);
  assert.throws(() => validateSourceUrl("javascript:alert(1)"), /valid URL/);
});
