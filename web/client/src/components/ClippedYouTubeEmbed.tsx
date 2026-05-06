import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, config: YTPlayerConfig) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; UNSTARTED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  getCurrentTime: () => number;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  destroy: () => void;
}

interface YTPlayerConfig {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
  };
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return apiPromise;
}

// Embeds a YouTube video constrained to [start, end]. The iframe loads with
// start/end params, and a polling loop enforces the upper bound — YouTube's
// native behavior pauses at `end`, but the user can still scrub past it,
// so we re-pause and snap back into range whenever currentTime > end.
export function ClippedYouTubeEmbed({
  videoId,
  start,
  end,
  testId,
}: {
  videoId: string;
  start: number;
  end: number;
  testId?: string;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let localPlayer: YTPlayer | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;
      try {
        localPlayer = new window.YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            start,
            end,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            iv_load_policy: 3,
            fs: 1,
          },
          events: {
            onReady: (e) => {
              if (cancelled) {
                try { e.target.destroy(); } catch { /* noop */ }
                return;
              }
              playerRef.current = e.target;
              setReady(true);
              try { e.target.seekTo(start, true); } catch { /* noop */ }
              intervalRef.current = window.setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                try {
                  const t = p.getCurrentTime();
                  if (typeof t !== "number") return;
                  if (t > end) {
                    p.pauseVideo();
                    p.seekTo(end - 0.1, true);
                  } else if (t < start - 0.5) {
                    p.seekTo(start, true);
                  }
                } catch {
                  // player can be destroyed mid-poll
                }
              }, 200);
            },
          },
        });
      } catch {
        // YT API can throw if the container is detached; cleanup will run.
      }
    });

    return () => {
      cancelled = true;
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try { playerRef.current?.destroy(); } catch { /* noop */ }
      try { localPlayer?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    };
  }, [videoId, start, end]);

  return (
    <div className="relative w-full aspect-video bg-black" data-testid={testId ?? `yt-embed-${reactId}`}>
      <div
        ref={containerRef}
        id={`yt-${reactId}`}
        className="absolute inset-0 w-full h-full"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
          Loading clip…
        </div>
      )}
    </div>
  );
}
