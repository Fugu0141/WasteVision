# Phase 2 — Object names first (v0.2)

## Why the scope changed

WasteVision v0.1 proved that on-device camera inference works on smartphones.
A single RGB image cannot reliably determine a physical material (e.g. PET vs.
other transparent plastics). Phase 2 therefore focuses on making **object
names** useful as an API before investing in a material-specific dataset.

## New features

1. **Two models**. EfficientDet-Lite2 int8 is the accuracy-oriented mode
   (448 × 448 inputs). Lite0 int8 remains available as a faster alternative
   (320 × 320). Both are included as self-hosted assets by prepare:assets.
2. **Temporal stabilization**. Labels are returned only when an object has
   received the same name in at least 3 of the most recent 5 *matched*
   detections. Greedy intersection-over-union matching tracks neighboring
   boxes; tracks expire after missed frames.
3. **Text API**. `result.text` is the best stable object name in English;
   `result.recognizedObjects` contains the unique stable object names.
   `result.detections` retains raw per-frame results for debugging and
   `result.stableDetections` includes stabilized observations.
4. **UI**. The camera demo allows selecting high-accuracy or fast mode *before
   start*, displays the stable object name prominently, and exposes JSON.
   Japanese descriptions are display-only and do not change the API keys.

## API

```js
const scanner = createWasteScanner({
  video: document.querySelector("video"),
  overlay: document.querySelector("canvas"),
  detectorFactory: () => createMediaPipeDetector({
    wasmPath: "./wasm",
    modelUrl: "./models/efficientdet_lite2.tflite",
    scoreThreshold: 0.35
  }),
  temporal: { minObservations: 3, windowSize: 5 },
  onResult(result) {
    console.log(result.text);              // e.g. "bottle" or null
    console.log(result.recognizedObjects); // e.g. ["bottle", "cup"]
    console.log(result.detections);        // raw, may flicker
  }
});
await scanner.start();
```

A simplified output (numbers are illustrative, **not a benchmark**):

```json
{
  "text": "bottle",
  "recognizedObjects": ["bottle"],
  "detections": [],
  "stableDetections": [
    {
      "object": "bottle",
      "objectConfidence": 0.78,
      "material": "unknown",
      "materialConfidence": null,
      "materialCandidates": ["plastic", "glass", "metal"],
      "needsConfirmation": true,
      "boundingBox": {"x": 100, "y": 50, "width": 90, "height": 200},
      "stability": {"observations": 3, "window": 3}
    }
  ]
}
```

`detections` is empty only to shorten this example. In a real stabilized
frame it would contain the raw detections. Do not confuse votes or
`objectConfidence` with measured end-to-end accuracy.

## Known limitations

- Both pretrained detectors recognize COCO's 80 generic object labels,
  **not** all types of garbage; they cannot distinguish PET, steel, aluminum,
  or local waste categories. "bottle" can be glass, plastic, or other material.
- Temporal voting reduces flickering but may repeat a wrong label; it is NOT
  a correctness guarantee and confidence is NOT calibrated probability.
- Higher mAP on COCO does not guarantee better results on a particular waste
  dataset. Lite2 is slower and may cause UI stutter on low-end phones because
  the current MediaPipe VIDEO API runs synchronously on the main thread.
- IoU tracking is an approximation; fast movements, occlusion and near-identical
  adjacent objects may cause temporary incorrect associations.
- Manual SDK integrations can supply their own `detector` adapter to classify
  additional categories. Model retraining is a separate future phase.

## How to evaluate accuracy

Create a spreadsheet with **real garbage objects** recorded locally.
For each object, capture trials in multiple lighting conditions and positions
on at least one iOS and one Android device:

| Ground truth | Device | Mode | Environment | Stable text | Correct? | Time to first stable text (ms) |
|---|---|---|---|---|---|---|
| bottle | (device) | Lite2 | bright | (result) | (true/false) | (measured) |
| cup | (device) | Lite0 | indoor | (result) | (true/false) | (measured) |

Calculate **exact object-label accuracy**, **unknown/no-result rate**,
and **false positive rate** on this evaluation set; also measure CPU heat,
responsive interaction, and frames/sec. No claim of improved real-world
accuracy is made until tested against the same labeled sample set.

## Next possible work

- Collect and license waste-specific images/labels (not just COCO classes).
- Evaluate per-item confusion matrix, tricky materials and false positives.
- Fine-tune a custom object detection model and add a classifier fallback for
  cropped, single-object images.
- Recognition snapshot workflow and optional "select this object" touch UI.
- Add OCR/recycling mark detection only when the product needs it.

## Sources

- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector
- https://developers.google.com/edge/litert/libraries/modify/object_detection
