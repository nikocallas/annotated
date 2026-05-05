import { useState } from "react";
import type { Annotation } from "@shared/schema";
import { formatRange } from "./SourceBadge";
import { Play, Mic, ExternalLink } from "lucide-react";
import { BoundedYouTubePlayer } from "./BoundedClipPlayer";

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

// Click-to-play YouTube facade. Renders a thumbnail with a play button until the
// user clicks; then it swaps in the BoundedYouTubePlayer so playback can never
// run past the selected clip end. Stops event propagation so the surrounding
// FeedCard <Link> doesn't navigate when the user just wants to play the clip.
function YouTubeClipFacade({
  annotation,
  videoId,
  start,
  end,
  compact,
}: {
  annotation: Annotation;
  videoId: string;
  start: number;
  end: number;
  compact: boolean;
}) {
  const [active, setActive] = useState(false);
  const a = annotation;
  const range = formatRange(start, end);
  const dur = end - start;

  if (active) {
    return (
      <div
        className="rounded-md overflow-hidden border border-card-border bg-black"
        data-testid={`clip-video-${a.id}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <BoundedYouTubePlayer
          videoId={videoId}
          startSec={start}
          endSec={end}
          title={a.sourceTitle ?? undefined}
        />
        <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between">
          <span data-testid={`clip-range-${a.id}`}>
            Clip {range} • {dur}s • 240p
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setActive(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          setActive(true);
        }
      }}
      aria-label={`Play clip ${range}`}
      className="group relative block w-full rounded-md overflow-hidden border border-card-border aspect-video bg-foreground/5 text-left cursor-pointer"
      data-testid={`clip-video-thumb-${a.id}`}
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt={a.sourceTitle ?? "Video clip"}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full bg-white/95 text-black h-12 w-12 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
          <Play className={compact ? "w-5 h-5 ml-0.5" : "w-6 h-6 ml-0.5"} fill="currentColor" />
        </div>
      </div>
      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-mono px-2 py-0.5 rounded">
        {range} • {dur}s
      </div>
    </div>
  );
}

// Non-embeddable video shell: keeps the source attribution + clip range visible
// but never embeds the full source video. The user is sent to the original via
// a deep-link anchored at the clip start time.
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
          {range ? `Clip ${range}${dur != null ? ` • ${dur}s` : ""}` : "Clip"}
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
  fullPlayer = false,
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

    // Non-embeddable video URL — never expose the full source.
    if (!vid || !clipped) {
      return (
        <NonEmbeddableVideoShell
          annotation={a}
          range={range}
          start={clipped?.start ?? null}
          end={clipped?.end ?? null}
        />
      );
    }

    if (fullPlayer) {
      const { start, end } = clipped;
      return (
        <div className="rounded-md overflow-hidden border border-card-border bg-black" data-testid={`clip-video-${a.id}`}>
          <BoundedYouTubePlayer
            videoId={vid}
            startSec={start}
            endSec={end}
            title={a.sourceTitle ?? undefined}
          />
          <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between">
            <span data-testid={`clip-range-${a.id}`}>
              Clip {formatRange(start, end)} • {end - start}s • 240p
            </span>
            <a
              href={sourceLinkAt(a.sourceUrl, start)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono"
              data-testid={`clip-source-link-${a.id}`}
            >
              View source ↗
            </a>
          </div>
        </div>
      );
    }

    return (
      <YouTubeClipFacade
        annotation={a}
        videoId={vid}
        start={clipped.start}
        end={clipped.end}
        compact={compact}
      />
    );
  }

  // Podcast — clipped audio shell only, never embed full source
  const podClipped =
    a.clipStartSec != null && a.clipEndSec != null
      ? clampClipRange(a.clipStartSec, a.clipEndSec)
      : null;
  const range = podClipped ? formatRange(podClipped.start, podClipped.end) : null;
  const dur = podClipped ? podClipped.end - podClipped.start : 0;
  return (
    <div
      className="rounded-md border border-card-border bg-card-foreground/5 px-4 py-3 flex items-center gap-3"
      data-testid={`clip-audio-${a.id}`}
    >
      <div className="rounded-full bg-primary text-primary-foreground h-10 w-10 flex items-center justify-center shrink-0">
        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
      </div>
      <div className="flex-1 min-w-0">
        {/* Faux waveform */}
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
          {range ? `${range} (${dur}s)` : "Audio clip"}
        </div>
      </div>
    </div>
  );
}
