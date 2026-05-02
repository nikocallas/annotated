/**
 * Vercel serverless entrypoint.
 *
 * Vercel routes /api/* requests here (see vercel.json). We mount the same
 * Express app used in dev so route handlers don't change between environments.
 *
 * IMPORTANT: do not import server/vite (dev-only) — this file is the
 * production handler.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { registerRoutes } from "../server/routes";
import { createServer } from "node:http";

const app = express();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// Permissive CORS so the Chrome extension (origin: chrome-extension://...) can
// hit the API hosted on Vercel. In production you'd narrow this to the
// extension ID + the deployed origin.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Lightweight error handler — final word before Vercel's default.
function attachErrorHandler() {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    console.error("[api] error", err);
    const status = (err as { status?: number; statusCode?: number })?.status
      ?? (err as { statusCode?: number })?.statusCode
      ?? 500;
    const message = (err as Error)?.message || "Internal Server Error";
    res.status(status).json({ message });
  });
}

const httpServer = createServer(app);
const ready = registerRoutes(httpServer, app).then(() => attachErrorHandler());

export default async function handler(req: Request, res: Response) {
  await ready;
  return app(req, res);
}
