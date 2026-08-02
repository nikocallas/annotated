import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStorage } from "./storage";

function uniqueRaceClient(calls: { inserts: string[]; updates: string[] }): SupabaseClient {
  return {
    from(table: string) {
      const query: Record<string, unknown> & PromiseLike<unknown> = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async () => {
          calls.inserts.push(table);
          return { data: null, error: { code: "23505", message: "duplicate unique pair" } };
        },
        update() {
          calls.updates.push(table);
          return query;
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve({ data: table === "votes" ? [] : null, error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

test("concurrent unique social inserts converge without a server error", async () => {
  const calls = { inserts: [] as string[], updates: [] as string[] };
  const storage = new SupabaseStorage(uniqueRaceClient(calls));

  await storage.follow("actor", "author");
  await storage.bookmark("actor", "annotation");
  const vote = await storage.setVote("actor", "annotation", 1);

  assert.deepEqual(calls.inserts, ["follows", "bookmarks", "votes"]);
  assert.deepEqual(calls.updates, ["votes"]);
  assert.equal(vote.viewerVote, 1);
});
