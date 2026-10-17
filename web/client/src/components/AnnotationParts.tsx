import { Fragment, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  BadgeCheck,
  Flame,
  Info,
  Lightbulb,
  Receipt,
  Scale,
  ExternalLink,
} from "lucide-react";
import {
  ANNOTATION_TYPE_DESCRIPTIONS,
  ANNOTATION_TYPE_LABELS,
  isAnnotationType,
  type Annotation,
  type AnnotationType,
} from "@shared/schema";
import { hostname } from "./SourceBadge";

const TYPE_ICONS: Record<AnnotationType, typeof Info> = {
  dispute: AlertTriangle,
  "fact-check": BadgeCheck,
  context: Info,
  "hot-take": Flame,
  steelman: Scale,
  receipts: Receipt,
  explainer: Lightbulb,
};

/** "Dispute", "Fact check", … — what kind of take this post is. */
export function AnnotationTypeBadge({
  type,
  href,
}: {
  type: string | null | undefined;
  href?: string;
}) {
  if (!isAnnotationType(type)) return null;
  const Icon = TYPE_ICONS[type];
  const content = (
    <span
      className="type-badge"
      data-type={type}
      title={ANNOTATION_TYPE_DESCRIPTIONS[type]}
      data-testid="badge-annotation-type"
    >
      <Icon className="w-3 h-3" aria-hidden />
      {ANNOTATION_TYPE_LABELS[type]}
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} className="inline-flex rounded-full" aria-label={`More ${ANNOTATION_TYPE_LABELS[type]} posts`}>
      {content}
    </Link>
  );
}

/**
 * Commentary text with #hashtags linked to their topic feed. Line breaks are
 * preserved by CSS; nothing here injects HTML.
 */
export function CommentaryText({
  text,
  detail = false,
  testId,
}: {
  text: string;
  detail?: boolean;
  testId?: string;
}) {
  const parts: ReactNode[] = [];
  const pattern = /(^|[^\w&#])#([A-Za-z0-9_À-ɏ]{2,40})/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const tag = match[2];
    if (/^\d+$/.test(tag)) continue;
    const start = match.index + match[1].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <Link
        key={`${start}-${tag}`}
        href={`/?tag=${encodeURIComponent(tag.toLowerCase())}`}
        className="hashtag-link"
        onClick={(e) => e.stopPropagation()}
      >
        #{tag}
      </Link>,
    );
    last = start + tag.length + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <p className={`commentary-lead${detail ? " is-detail" : ""}`} data-testid={testId}>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </p>
  );
}

function isXPost(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)((x|twitter)\.com)$/.test(u.hostname) && /\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * The source as context: what page this is about, with a screenshot or
 * preview image, and a link back to the original. Judges asked for a
 * thumbnail of the page here rather than a bare headline.
 */
export function SourceCard({
  annotation,
  detail = false,
}: {
  annotation: Pick<
    Annotation,
    | "id"
    | "sourceUrl"
    | "sourceType"
    | "sourceTitle"
    | "sourceAuthor"
    | "sourceImage"
    | "sourcePublication"
    | "clipThumbnailUrl"
  >;
  detail?: boolean;
}) {
  const a = annotation;
  const xPost = isXPost(a.sourceUrl);
  // A captured screenshot is preferred: it shows the page as the annotator
  // saw it, and preserves X posts that are later deleted.
  const thumb = a.clipThumbnailUrl || (a.sourceType === "article" ? a.sourceImage : null);
  const isScreenshot = !!a.clipThumbnailUrl;
  const publication = a.sourcePublication ?? hostname(a.sourceUrl);
  const cta =
    a.sourceType === "podcast"
      ? "Listen to the full episode"
      : a.sourceType === "youtube"
        ? "Watch the full video"
        : xPost
          ? "View the post on X"
          : "Read the original";

  return (
    <div
      className={`source-card${thumb ? " has-thumb" : ""}${detail ? " is-detail" : ""}`}
      data-testid={`source-card-${a.id}`}
    >
      {thumb && (
        <a
          href={a.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-hidden
          tabIndex={-1}
          className="block"
        >
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="source-thumb"
            onError={(e) => {
              (e.currentTarget.closest(".source-card") as HTMLElement | null)?.classList.remove("has-thumb");
              e.currentTarget.parentElement?.remove();
            }}
          />
        </a>
      )}
      <div className="min-w-0 p-3 flex flex-col gap-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
          {publication}
          {isScreenshot && (
            <span className="normal-case tracking-normal font-normal">
              {" "}· {xPost ? "Saved copy of the post" : "Screenshot when annotated"}
            </span>
          )}
        </div>
        {a.sourceTitle && (
          <div className="text-sm font-semibold leading-snug line-clamp-2">{a.sourceTitle}</div>
        )}
        {a.sourceAuthor && (
          <div className="text-xs text-muted-foreground truncate">By {a.sourceAuthor}</div>
        )}
        <a
          href={a.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-auto inline-flex items-center gap-1 text-xs text-primary-readable hover:underline min-h-11 sm:min-h-0 pt-1"
          data-testid={`link-source-${a.id}`}
        >
          {cta}
          <ExternalLink className="w-3 h-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
