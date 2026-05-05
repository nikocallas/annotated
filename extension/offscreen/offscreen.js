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
  if (msg.type === "OFFSCREEN_PING") {
    sendResponse({ ok: true, recording: recorder?.state === "recording" });
    return false;
  }
});

emit("OFFSCREEN_READY", {});
