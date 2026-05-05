import { useEffect, useRef, useState } from "react";

// Bounded YouTube clip player.
//
// Loads the YouTube IFrame Player API and constrains playback to
// [startSec, endSec). The iframe is created with start= and end= URL
// parameters (which YouTube already honors), and we *also* poll the
// player's currentTime so a user can't simply click "play" to scrub past
// the end — at endSec we pause and seek back to start. This is the
// product enforcement requested by the spec: a clipped post must never
// play through the full source video.

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  pauseVideo: () => void;
  seekTo: (sec: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

let ytApiReady: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (ytApiReady) return ytApiReady;
  if (window.YT?.Player) {
    ytApiReady = Promise.resolve();
    return ytApiReady;
  }
  ytApiReady = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch {}
      resolve();
    };
    if (!document.querySelector("script[data-yt-iframe-api]")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.dataset.ytIframeApi = "1";
      document.head.appendChild(s);
    }
  });
  return ytApiReady;
}

export function BoundedYouTubePlayer({
  videoId,
  startSec,
  endSec,
  title,
}: {
  videoId: string;
  startSec: number;
  endSec: number;
  title?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const tickRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) return;
      const target = document.createElement("div");
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(target);
      const player = new window.YT.Player(target, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          start: Math.max(0, Math.floor(startSec)),
          end: Math.max(Math.floor(startSec) + 1, Math.floor(endSec)),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => setReady(true),
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [videoId, startSec, endSec]);

  useEffect(() => {
    if (!ready) return;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      let t: number;
      try { t = p.getCurrentTime(); } catch { return; }
      // Hard end clamp: pause and snap back to start. This catches any case
      // where the YouTube `end` param drifts or is bypassed.
      if (Number.isFinite(t) && t >= endSec) {
        try {
          p.pauseVideo();
          p.seekTo(Math.floor(startSec), true);
        } catch {}
      }
      // Pre-roll clamp: if a user scrubs before the start, pull them back.
      if (Number.isFinite(t) && t < Math.max(0, Math.floor(startSec) - 0.5)) {
        try { p.seekTo(Math.floor(startSec), true); } catch {}
      }
    }, 250);
    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [ready, startSec, endSec]);

  return (
    <div className="aspect-video w-full bg-black" data-testid="bounded-yt-player">
      <div ref={hostRef} className="w-full h-full" aria-label={title ?? "Video clip"} />
    </div>
  );
}
