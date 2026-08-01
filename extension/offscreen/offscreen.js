// Annotated — Offscreen audio recorder
// Manifest V3 service workers cannot call getUserMedia, and the side panel page
// is unloaded as soon as the user closes the panel. The chrome.offscreen API
// gives us a hidden DOM context that can hold an active MediaRecorder for the
// full duration of a clip, even if the user navigates between tabs.

import { MAX_CLIP_SECONDS } from "../shared/clip-utils.mjs";

const MAX_DURATION_MS = MAX_CLIP_SECONDS * 1000;

let recorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;
let autoStopTimer = null;
let captureInProgress = false;

function reply(id, payload) {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_REPLY", id, payload }).catch(() => {});
}

function emit(type, data) {
  chrome.runtime.sendMessage({ type, data }).catch(() => {});
}

function captureReady(id) {
  chrome.runtime.sendMessage({ type: "OFFSCREEN_CAPTURE_READY", id }).catch(() => {});
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
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

async function captureTab(id, { streamId, kind, durationMs }) {
  let tabStream = null;
  let outputContext = null;
  let video = null;
  let canvasStream = null;
  let drawTimer = null;
  let heartbeatTimer = null;
  let captureRecorder = null;
  try {
    if (recorder?.state === "recording") throw new Error("Finish audio commentary recording first");
    if (captureInProgress) throw new Error("Another source clip is already being captured");
    captureInProgress = true;
    const safeDurationMs = Math.min(MAX_DURATION_MS, Math.max(1_000, Number(durationMs) || 0));
    const videoCapture = kind !== "audio";
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: videoCapture
        ? {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: streamId,
            },
          }
        : false,
    });

    if (tabStream.getAudioTracks().length) {
      outputContext = new AudioContext();
      outputContext.createMediaStreamSource(tabStream).connect(outputContext.destination);
    }

    let recordingStream = tabStream;
    let width = null;
    let height = null;
    if (videoCapture) {
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = tabStream;
      await video.play();
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Captured tab did not provide video frames")), 5_000);
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
      }

      height = 240;
      width = Math.max(2, Math.round((video.videoWidth / video.videoHeight) * height / 2) * 2);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Unable to initialize 240p encoder canvas");
      const draw = () => {
        context.fillStyle = "black";
        context.fillRect(0, 0, width, height);
        context.drawImage(video, 0, 0, width, height);
      };
      draw();
      drawTimer = setInterval(draw, 1000 / 15);
      canvasStream = canvas.captureStream(15);
      for (const track of tabStream.getAudioTracks()) canvasStream.addTrack(track);
      recordingStream = canvasStream;
    }

    const mime = videoCapture
      ? MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
    const captureChunks = [];
    captureRecorder = new MediaRecorder(recordingStream, {
      mimeType: mime,
      ...(videoCapture ? { videoBitsPerSecond: 320_000, audioBitsPerSecond: 64_000 } : { audioBitsPerSecond: 64_000 }),
    });
    captureRecorder.ondataavailable = (event) => {
      if (event.data?.size) captureChunks.push(event.data);
    };

    const stopped = new Promise((resolve, reject) => {
      captureRecorder.onerror = (event) => reject(event.error || new Error("MediaRecorder failed"));
      captureRecorder.onstop = async () => {
        try {
          const blob = new Blob(captureChunks, { type: mime.split(";")[0] });
          const buffer = await blob.arrayBuffer();
          resolve({
            ok: true,
            base64: arrayBufferToBase64(buffer),
            mime: blob.type,
            durationMs: safeDurationMs,
            bytes: buffer.byteLength,
            width,
            height,
          });
        } catch (error) {
          reject(error);
        }
      };
    });

    captureRecorder.start(500);
    captureReady(id);
    // A source clip can legitimately run longer than Chrome's 30-second MV3
    // service-worker idle window. Messages from the offscreen document reset
    // that timer without keeping the worker alive outside an active capture.
    const captureStartedAt = Date.now();
    heartbeatTimer = setInterval(() => {
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_CAPTURE_PROGRESS",
        id,
        elapsedMs: Math.min(safeDurationMs, Date.now() - captureStartedAt),
        durationMs: safeDurationMs,
      }).catch(() => {});
    }, 20_000);
    await new Promise((resolve) => setTimeout(resolve, safeDurationMs));
    if (captureRecorder.state !== "inactive") captureRecorder.stop();
    reply(id, await stopped);
  } catch (err) {
    try {
      if (captureRecorder?.state && captureRecorder.state !== "inactive") captureRecorder.stop();
    } catch {}
    reply(id, { error: err?.message || String(err), name: err?.name || "Error" });
  } finally {
    captureInProgress = false;
    if (drawTimer) clearInterval(drawTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try { video?.pause(); } catch {}
    if (video) video.srcObject = null;
    try { canvasStream?.getVideoTracks().forEach((track) => track.stop()); } catch {}
    try { tabStream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { await outputContext?.close(); } catch {}
  }
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
  if (msg.type === "OFFSCREEN_CAPTURE_TAB") {
    captureTab(msg.id, msg);
    return false;
  }
  if (msg.type === "OFFSCREEN_PING") {
    reply(msg.id, {
      ok: true,
      recording: recorder?.state === "recording",
      capturing: captureInProgress,
    });
    return false;
  }
});

emit("OFFSCREEN_READY", {});
