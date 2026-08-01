import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import {
  createRateLimitMiddleware,
  MemoryRateLimitStore,
  type RateLimitRule,
  type RateLimitStore,
} from "./rate-limit";

async function start(
  rules: RateLimitRule[],
  store: RateLimitStore = new MemoryRateLimitStore(),
  timeoutMs?: number,
) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createRateLimitMiddleware(store, rules, timeoutMs));
  app.all("*path", (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("endpoint rate-limit buckets are isolated and return 429", async () => {
  const rules: RateLimitRule[] = [
    { name: "claims", matches: (req) => req.path === "/claims", limit: 2, windowMs: 60_000 },
    { name: "support", matches: (req) => req.path === "/support", limit: 1, windowMs: 60_000 },
  ];
  const server = await start(rules);
  try {
    assert.equal((await fetch(`${server.url}/claims`)).status, 200);
    assert.equal((await fetch(`${server.url}/claims`)).status, 200);
    const blocked = await fetch(`${server.url}/claims`);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("ratelimit-limit"), "2");
    assert.equal((await fetch(`${server.url}/support`)).status, 200);
  } finally {
    await server.close();
  }
});

test("a spoofed forwarded prefix cannot rotate the client rate-limit bucket", async () => {
  const rules: RateLimitRule[] = [
    { name: "probe", matches: (req) => req.path === "/probe", limit: 1, windowMs: 60_000 },
  ];
  const server = await start(rules);
  try {
    const first = await fetch(`${server.url}/probe`, {
      headers: { "X-Forwarded-For": "198.51.100.10, 203.0.113.9" },
    });
    assert.equal(first.status, 200);

    const prefixedDifferently = await fetch(`${server.url}/probe`, {
      headers: { "X-Forwarded-For": "198.51.100.11, 203.0.113.9" },
    });
    assert.equal(prefixedDifferently.status, 429);
  } finally {
    await server.close();
  }
});

test("memory rate-limit storage expires entries and stays bounded", async () => {
  let now = 1_000;
  const store = new MemoryRateLimitStore(() => now, 2);
  await store.consume("one", 5, 100);
  await store.consume("two", 5, 100);
  await store.consume("three", 5, 100);
  assert.equal(store.entryCount, 2);
  now += 101;
  await store.consume("four", 5, 100);
  assert.equal(store.entryCount, 1);
});

test("a stalled distributed limiter fails closed before the request deadline", async () => {
  const stalledStore: RateLimitStore = {
    consume: () => new Promise(() => {}),
  };
  const rules: RateLimitRule[] = [
    { name: "reads", matches: (req) => req.path === "/feed", limit: 10, windowMs: 60_000 },
  ];
  const server = await start(rules, stalledStore, 25);
  try {
    const startedAt = Date.now();
    const response = await fetch(`${server.url}/feed`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Abuse protection temporarily unavailable" });
    assert.ok(Date.now() - startedAt < 500, "limiter timeout should return well before the route deadline");
  } finally {
    await server.close();
  }
});
