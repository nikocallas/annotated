/**
 * Vercel serverless entrypoint.
 *
 * This source is bundled by script/build.ts into api/index.js before Vercel
 * packages functions. Bundling is intentional: Vercel's default TypeScript
 * transpilation preserves ESM extensionless imports, which breaks runtime
 * resolution for our internal server modules.
 */
import express, { type Request, type Response } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "node:http";
import { configureHttpSecurity } from "./http-security";

const app = express();
configureHttpSecurity(app);

const httpServer = createServer(app);
registerRoutes(httpServer, app);

export default async function handler(req: Request, res: Response) {
  return app(req, res);
}
