import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

/**
 * Implements detector.detect(video, timestampMs) -> raw object detections.
 * Model and WASM files are expected to be served from this application's origin.
 */
export async function createMediaPipeDetector({
  wasmPath = "./wasm",
  modelUrl = "./models/efficientdet_lite0.tflite",
  scoreThreshold = 0.4,
  maxResults = 8
} = {}) {
  const wasm = await FilesetResolver.forVisionTasks(wasmPath);
  const instance = await ObjectDetector.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
    runningMode: "VIDEO",
    scoreThreshold,
    maxResults
  });

  let closed = false;
  return {
    detect(video, timestampMs) {
      if (closed) throw new Error("The detector has been closed.");
      const response = instance.detectForVideo(video, timestampMs);
      return (response.detections ?? []).map((item) => {
        const category = item.categories?.[0];
        return {
          object: category?.categoryName ?? "unknown",
          score: category?.score ?? null,
          boundingBox: item.boundingBox
        };
      });
    },
    close() {
      if (!closed) instance.close();
      closed = true;
    }
  };
}
