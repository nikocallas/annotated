// Annotated — Offscreen audio recorder
// Manifest V3 service workers cannot call getUserMedia, and the side panel page
// is unloaded as soon as the user closes the panel. The chrome.offscreen API
// gives us a hidden DOM context that can hold an active MediaRecorder for the
// full duration of a clip, even if the user navigates between tabs.

const MAX_DURATION_MS = 90_000;

let recorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;
let autoStopTimer = null;

function reply(id, payload) {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_REPLY", id, payload }).catch(() => {});
}

function emit(type, data) {
  chrome.runtime.sendMessage({ type, data }).catch(() => {});
}

async function start(id) {
  try {
    if (recorder && recorder.state === "recording") {
      return reply(id, { error: "Already recording" });
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => emit("RECORDER_ERROR", { message: String(e?.error?.message || e) });
    startedAt = Date.now();
    recorder.start(500);

    // Hard cap at 90s server-enforced; offscreen mirrors that.
    autoStopTimer = setTimeout(() => {
      if (recorder && recorder.state === "recording") {
        stop().then((res) => emit("RECORDER_AUTO_STOPPED", res)).catch(() => {});
      }
    }, MAX_DURATION_MS);

    reply(id, { ok: true, mime, startedAt });
  } catch (err) {
    cleanup();
    const name = err?.name || "Error";
    reply(id, { error: err?.message || String(err), name });
  }
}

function stop() {
  return new Promise((resolve, reject) => {
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      return reject(new Error("Not recording"));
    }
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
    recorder.onstop = async () => {
      try {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        const base64 = btoa(bin);
        const durationMs = Date.now() - startedAt;
        cleanup();
        resolve({ base64, mime, durationMs, bytes: buf.byteLength });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    recorder.stop();
  });
}

function cleanup() {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
  stream = null;
  recorder = null;
  chunks = [];
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
}

// ---- Tab-capture clip recorder --------------------------------------------
// MediaRecorder cannot run in the MV3 service worker, so we record the active
// tab's audio+video stream here. The SW mints a media stream id with
// chrome.tabCapture.getMediaStreamId and passes it in. We resolve it via
// getUserMedia({chromeMediaSource:'tab'}), record for the requested duration,
// optionally capture a single poster frame, and reply with the base64 blob.
//
// We deliberately downscale via a hidden <canvas> + captureStream so the
// upload stays within the ≤480p (target 240px) fair-use envelope regardless
// of the source resolution. If MediaRecorder + canvas captureStream is
// unavailable we fall back to recording the raw tab stream — the server-side
// size cap will reject anything beyond 24MB.

const TARGET_HEIGHT = 240;

async function recordTabClip(streamId, durationMs) {
  const cap = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
    video: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
  });

  // Pipe tab audio back to the user's speakers — getUserMedia({chromeMediaSource:'tab'})
  // routes the tab's audio into our stream and silences the page. A throwaway
  // <audio> element with the same MediaStream restores playback.
  const monitor = new Audio();
  monitor.srcObject = cap;
  monitor.play().catch(() => {});

  // Set up downscale via canvas: draw the captured video into a 240px-tall
  // canvas at ~24 fps, capture that as a stream, and merge with the original
  // audio track for recording.
  const srcVideo = document.createElement("video");
  srcVideo.srcObject = new MediaStream(cap.getVideoTracks());
  srcVideo.muted = true;
  srcVideo.playsInline = true;
  await srcVideo.play().catch(() => {});

  await new Promise((resolve) => {
    if (srcVideo.readyState >= 2) return resolve();
    srcVideo.onloadeddata = () => resolve();
    setTimeout(resolve, 800);
  });

  const srcW = srcVideo.videoWidth || 640;
  const srcH = srcVideo.videoHeight || 360;
  const scale = Math.min(1, TARGET_HEIGHT / srcH);
  const w = Math.max(2, Math.round(srcW * scale / 2) * 2);
  const h = Math.max(2, Math.round(srcH * scale / 2) * 2);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });

  let drawing = true;
  function drawTick() {
    if (!drawing) return;
    try { ctx.drawImage(srcVideo, 0, 0, w, h); } catch {}
    requestAnimationFrame(drawTick);
  }
  drawTick();

  const downStream = canvas.captureStream(24);
  for (const track of cap.getAudioTracks()) downStream.addTrack(track);

  const mp4Mime = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
  const webmMime = "video/webm;codecs=vp8,opus";
  const mime = MediaRecorder.isTypeSupported(mp4Mime)
    ? mp4Mime
    : MediaRecorder.isTypeSupported(webmMime)
      ? webmMime
      : "video/webm";

  const rec = new MediaRecorder(downStream, {
    mimeType: mime,
    videoBitsPerSecond: 600_000,
    audioBitsPerSecond: 96_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Capture a poster frame ~250ms in so the user sees actual content, not a
  // black first frame.
  const posterPromise = new Promise((resolve) => {
    setTimeout(() => {
      try {
        const c2 = document.createElement("canvas");
        c2.width = w; c2.height = h;
        c2.getContext("2d").drawImage(srcVideo, 0, 0, w, h);
        c2.toBlob((blob) => {
          if (!blob) return resolve(null);
          const r = new FileReader();
          r.onload = () => resolve({
            base64: String(r.result || "").split(",")[1] || "",
            mime: "image/jpeg",
          });
          r.onerror = () => resolve(null);
          r.readAsDataURL(blob);
        }, "image/jpeg", 0.78);
      } catch {
        resolve(null);
      }
    }, 250);
  });

  return new Promise((resolve, reject) => {
    let stopTimer = null;
    const cleanupAll = () => {
      drawing = false;
      try { rec.state !== "inactive" && rec.stop(); } catch {}
      try { cap.getTracks().forEach((t) => t.stop()); } catch {}
      try { downStream.getTracks().forEach((t) => t.stop()); } catch {}
      try { srcVideo.srcObject = null; } catch {}
      try { monitor.pause(); monitor.srcObject = null; } catch {}
      if (stopTimer) clearTimeout(stopTimer);
    };

    rec.onerror = (e) => {
      cleanupAll();
      reject(new Error(e?.error?.message || "Recorder error"));
    };
    rec.onstop = async () => {
      try {
        const poster = await posterPromise.catch(() => null);
        const blob = new Blob(chunks, { type: rec.mimeType || mime });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        const base64 = btoa(bin);
        cleanupAll();
        resolve({
          base64,
          mime: rec.mimeType || mime,
          bytes: buf.byteLength,
          width: w,
          height: h,
          thumbnailBase64: poster?.base64 || null,
          thumbnailMime: poster?.mime || null,
        });
      } catch (err) {
        cleanupAll();
        reject(err);
      }
    };

    rec.start(500);
    stopTimer = setTimeout(() => {
      try { rec.state === "recording" && rec.stop(); } catch {}
    }, durationMs);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "OFFSCREEN_START_RECORDING") {
    start(msg.id);
    return false;
  }
  if (msg.type === "OFFSCREEN_STOP_RECORDING") {
    stop()
      .then((payload) => reply(msg.id, { ok: true, ...payload }))
      .catch((err) => reply(msg.id, { error: err?.message || String(err) }));
    return false;
  }
  if (msg.type === "OFFSCREEN_CANCEL_RECORDING") {
    cleanup();
    reply(msg.id, { ok: true });
    return false;
  }
  if (msg.type === "OFFSCREEN_RECORD_TAB_CLIP") {
    recordTabClip(msg.streamId, msg.durationMs)
      .then((payload) => reply(msg.id, { ok: true, ...payload }))
      .catch((err) => reply(msg.id, { error: err?.message || String(err) }));
    return false;
  }
  if (msg.type === "OFFSCREEN_PING") {
    sendResponse({ ok: true, recording: recorder?.state === "recording" });
    return false;
  }
});

emit("OFFSCREEN_READY", {});
