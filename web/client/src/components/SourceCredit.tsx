import { ExternalLink, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { hostname } from "./SourceBadge";
import type { Annotation } from "@shared/schema";

interface SourceCreditProps {
  annotation: Pick<
    Annotation,
    | "sourceUrl"
    | "sourceType"
    | "sourceTitle"
    | "sourceAuthor"
    | "sourcePublication"
    | "clipStartSec"
    | "clipEndSec"
  >;
}

function authorLabelFor(sourceType: string) {
  if (sourceType === "youtube") return "Channel";
  if (sourceType === "podcast") return "Host";
  return "Author";
}

function publicationLabelFor(sourceType: string) {
  if (sourceType === "youtube") return "Platform";
  if (sourceType === "podcast") return "Show";
  return "Publication";
}

function formatRange(start: number, end: number) {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export function SourceCredit({ annotation }: SourceCreditProps) {
  const a = annotation;
  const host = hostname(a.sourceUrl);
  const range =
    a.clipStartSec != null && a.clipEndSec != null && a.sourceType !== "article"
      ? formatRange(a.clipStartSec, a.clipEndSec)
      : null;
  const linkLabel =
    a.sourceType === "podcast"
      ? "Listen to the full episode"
      : a.sourceType === "youtube"
        ? "Watch the full video"
        : "Read the original";

  return (
    <Card
      className="border-card-border bg-card p-4 space-y-3"
      data-testid="card-source-credit"
    >
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-primary/10 text-primary p-1.5">
          <Quote className="w-3.5 h-3.5" />
        </div>
        <div className="text-[13px] text-muted-foreground font-semibold">
          Source credits
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        This annotation references material owned by its original creator.
        Annotated does not host the underlying source — credit and traffic
        belong to the work below.
      </p>
      <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {a.sourceTitle && (
          <>
            <dt className="text-muted-foreground">Title</dt>
            <dd className="text-right font-medium" data-testid="text-credit-title">
              {a.sourceTitle}
            </dd>
          </>
        )}
        {a.sourceAuthor && (
          <>
            <dt className="text-muted-foreground">
              {authorLabelFor(a.sourceType)}
            </dt>
            <dd className="text-right truncate" data-testid="text-credit-author">
              {a.sourceAuthor}
            </dd>
          </>
        )}
        {a.sourcePublication && (
          <>
            <dt className="text-muted-foreground">
              {publicationLabelFor(a.sourceType)}
            </dt>
            <dd className="text-right truncate" data-testid="text-credit-publication">
              {a.sourcePublication}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Domain</dt>
        <dd className="text-right" data-testid="text-credit-domain">
          {host}
        </dd>
        {range && (
          <>
            <dt className="text-muted-foreground">Clip range</dt>
            <dd className="text-right tabular-nums" data-testid="text-credit-range">
              {range}
            </dd>
          </>
        )}
      </dl>
      <a
        href={a.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
        data-testid="link-credit-source"
      >
        {linkLabel} on {host}
        <ExternalLink className="w-3 h-3" />
      </a>
    </Card>
  );
}
