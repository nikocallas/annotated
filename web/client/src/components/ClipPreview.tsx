import type { Annotation } from "@shared/schema";
import { formatRange } from "./SourceBadge";
import { Play, Mic, ExternalLink, Loader2 } from "lucide-react";

const MAX_CLIP_SECONDS = 90;

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
  } catch {}
  return null;
}

function clampClipRange(startSec: number, endSec: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(startSec));
  let end = Math.max(start + 1, Math.floor(endSec));
  if (end - start > MAX_CLIP_SECONDS) end = start + MAX_CLIP_SECONDS;
  return { start, end };
}

function sourceLinkAt(url: string, start: number) {
  return `${url}${url.includes("?") ? "&" : "?"}t=${start}s`;
}

// Native <video> element bound to a clipped MP4 asset. When the
// clip-processing pipeline delivers a real clip file, we render that and
// nothing else — never the full source. Constrained to 240p tall per spec.
function ClippedVideoAsset({
  annotation,
  src,
  poster,
  start,
  end,
  range,
}: {
  annotation: Annotation;
  src: string;
  poster: string | null;
  start: number;
  end: number;
  range: string;
}) {
  const a = annotation;
  return (
    <div
      className="rounded-md overflow-hidden border border-card-border bg-black"
      data-testid={`clip-video-${a.id}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="w-full bg-black"
        style={{ maxHeight: 360 }}
        data-testid={`clip-video-asset-${a.id}`}
      />
      <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between">
        <span data-testid={`clip-range-${a.id}`}>
          Clip {range} • {end - start}s • 240p
        </span>
        <a
          href={sourceLinkAt(a.sourceUrl, start)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-mono"
          data-testid={`clip-source-link-${a.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          View source ↗
        </a>
      </div>
    </div>
  );
}

// Clip facade — shown when the source is a video and we DO NOT have a clipped
// asset yet. This deliberately does not embed the YouTube iframe player or any
// full-source media. The user sees a thumbnail, the selected range, the clip
// duration, a "Clip processing" / "Clip preview unavailable" status, and a
// link to the original source. Clicking the card never plays the full video
// in-place; the source link opens the original on a new tab, deep-linked to
// the clip start.
function VideoClipFacade({
  annotation,
  videoId,
  start,
  end,
  range,
  thumbnailUrl,
  status,
  compact,
}: {
  annotation: Annotation;
  videoId: string | null;
  start: number;
  end: number;
  range: string;
  thumbnailUrl: string | null;
  status: "processing" | "ready" | "failed";
  compact: boolean;
}) {
  const a = annotation;
  const dur = end - start;
  const poster =
    thumbnailUrl ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
  const sourceHref = sourceLinkAt(a.sourceUrl, start);

  const statusText =
    status === "processing"
      ? "Clip processing"
      : status === "failed"
      ? "Clip preview unavailable"
      : "Clip preview";

  return (
    <div
      className="block w-full rounded-md overflow-hidden border border-card-border bg-foreground/5"
      data-testid={`clip-video-facade-${a.id}`}
      onClick={(e) => {
        // The facade is not a player. Don't intercept the surrounding card
        // <Link> click — let the user navigate to the detail page.
        e.stopPropagation();
      }}
    >
      <a
        href={sourceHref}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block w-full aspect-video bg-foreground/10"
        data-testid={`clip-video-thumb-${a.id}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Watch the full video on the source site (clip ${range})`}
      >
        {poster ? (
          <img
            src={poster}
            alt={a.sourceTitle ?? "Video clip thumbnail"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            No preview available
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-white/95 text-black h-12 w-12 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            {status === "processing" ? (
              <Loader2 className={compact ? "w-5 h-5 animate-spin" : "w-6 h-6 animate-spin"} />
            ) : (
              <Play
                className={compact ? "w-5 h-5 ml-0.5" : "w-6 h-6 ml-0.5"}
                fill="currentColor"
              />
            )}
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-mono px-2 py-0.5 rounded">
          {range} • {dur}s
        </div>
      </a>
      <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between gap-3">
        <span data-testid={`clip-range-${a.id}`}>
          {statusText} • {range} • {dur}s
        </span>
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
          data-testid={`clip-source-link-${a.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          Watch the full video <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

// Non-embeddable video shell — used when we don't even have start/end times
// or a YouTube id (e.g. raw URL). Keeps source attribution + a link out;
// never embeds the full source.
function NonEmbeddableVideoShell({
  annotation,
  range,
  start,
  end,
}: {
  annotation: Annotation;
  range: string | null;
  start: number | null;
  end: number | null;
}) {
  const a = annotation;
  const dur = start != null && end != null ? end - start : null;
  return (
    <div
      className="rounded-md border border-card-border bg-card-foreground/5 p-4 flex items-center gap-3"
      data-testid={`clip-video-shell-${a.id}`}
    >
      <div className="rounded-full bg-primary text-primary-foreground h-10 w-10 flex items-center justify-center shrink-0">
        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {a.sourceTitle ?? "Video clip"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {range ? `Clip ${range}${dur != null ? ` • ${dur}s` : ""}` : "Clip preview unavailable"}
        </div>
      </div>
      <a
        href={start != null ? sourceLinkAt(a.sourceUrl, start) : a.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
        data-testid={`clip-video-source-link-${a.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        Open source <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

export function ClipPreview({
  annotation,
  compact = false,
  // fullPlayer is preserved for prop-compat with the detail page but is no
  // longer used to mount a YouTube iframe. Both feed cards and the detail
  // page render the same non-embedding facade or the clipped MP4 asset.
  fullPlayer: _fullPlayer = false,
}: {
  annotation: Annotation;
  compact?: boolean;
  fullPlayer?: boolean;
}) {
  const a = annotation;

  if (a.sourceType === "article" && a.clipText) {
    return (
      <blockquote
        className="border-l-2 border-primary pl-4 py-1 italic text-foreground/90 leading-relaxed"
        style={{ fontFamily: "var(--font-sans)", fontSize: compact ? "1.05rem" : "1.18rem" }}
        data-testid={`clip-text-${a.id}`}
      >
        "{a.clipText}"
      </blockquote>
    );
  }

  if (a.sourceType === "youtube") {
    const vid = youtubeId(a.sourceUrl);
    const clipped =
      a.clipStartSec != null && a.clipEndSec != null
        ? clampClipRange(a.clipStartSec, a.clipEndSec)
        : null;
    const range = clipped ? formatRange(clipped.start, clipped.end) : null;

    if (!clipped || range == null) {
      return (
        <NonEmbeddableVideoShell
          annotation={a}
          range={null}
          start={null}
          end={null}
        />
      );
    }

    // Preferred path: a real clipped MP4 asset is available. Render it as a
    // native <video> bound to that asset only; the full source is never
    // exposed.
    if (a.clipMediaUrl) {
      return (
        <ClippedVideoAsset
          annotation={a}
          src={a.clipMediaUrl}
          poster={a.clipThumbnailUrl ?? (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null)}
          start={clipped.start}
          end={clipped.end}
          range={range}
        />
      );
    }

    // No clipped asset yet — show the facade. We never mount the YouTube
    // iframe player here, even on the detail page. The facade links out to
    // the original source for users who want the full video.
    const status: "processing" | "ready" | "failed" =
      a.clipStatus === "failed"
        ? "failed"
        : a.clipStatus === "processing"
        ? "processing"
        : "ready";
    return (
      <VideoClipFacade
        annotation={a}
        videoId={vid}
        start={clipped.start}
        end={clipped.end}
        range={range}
        thumbnailUrl={a.clipThumbnailUrl ?? null}
        status={status}
        compact={compact}
      />
    );
  }

  // Podcast — clipped audio shell. If a clipped audio asset exists, expose it
  // as an <audio> element. Otherwise show a non-playable shell with a link to
  // the original episode.
  const podClipped =
    a.clipStartSec != null && a.clipEndSec != null
      ? clampClipRange(a.clipStartSec, a.clipEndSec)
      : null;
  const range = podClipped ? formatRange(podClipped.start, podClipped.end) : null;
  const dur = podClipped ? podClipped.end - podClipped.start : 0;

  if (a.clipMediaUrl && podClipped) {
    return (
      <div
        className="rounded-md border border-card-border bg-card-foreground/5 px-4 py-3 flex items-center gap-3"
        data-testid={`clip-audio-${a.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-full bg-primary text-primary-foreground h-10 w-10 flex items-center justify-center shrink-0">
          <Mic className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <audio src={a.clipMediaUrl} controls preload="metadata" className="w-full" />
          <div className="text-xs text-muted-foreground mt-1">
            {range ? `${range} (${dur}s) • clipped audio` : "Clipped audio"}
          </div>
        </div>
      </div>
    );
  }

  const status: "processing" | "ready" | "failed" =
    a.clipStatus === "failed"
      ? "failed"
      : a.clipStatus === "processing"
      ? "processing"
      : "ready";
  return (
    <div
      className="rounded-md border border-card-border bg-card-foreground/5 px-4 py-3 flex items-center gap-3"
      data-testid={`clip-audio-${a.id}`}
    >
      <div className="rounded-full bg-primary text-primary-foreground h-10 w-10 flex items-center justify-center shrink-0">
        {status === "processing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-0.5 h-6">
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 bg-primary/60 rounded-sm"
              style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 80}%` }}
            />
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
          <Mic className="w-3 h-3" />
          <span>
            {status === "processing"
              ? "Clip processing"
              : status === "failed"
              ? "Clip preview unavailable"
              : range
              ? `${range} (${dur}s)`
              : "Audio clip"}
          </span>
          {a.sourceUrl && (
            <a
              href={a.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Listen to full episode ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
