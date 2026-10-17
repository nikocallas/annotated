import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import { configureHttpSecurity } from "./http-security";
import { MemoryRateLimitStore } from "./rate-limit";

async function start() {
  const entries: Array<Record<string, string | number>> = [];
  const app = express();
  configureHttpSecurity(app, {
    rateLimitStore: new MemoryRateLimitStore(),
    requestLogger: (entry) => entries.push(entry),
  });
  app.get("/api/echo", (_req, res) => res.json({ ok: true }));
  app.post("/api/echo", (req, res) => res.json({ bytes: JSON.stringify(req.body).length }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (error as { status?: number }).status ?? 500;
    return res.status(status).json({ error: status === 413 ? "Payload too large" : "Request failed" });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    entries,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("API security rejects untrusted origins and allows exact site/extension origins", async () => {
  const server = await start();
  try {
    const denied = await fetch(`${server.url}/api/echo`, {
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(denied.headers.get("x-powered-by"), null);
    assert.equal(denied.headers.get("x-content-type-options"), "nosniff");
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.match(denied.headers.get("content-security-policy") ?? "", /default-src 'none'/);

    const preflight = await fetch(`${server.url}/api/echo`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.annotatedextension.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://www.annotatedextension.com");

    const extension = await fetch(`${server.url}/api/echo`, {
      headers: { Origin: "chrome-extension://eaealcbiidjigfndjchchbnjdjicbajb" },
    });
    assert.equal(extension.status, 200);
    assert.equal(extension.headers.get("access-control-allow-origin"), "chrome-extension://eaealcbiidjigfndjchchbnjdjicbajb");
  } finally {
    await server.close();
  }
});

test("request logs omit query values and oversized JSON is rejected", async () => {
  const server = await start();
  try {
    const response = await fetch(`${server.url}/api/echo?access_token=never-log-this`, {
      headers: { "X-Request-ID": "test-request" },
    });
    assert.equal(response.status, 200);
    const log = server.entries.find((entry) => entry.requestId === "test-request");
    assert(log);
    assert.equal(log.path, "/api/echo");
    assert.equal(JSON.stringify(log).includes("access_token"), false);
    assert.equal(JSON.stringify(log).includes("never-log-this"), false);

    const oversized = await fetch(`${server.url}/api/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(2 * 1024 * 1024) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, "Payload too large");
  } finally {
    await server.close();
  }
});

test("production CSP permits the YouTube iframe API used by clipped video embeds", () => {
  const vercelConfig = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  ) as {
    headers?: Array<{
      headers?: Array<{ key?: string; value?: string }>;
    }>;
  };
  const csp = vercelConfig.headers
    ?.flatMap((rule) => rule.headers ?? [])
    .find((header) => header.key === "Content-Security-Policy")
    ?.value;

  assert(csp, "Content-Security-Policy header must be configured");
  assert.match(csp, /script-src 'self' https:\/\/www\.youtube\.com(?:;|\s)/);
  assert.match(csp, /script-src[^;]*https:\/\/open\.spotify\.com(?:;|\s)/);
  // Spotify serves its iframe API loader from this CDN; without it every
  // podcast embed hangs on "Loading clip…".
  assert.match(csp, /script-src[^;]*https:\/\/embed-cdn\.spotifycdn\.com(?:;|\s)/);
  assert.match(csp, /frame-src [^;]*https:\/\/www\.youtube\.com/);
});
