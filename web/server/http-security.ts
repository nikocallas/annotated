import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import { createRateLimitMiddleware, defaultRateLimitStore, type RateLimitStore } from "./rate-limit";

const CHROME_EXTENSION_ORIGIN = "chrome-extension://eaealcbiidjigfndjchchbnjdjicbajb";

function allowedOrigins(): Set<string> {
  const values = new Set([
    "https://annotatedextension.com",
    "https://www.annotatedextension.com",
    CHROME_EXTENSION_ORIGIN,
  ]);
  for (const value of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = value.trim();
    if (origin) values.add(origin);
  }
  for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (hostname) values.add(`https://${hostname}`);
  }
  if (process.env.NODE_ENV !== "production") {
    values.add("http://localhost:5000");
    values.add("http://localhost:5173");
    values.add("http://127.0.0.1:5000");
    values.add("http://127.0.0.1:5173");
  }
  return values;
}

export interface HttpSecurityOptions {
  rateLimitStore?: RateLimitStore;
  requestLogger?: (entry: Record<string, string | number>) => void;
}

export function configureHttpSecurity(app: Express, options: HttpSecurityOptions = {}) {
  const origins = allowedOrigins();
  const rateLimitStore = options.rateLimitStore ?? defaultRateLimitStore();
  const requestLogger = options.requestLogger ?? ((entry) => console.info(JSON.stringify(entry)));
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.slice(0, 100) || randomUUID();
    const startedAt = Date.now();
    const requestPath = req.path;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (requestPath.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      res.once("finish", () => {
        requestLogger({
          event: "http_request",
          requestId,
          method: req.method,
          path: requestPath,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        });
      });
    }

    const origin = req.header("origin");
    if (origin) {
      if (!origins.has(origin)) {
        return res.status(403).json({ error: "Origin not allowed" });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  app.use(createRateLimitMiddleware(rateLimitStore));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
}
