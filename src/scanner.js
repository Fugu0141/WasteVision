import { drawOverlay } from "./overlay.js";
import { normalizeDetection } from "./materials.js";

/**
 * Wraps camera management, a replaceable detector, and a result callback.
 * The detector can be any object exposing detect(video, timestampMs) and close().
 */
export function createWasteScanner({
  video,
  overlay = null,
  detector = null,
  detectorFactory = null,
  fps = 5,
  onCameraReady = () => {},
  onResult = () => {},
  onError = () => {}
} = {}) {
  if (!video || typeof video.play !== "function") {
    throw new TypeError("A video element is required.");
  }
  if (!detector?.detect && typeof detectorFactory !== "function") {
    throw new TypeError("A detector or a detectorFactory is required.");
  }
  if (typeof onResult !== "function" || typeof onError !== "function" || typeof onCameraReady !== "function") {
    throw new TypeError("onResult and onError must be functions.");
  }

  let activeDetector = detector;
  let generation = 0;
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
      const raw = await activeDetector.detect(video, timestampMs);
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
    const thisGeneration = ++generation;
    // Ask for camera permission before loading the model.
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    if (disposed || thisGeneration !== generation) {
      cameraStream.getTracks().forEach((track) => track.stop());
      throw new Error("Camera start was cancelled.");
    }
    stream = cameraStream;
    try {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (disposed || thisGeneration !== generation) throw new Error("Camera start was cancelled.");
      onCameraReady();
      if (!activeDetector) {
        const newDetector = await detectorFactory();
        if (disposed || thisGeneration !== generation) {
          newDetector?.close?.();
          throw new Error("Camera start was cancelled.");
        }
        if (!newDetector || typeof newDetector.detect !== "function") {
          newDetector?.close?.();
          throw new TypeError("detectorFactory must return an object with detect().");
        }
        activeDetector = newDetector;
      }
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
    generation++;
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
    activeDetector?.close?.();
    activeDetector = null;
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
