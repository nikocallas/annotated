import type { Annotation } from "@shared/schema";
import { formatRange } from "./SourceBadge";
import { Play, Mic, Loader2 } from "lucide-react";
import { ClippedYouTubeEmbed } from "./ClippedYouTubeEmbed";
import { ClippedSpotifyEmbed } from "./ClippedSpotifyEmbed";

const MAX_CLIP_SECONDS = 90;

function spotifyEpisodeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("spotify.com")) {
      const m =
        u.pathname.match(/\/episode\/([a-zA-Z0-9]+)/) ||
        u.pathname.match(/\/embed\/episode\/([a-zA-Z0-9]+)/);
      if (m) return m[1];
    }
  } catch {
    /* fall through */
  }
  const uriM = url.match(/spotify:episode:([a-zA-Z0-9]+)/);
  if (uriM) return uriM[1];
  return null;
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      // Standard watch URL: youtube.com/watch?v=ID
      const v = u.searchParams.get("v");
      if (v) return v;
      // Shorts: youtube.com/shorts/ID
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
      // Embed URL: youtube.com/embed/ID
      const embedMatch = u.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
  } catch {
    /* fall through */
  }
  return null;
}

function clampClipRange(startSec: number, endSec: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(startSec));
  let end = Math.max(start + 1, Math.floor(endSec));
  if (end - start > MAX_CLIP_SECONDS) end = start + MAX_CLIP_SECONDS;
  return { start, end };
}

// Non-embeddable video shell — used when we don't even have start/end times
// or a YouTube id (e.g. raw URL). Never embeds or links to the full source.
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
      <span
        className="text-xs text-muted-foreground shrink-0"
        data-testid={`clip-video-source-link-${a.id}`}
      >
        MP4 unavailable
      </span>
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

    if (!clipped || range == null || !vid) {
      return (
        <NonEmbeddableVideoShell
          annotation={a}
          range={range}
          start={clipped?.start ?? null}
          end={clipped?.end ?? null}
        />
      );
    }

    // Render the YouTube iframe player constrained to the clip range. The
    // start/end URL params handle initial bounds; ClippedYouTubeEmbed polls
    // currentTime and re-pauses if the user scrubs past the end.
    const dur = clipped.end - clipped.start;
    return (
      <div
        className="rounded-md overflow-hidden border border-card-border bg-black"
        data-testid={`clip-video-${a.id}`}
        onClick={(e) => {
          // The embed is interactive — don't navigate to the detail page when
          // the user clicks play/pause/scrub.
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <ClippedYouTubeEmbed
          videoId={vid}
          start={clipped.start}
          end={clipped.end}
          testId={`clip-video-embed-${a.id}`}
        />
        <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between">
          <span data-testid={`clip-range-${a.id}`}>
            Clip {range} • {dur}s
          </span>
          <span className="font-mono">YouTube clip</span>
        </div>
      </div>
    );
  }

  // Podcast — preferred path is a Spotify iframe embed constrained to the
  // selected timestamps (paused on load by Spotify's default behavior).
  // Falls back to the existing clipped-audio / waveform shell for non-Spotify
  // sources or when no episode id can be parsed.
  const podClipped =
    a.clipStartSec != null && a.clipEndSec != null
      ? clampClipRange(a.clipStartSec, a.clipEndSec)
      : null;
  const range = podClipped ? formatRange(podClipped.start, podClipped.end) : null;
  const dur = podClipped ? podClipped.end - podClipped.start : 0;

  const spotifyId = spotifyEpisodeId(a.sourceUrl);
  if (spotifyId && podClipped && range) {
    return (
      <div
        className="rounded-md overflow-hidden border border-card-border bg-card"
        data-testid={`clip-spotify-${a.id}`}
        onClick={(e) => {
          // The embed is interactive — don't navigate to the detail page when
          // the listener clicks play/pause/scrub.
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <ClippedSpotifyEmbed
          episodeId={spotifyId}
          start={podClipped.start}
          end={podClipped.end}
          testId={`clip-spotify-embed-${a.id}`}
        />
        <div className="px-3 py-2 text-xs text-muted-foreground bg-card flex items-center justify-between">
          <span data-testid={`clip-range-${a.id}`}>
            Clip {range} • {dur}s
          </span>
          <span className="font-mono">Spotify clip</span>
        </div>
      </div>
    );
  }

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
