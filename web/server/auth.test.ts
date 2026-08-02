import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import type { InsertUser, User } from "@shared/schema";
import { createAuthService } from "./auth";
import { MemoryStorage } from "./storage";

const oauthUser = {
  id: "12345678-1234-4234-9234-123456789abc",
  email: "first@example.com",
  app_metadata: { provider: "google" },
  user_metadata: { full_name: "First User", user_name: "first" },
} as SupabaseUser;

function requestWithToken(): Request {
  return {
    header(name: string) {
      return name.toLowerCase() === "authorization" ? "Bearer verified-token" : undefined;
    },
  } as Request;
}

function verifiedClient(): SupabaseClient {
  return {
    auth: {
      async getUser() {
        return { data: { user: oauthUser }, error: null };
      },
    },
  } as unknown as SupabaseClient;
}

test("simultaneous first-login synchronization returns the identity committed by the winner", async () => {
  class ConcurrentIdentityStorage extends MemoryStorage {
    private raced = false;

    override async createUser(input: InsertUser): Promise<User> {
      if (!this.raced) {
        this.raced = true;
        await super.createUser(input);
        throw { code: "23505", message: "duplicate key value violates unique constraint" };
      }
      return super.createUser(input);
    }
  }

  const storage = new ConcurrentIdentityStorage();
  const auth = createAuthService(storage, { client: verifiedClient() });
  const synchronized = await auth.synchronizeActor(requestWithToken());
  assert.equal(synchronized.authId, oauthUser.id);
  assert.equal(synchronized.username, "first");
  assert.equal((await storage.listUsers()).length, 1);
});

test("a concurrent username collision retries with a stable provider-id suffix", async () => {
  class ConcurrentUsernameStorage extends MemoryStorage {
    private collided = false;

    override async createUser(input: InsertUser): Promise<User> {
      if (!this.collided) {
        this.collided = true;
        throw { code: "23505", message: "duplicate username" };
      }
      return super.createUser(input);
    }
  }

  const storage = new ConcurrentUsernameStorage();
  const auth = createAuthService(storage, { client: verifiedClient() });
  const synchronized = await auth.synchronizeActor(requestWithToken());
  assert.equal(synchronized.username, "first_1234567");
  assert.equal(synchronized.authId, oauthUser.id);
});
