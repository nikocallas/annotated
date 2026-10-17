import { useEffect, useRef } from "react";

/**
 * Plays a clip Annotated recorded and stored itself (240p video or audio).
 *
 * Chrome's MediaRecorder writes WebM files without a duration header, so the
 * element reports `duration === Infinity` and the seek bar never works. The
 * standard workaround is to seek far past the end once, which forces the
 * browser to scan the file and learn the real duration, then return to 0.
 */
export function RecordedClipPlayer({
  src,
  kind,
  testId,
}: {
  src: string;
  kind: "video" | "audio";
  testId?: string;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fixing = false;
    const onMeta = () => {
      if (el.duration === Infinity || Number.isNaN(el.duration)) {
        fixing = true;
        el.currentTime = 1e101;
      }
    };
    const onTime = () => {
      if (!fixing) return;
      fixing = false;
      el.currentTime = 0;
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [src]);

  if (kind === "audio") {
    return (
      <audio
        ref={ref}
        src={src}
        controls
        preload="metadata"
        className="w-full"
        data-testid={testId}
      />
    );
  }
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="w-full aspect-video bg-black"
      data-testid={testId}
    />
  );
}

/**
 * True only for media Annotated captured and stored in its own clip bucket,
 * never for placeholder or demo assets.
 */
export function isRecordedClip(url: string | null | undefined): url is string {
  return !!url && /\/storage\/v1\/object\/public\/clip-media\//.test(url);
}
