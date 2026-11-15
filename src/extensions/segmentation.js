import { FilesetResolver, InteractiveSegmenter } from "@mediapipe/tasks-vision";

/**
 * Optional browser-only point-guided segmentation adapter.
 * MediaPipe MagicTouch v2 operates on a PINNED STILL IMAGE, not video streams.
 * The model and wasm files must be served by the embedding application.
 */
export async function createInteractiveObjectSegmenter({
  wasmPath = "./wasm",
  modelUrl = "./models/interactive_segmentation.task",
  delegate = "CPU"
} = {}) {
  const wasm = await FilesetResolver.forVisionTasks(wasmPath);
  const task = await InteractiveSegmenter.createFromOptions(wasm, {
    baseOptions: { modelAssetPath: modelUrl, delegate }
  });
  let closed = false;
  let hasImage = false;
  return {
    setImage(image) {
      if (closed) throw new Error("Segmenter has been closed.");
      task.setImage(image);
      hasImage = true;
    },
    segmentPoint(normalizedX, normalizedY) {
      if (closed) throw new Error("Segmenter has been closed.");
      if (!hasImage) throw new Error("Call setImage() before segmentPoint().");
      if (![normalizedX, normalizedY].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
        throw new RangeError("Point coordinates must be normalized to [0, 1].");
      }
      const mask = task.segment([{
        brushMode: 1,
        point: [{ x: normalizedX, y: normalizedY }],
        isCompleted: true
      }]);
      try {
        // Copy before closing the native-backed MPMask.
        return {
          width: mask.width,
          height: mask.height,
          data: Float32Array.from(mask.getAsFloat32Array())
        };
      } finally {
        mask.close();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      task.close();
    }
  };
}
