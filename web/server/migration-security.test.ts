import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationRoot = resolve(import.meta.dirname, "..", "..", "supabase", "migrations");

test("security migrations force RLS and remove direct client mutations", () => {
  const sql = readFileSync(resolve(migrationRoot, "0011_security_hardening.sql"), "utf8").toLowerCase();
  for (const table of ["users", "follows", "annotations", "comments", "claims", "bookmarks", "votes"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(sql, /revoke all on public\.users[\s\S]*from anon, authenticated/);
  assert.doesNotMatch(sql, /disable row level security/);
  assert.match(sql, /grant execute on function public\.increment_annotation_view\(text\) to service_role/);
});

test("media, rate-limit, and claim-audit data are server-owned", () => {
  const media = readFileSync(resolve(migrationRoot, "0012_media_uploads.sql"), "utf8").toLowerCase();
  const audit = readFileSync(resolve(migrationRoot, "0013_rate_limits_claim_audit.sql"), "utf8").toLowerCase();
  assert.match(media, /alter table public\.media_uploads force row level security/);
  assert.match(media, /revoke all on public\.media_uploads from public, anon, authenticated/);
  assert.match(media, /20971520/);
  assert.match(audit, /revoke all on public\.rate_limit_buckets from public, anon, authenticated/);
  assert.match(audit, /revoke all on public\.claim_events from public, anon, authenticated/);
  assert.match(audit, /grant execute on function public\.consume_rate_limit[\s\S]*to service_role/);
  assert.match(audit, /update public\.claims set status = 'received' where status = 'pending'/);
  assert.match(audit, /check \(status in \('received', 'reviewing', 'resolved', 'rejected'\)\)/);
});
