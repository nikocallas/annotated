import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";

export interface RateLimitRule {
  name: string;
  matches(req: Request): boolean;
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_RULES: RateLimitRule[] = [
  { name: "support", matches: (req) => req.path === "/api/support", limit: 5, windowMs: 60 * 60_000 },
  { name: "claims", matches: (req) => req.path === "/api/claims" || /\/api\/annotations\/[^/]+\/claims$/.test(req.path), limit: 10, windowMs: 60 * 60_000 },
  { name: "auth", matches: (req) => req.path.startsWith("/api/auth/"), limit: 30, windowMs: 10 * 60_000 },
  { name: "uploads", matches: (req) => req.path.startsWith("/api/uploads/"), limit: 30, windowMs: 60 * 60_000 },
  { name: "comments", matches: (req) => req.method === "POST" && /\/api\/annotations\/[^/]+\/comments$/.test(req.path), limit: 60, windowMs: 60 * 60_000 },
  { name: "follows", matches: (req) => /\/api\/users\/[^/]+\/(follow|is-following)$/.test(req.path), limit: 120, windowMs: 60 * 60_000 },
  { name: "votes", matches: (req) => /\/api\/annotations\/[^/]+\/(vote|votes)$/.test(req.path), limit: 240, windowMs: 60 * 60_000 },
  { name: "views", matches: (req) => req.method === "POST" && /\/api\/annotations\/[^/]+\/view$/.test(req.path), limit: 120, windowMs: 60_000 },
  { name: "suggestions", matches: (req) => req.method === "GET" && req.path === "/api/users", limit: 120, windowMs: 60_000 },
  { name: "writes", matches: (req) => req.path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method), limit: 180, windowMs: 60_000 },
  { name: "reads", matches: (req) => req.path.startsWith("/api/") && !["/api/health", "/api/ready"].includes(req.path), limit: 600, windowMs: 60_000 },
];

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}

const SUPABASE_RATE_LIMIT_REQUEST_TIMEOUT_MS = 2_000;
export const RATE_LIMIT_ENFORCEMENT_TIMEOUT_MS = 2_500;

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; resetAt: number; touchedAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  get entryCount() {
    return this.counters.size;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = this.now();
    const current = this.counters.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs, touchedAt: now }
      : current;
    bucket.count += 1;
    bucket.touchedAt = now;
    this.counters.delete(key);
    this.counters.set(key, bucket);
    this.prune(now);
    return { allowed: bucket.count <= limit, count: bucket.count, resetAt: bucket.resetAt };
  }

  private prune(now: number) {
    this.counters.forEach((value, key) => {
      if (value.resetAt <= now) this.counters.delete(key);
    });
    while (this.counters.size > this.maxEntries) {
      const oldest = this.counters.keys().next().value as string | undefined;
      if (!oldest) break;
      this.counters.delete(oldest);
    }
  }
}

export class SupabaseRateLimitStore implements RateLimitStore {
  private readonly client;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const { data, error } = await this.client
      .rpc("consume_rate_limit", {
        p_bucket_key: key,
        p_max_requests: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      })
      .abortSignal(AbortSignal.timeout(SUPABASE_RATE_LIMIT_REQUEST_TIMEOUT_MS));
    if (error || !Array.isArray(data) || !data[0]) {
      throw new Error("Distributed rate limiter is unavailable");
    }
    const row = data[0] as { allowed: boolean; current_count: number; reset_at_epoch: number };
    return {
      allowed: !!row.allowed,
      count: Number(row.current_count),
      resetAt: Number(row.reset_at_epoch) * 1000,
    };
  }
}

export function defaultRateLimitStore(): RateLimitStore {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NODE_ENV === "production") {
    if (!url || !serviceRoleKey) {
      return {
        async consume() {
          throw new Error("Production rate limiting requires Supabase service credentials");
        },
      };
    }
    return new SupabaseRateLimitStore(url, serviceRoleKey);
  }
  return new MemoryRateLimitStore();
}

function clientAddress(req: Request): string {
  // Express resolves req.ip from the configured trusted-proxy boundary. Do
  // not parse the leftmost X-Forwarded-For value directly: a client-supplied
  // prefix can survive in a forwarding chain and must not rotate rate-limit
  // buckets.
  return req.ip || req.socket.remoteAddress || "unknown";
}

function subjectKey(req: Request): string {
  const salt = process.env.RATE_LIMIT_SALT || "annotated-rate-limit-v1";
  return createHash("sha256").update(`${salt}:${clientAddress(req)}`).digest("base64url");
}

export function createRateLimitMiddleware(
  store: RateLimitStore,
  rules: RateLimitRule[] = RATE_LIMIT_RULES,
  timeoutMs = RATE_LIMIT_ENFORCEMENT_TIMEOUT_MS,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rule = rules.find((candidate) => candidate.matches(req));
    if (!rule) return next();
    let timeout: NodeJS.Timeout | undefined;
    try {
      // Fail closed before a stalled provider can consume the entire Vercel
      // invocation deadline. Supabase requests have their own abort signal;
      // this outer bound also protects alternate/test stores.
      const decision = await Promise.race([
        store.consume(`${rule.name}:${subjectKey(req)}`, rule.limit, rule.windowMs),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Rate-limit enforcement timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      const remaining = Math.max(0, rule.limit - decision.count);
      res.setHeader("RateLimit-Limit", String(rule.limit));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));
      if (!decision.allowed) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000))));
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }
      return next();
    } catch (error) {
      console.error(JSON.stringify({
        event: "rate_limit_enforcement_unavailable",
        rule: rule.name,
        errorName: error instanceof Error ? error.name : "Error",
      }));
      return res.status(503).json({ error: "Abuse protection temporarily unavailable" });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
