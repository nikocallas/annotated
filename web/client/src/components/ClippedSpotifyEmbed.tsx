import { useEffect, useId, useRef, useState } from "react";

interface SpotifyController {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  resume: () => void;
  seek: (positionSec: number) => void;
  loadUri: (uri: string) => void;
  addListener: (
    event: "playback_update" | "ready",
    cb: (e: { data: { position: number; duration: number; isPaused: boolean } }) => void,
  ) => void;
  destroy: () => void;
}

interface SpotifyIFrameApi {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number; theme?: "dark" | "light" },
    callback: (controller: SpotifyController) => void,
  ) => void;
}

declare global {
  interface Window {
    SpotifyIframeApi?: SpotifyIFrameApi;
    onSpotifyIframeApiReady?: (api: SpotifyIFrameApi) => void;
  }
}

let apiPromise: Promise<SpotifyIFrameApi> | null = null;

function loadSpotifyApi(): Promise<SpotifyIFrameApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.SpotifyIframeApi) return Promise.resolve(window.SpotifyIframeApi);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<SpotifyIFrameApi>((resolve) => {
    const prev = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api: SpotifyIFrameApi) => {
      window.SpotifyIframeApi = api;
      prev?.(api);
      resolve(api);
    };
    if (!document.querySelector('script[src*="spotify.com/embed/iframe-api"]')) {
      const s = document.createElement("script");
      s.src = "https://open.spotify.com/embed/iframe-api/v1";
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return apiPromise;
}

// Embeds a Spotify podcast episode constrained to [start, end]. Spotify's
// iframe API exposes `seek` and a `playback_update` event with position in
// milliseconds; we listen on every update and snap back into range when the
// listener scrubs past `end`. Initial seek to `start` happens on ready.
export function ClippedSpotifyEmbed({
  episodeId,
  start,
  end,
  testId,
}: {
  episodeId: string;
  start: number;
  end: number;
  testId?: string;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyController | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let local: SpotifyController | null = null;

    loadSpotifyApi()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        api.createController(
          containerRef.current,
          { uri: `spotify:episode:${episodeId}`, width: "100%", height: 152, theme: "dark" },
          (controller) => {
            if (cancelled) {
              try { controller.destroy(); } catch { /* noop */ }
              return;
            }
            local = controller;
            controllerRef.current = controller;
            setReady(true);

            controller.addListener("ready", () => {
              try { controller.seek(start); } catch { /* noop */ }
            });
            controller.addListener("playback_update", (e) => {
              const posSec = e.data.position / 1000;
              if (Number.isFinite(posSec) && posSec > end + 0.2) {
                try {
                  controller.pause();
                  controller.seek(Math.max(start, end - 0.1));
                } catch { /* noop */ }
              } else if (Number.isFinite(posSec) && posSec < start - 0.5 && !e.data.isPaused) {
                try { controller.seek(start); } catch { /* noop */ }
              }
            });
          },
        );
      })
      .catch(() => {
        // Network or API failure — leave the loading state visible; the parent
        // ClipPreview falls back to the waveform shell only if no episodeId.
      });

    return () => {
      cancelled = true;
      try { controllerRef.current?.destroy(); } catch { /* noop */ }
      try { local?.destroy(); } catch { /* noop */ }
      controllerRef.current = null;
    };
  }, [episodeId, start, end]);

  return (
    <div className="relative w-full" data-testid={testId ?? `spotify-embed-${reactId}`} style={{ minHeight: 152 }}>
      <div ref={containerRef} id={`sp-${reactId}`} className="w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading clip…
        </div>
      )}
    </div>
  );
}
