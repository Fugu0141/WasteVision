import { drawOverlay } from "./overlay.js";
import { normalizeDetection } from "./materials.js";

/**
 * Wraps camera management, a replaceable detector, and a result callback.
 * The detector can be any object exposing detect(video, timestampMs) and close().
 */
export function createWasteScanner({
  video,
  overlay = null,
  detector,
  fps = 5,
  onResult = () => {},
  onError = () => {}
} = {}) {
  if (!video || typeof video.play !== "function") {
    throw new TypeError("A video element is required.");
  }
  if (!detector || typeof detector.detect !== "function") {
    throw new TypeError("A detector with detect(video, timestampMs) is required.");
  }
  if (typeof onResult !== "function" || typeof onError !== "function") {
    throw new TypeError("onResult and onError must be functions.");
  }

  let stream = null;
  let running = false;
  let disposed = false;
  let busy = false;
  let animationFrameId = null;
  let lastVideoTime = -1;
  let lastScanTime = -Infinity;
  let latest = { timestampMs: 0, detections: [] };
  const minimumInterval = 1000 / Math.max(1, Math.min(15, Number(fps) || 5));

  async function scan() {
    if (!running) throw new Error("Start the scanner before calling scan().");
    if (busy) return latest;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return latest;

    busy = true;
    try {
      const timestampMs = performance.now();
      const raw = await detector.detect(video, timestampMs);
      const detections = (raw ?? []).map(normalizeDetection);
      latest = { timestampMs, detections };
      drawOverlay(overlay, video, detections);
      onResult(latest);
      return latest;
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (!running) return;
    animationFrameId = requestAnimationFrame(async (now) => {
      if (!running) return;
      if (!busy && now - lastScanTime >= minimumInterval &&
          video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastScanTime = now;
        lastVideoTime = video.currentTime;
        try {
          await scan();
        } catch (error) {
          stop();
          onError(error);
        }
      }
      if (running) schedule();
    });
  }

  async function start() {
    if (disposed) throw new Error("This scanner has been disposed.");
    if (running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API is unavailable. Use HTTPS or localhost.");
    }
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    stream = cameraStream;
    try {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      running = true;
      lastScanTime = -Infinity;
      lastVideoTime = -1;
      schedule();
    } catch (error) {
      stop();
      throw error;
    }
  }

  function stop() {
    running = false;
    if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    video.srcObject = null;
    drawOverlay(overlay, video, []);
  }

  function dispose() {
    if (disposed) return;
    stop();
    detector.close?.();
    disposed = true;
  }

  return {
    start,
    scan,
    stop,
    dispose,
    get running() { return running; },
    get latestResult() { return latest; }
  };
}
