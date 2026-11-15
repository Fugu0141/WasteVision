# v0.3 — Class-agnostic unknown-object geometry

**Status:** Implemented prototype. The browser demo is deployed via
[GitHub Pages](https://fugu0141.github.io/WasteVision/); tested by GitHub
Actions for unit tests / download / production build. Real-device segmentation
accuracy, iOS Safari latency, and material identification are **not** verified.

## Objective

Unknown objects should not be forced into one of COCO's 80 labels.
The host application can ask the user to tap an object in a camera snapshot,
extract a foreground mask using a class-agnostic model, and report geometric
observations without making unsupported physical-material claims.

## What is implemented

- `src/geometry.js`: pure, dependency-free mask geometry, manual rectangle
  ROI fallback, and pointer-to-source-image coordinate mapping. No network
  code or MediaPipe import.
- `src/extensions/segmentation.js`: optional MediaPipe Interactive Segmenter
  adapter. It is lazy-loaded only when the demo user taps an object. Exposes
  `setImage(canvas)`, `segmentPoint(nx, ny)`, `close()`.
- `scripts/prepare-segmentation.mjs`: separately downloads the official
  MagicTouch model for same-origin self-hosting. CI deploys it with the demo.
- `demo/unknown-object.js`: freeze a frame, select by tapping (mask) or by
  manual rectangle, draw foreground tint/bounding box, show/copy JSON.
- `tests/geometry.test.js`: mask area, geometry, unknown state, no physical
  dimensions, ROI and pointer coordinates.
- The existing v0.2 detector overlay, camera-first permission flow, and API
  remain in place. No remote image upload is part of the default demo.

## Setup

```bash
npm install
npm run prepare:assets
npm run prepare:segmentation
npm run dev
```

A phone needs a secure HTTPS context (e.g. configured GitHub Pages); an
insecure LAN HTTP address typically cannot access the camera.

The `prepare:segmentation` step is **optional** for developers who only
need the normal core detector or the manual rectangle tool.

## API usage

```js
import { analyzeMask, analyzeRectangle } from "waste-vision/geometry";
import { createInteractiveObjectSegmenter } from "waste-vision/extensions/segmentation";

// Freeze a camera frame into a still HTMLCanvasElement first.
const segmenter = await createInteractiveObjectSegmenter({
  wasmPath: "/wasm",
  modelUrl: "/models/interactive_segmentation.task",
  delegate: "CPU"
});
segmenter.setImage(canvas);
const mask = segmenter.segmentPoint(0.4, 0.6);
const result = analyzeMask({ ...mask, source: "user_tap", threshold: 0.5 });
console.log(result.region.bboxPx, result.geometry.areaFraction);
segmenter.close();

// If the image mask fails, allow manual region selection:
const roi = analyzeRectangle(
  { x: 100, y: 90, width: 160, height: 200 },
  canvas.width, canvas.height
);
console.log(roi.region.maskAvailable); // false
```

### Output

Example values are **illustrative**, not a model benchmark:

```json
{
  "status": "segmented",
  "objectName": null,
  "region": {
    "source": "user_tap",
    "bboxPx": {"x": 80, "y": 70, "width": 200, "height": 300},
    "maskAvailable": true
  },
  "geometry": {
    "widthPx": 200,
    "heightPx": 300,
    "areaPx": 38500,
    "areaFraction": 0.09,
    "aspectRatio": 0.6667,
    "centroidPx": {"x": 173, "y": 217},
    "perimeterPx": 910,
    "shape": "oblong",
    "dimensionsMm": null,
    "scaleSource": "none"
  },
  "material": { "value": "unknown", "candidates": [], "verified": false },
  "marks": [],
  "needsConfirmation": true
}
```

For manually selected rectangles, `status` is `region_selected`,
`maskAvailable` is false, and `geometry.areaPx` /
`geometry.areaFraction` are null (an ROI is not an object's area).
`geometry.regionFraction` is the portion of the image covered by the ROI.

For empty masks, `status` is `unknown`, `region.bboxPx` is null, and
`objectName` / `geometry.dimensionsMm` remain null.

## Model / coordinate details

- Model: official **MagicTouch v2 int8** for image-pinned interactive
  segmentation; model URL:
  `https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task`.
- MediaPipe Tasks Vision `1.2.3`, `InteractiveSegmenter`.
- `setImage()` takes a **frozen image**; it is not a live VIDEO-mode task.
- `segmentPoint(x, y)` uses normalized coordinates in [0, 1].
- `getAsFloat32Array()` output is copied and its MPMask is closed, to
  avoid holding native memory after returning a result.
- The returned mask is aligned to the pinned image according to the
  MediaPipe API. A mismatched resolution is rejected in the demo rather
  than silently distorting an overlay.
- The frozen canvas is at most 768 pixels along its longest edge; drawing
  a frame uses `drawImage` and does not upload pixels.
- The current default CPU implementation may be slow on low-end phones;
  freeze a frame and tap rather than running continuous segmentation.
- Model fetch is a first-time **asset download**, not an upload of camera
  images. Local-inference guarantees do not imply a total absence of
  unrelated SDK telemetry.

## Accuracy and safety

Segmentation predicts a foreground **mask**, not a certified object boundary.
Background, overlapping objects, reflections and low contrast can cause
bad masks. Pixel dimensions are not real dimensions; no depth, focal
calibration, user-supplied physical reference, or material verification is
implemented. `shape` is a coarse *2D silhouette* heuristic.

Do not use `areaFraction` to decide whether an object is "small" in cm.
Do not use `material.value: "unknown"` as an excuse to guess PET, paper,
aluminum, or a municipal waste-disposal category.

## Next steps

1. Benchmark masks on real unknown objects with ground-truth annotations
   (IoU / pixel F1), emphasizing translucent packaging and clutter.
2. Decide whether point prompts are sufficient or add a brush/correction
   interaction for poor masks.
3. Add an optional **scale calibration** extension (reference object or
   supported depth source) before reporting cm / mm.
4. Add independent, explainable **material evidence** handling: printed
   recycling marks and user confirmation, then evaluate image-based
   materials classifier separately if needed.

## References

- https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter
- https://developers.google.com/edge/api/mediapipe/js/tasks-vision.interactivesegmenter
