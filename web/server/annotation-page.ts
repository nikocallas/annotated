import type { IncomingMessage, ServerResponse } from "node:http";
import { storage } from "./storage";
import type { AnnotationWithRelations } from "@shared/schema";

declare const __ANNOTATED_INDEX_HTML__: string;

export const CANONICAL_ORIGIN = "https://www.annotatedextension.com";
const DEFAULT_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function cleanText(value: string | null | undefined, fallback: string, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return text.slice(0, max);
}

function safeImage(value: string | null | undefined): string {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : DEFAULT_IMAGE;
  } catch {
    return DEFAULT_IMAGE;
  }
}

export interface AnnotationMetadata {
  title: string;
  description: string;
  image: string;
  canonical: string;
  sourceUrl: string;
}

export function metadataForAnnotation(annotation: AnnotationWithRelations): AnnotationMetadata {
  const sourceTitle = cleanText(annotation.sourceTitle, "Annotated clip", 110);
  const byline = cleanText(annotation.user.displayName, "an Annotated user", 60);
  const description = cleanText(
    annotation.commentaryText || annotation.clipText,
    `${byline} annotated a moment from ${annotation.sourcePublication || "the web"}.`,
    200,
  );
  return {
    title: `${sourceTitle} — annotated by ${byline}`.slice(0, 155),
    description,
    image: safeImage(annotation.sourceImage),
    canonical: `${CANONICAL_ORIGIN}/a/${encodeURIComponent(annotation.id)}`,
    sourceUrl: annotation.sourceUrl,
  };
}

export function renderAnnotationPage(template: string, metadata: AnnotationMetadata): string {
  const title = escapeAttribute(metadata.title);
  const description = escapeAttribute(metadata.description);
  const image = escapeAttribute(metadata.image);
  const canonical = escapeAttribute(metadata.canonical);
  const source = escapeAttribute(metadata.sourceUrl);

  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, '<meta property="og:type" content="article" />')
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${image}" />`)
    .replace(/<meta property="og:image:alt" content="[^"]*" \/>/, `<meta property="og:image:alt" content="${title}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${image}" />`)
    .replace(/<meta name="twitter:image:alt" content="[^"]*" \/>/, `<meta name="twitter:image:alt" content="${title}" />`)
    .replace("</head>", `<link rel="canonical" href="${canonical}" />\n    <meta property="article:author" content="${source}" />\n  </head>`);
}

function annotationId(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", CANONICAL_ORIGIN);
  return url.searchParams.get("id")?.trim() ?? "";
}

function send(res: ServerResponse, status: number, html: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", status === 200 ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.end(html);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    send(res, 405, "Method not allowed");
    return;
  }
  const id = annotationId(req);
  if (!id) {
    send(res, 400, "Annotation id is required");
    return;
  }
  try {
    const annotation = await storage.getAnnotationWithUser(id);
    if (!annotation || annotation.isPublic !== 1) {
      send(res, 404, "Annotation not found");
      return;
    }
    const html = renderAnnotationPage(__ANNOTATED_INDEX_HTML__, metadataForAnnotation(annotation));
    send(res, 200, req.method === "HEAD" ? "" : html);
  } catch (error) {
    console.error("[annotation-page] render failed", { id, error });
    // Keep the public journey available during a transient provider failure;
    // crawlers receive a generic, non-cacheable shell instead of a poisoned
    // serverless module or an unhandled error page.
    send(res, 503, req.method === "HEAD" ? "" : __ANNOTATED_INDEX_HTML__);
  }
}
