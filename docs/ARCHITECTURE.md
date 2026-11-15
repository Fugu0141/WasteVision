# WasteVision architecture — v0.1

## Goals

1. Web-only reusable JavaScript SDK, not tied to Samurai.
2. On-device image inference. No SDK camera-image uploads.
3. 2D camera overlay and machine-readable recognition results.
4. Clearly separate object identification from material verification.
5. Swappable recognition engine for future waste-specific models.

## Non-goals of v0.1

- Physical material authentication by RGB image alone.
- Municipality-specific waste-disposal guidance.
- Optical character recognition, recycling-symbol classification, instance segmentation.
- 3D WebXR tracking, depth measurements, or tracking objects across frames.
- Fully offline *installation*: initial npm/model downloads are online.

## Pipeline

```text
getUserMedia -> HTMLVideoElement -> DetectorAdapter
                                     |
                                     v
                               Raw detections
                               (label,score,box)
                                     |
                                     v
                              normalizeDetection
                              + material hints
                                     |
                          +----------+-----------+
                          v                      v
                  Canvas overlay          onResult(result)
                                             |
                                             v
                                           Host app
```

## Public API contract

`createMediaPipeDetector({wasmPath,modelUrl,scoreThreshold,maxResults})`
returns a detector implementing:
- `detect(videoElement, timestampMs): RawDetection[]`
- `close(): void`

`createWasteScanner({video,overlay,detector?,detectorFactory?,fps,onCameraReady,onResult,onError})` returns:
- Pass either a ready detector or async detectorFactory. When using a factory, camera permission and preview happen before AI initialization.
- `start(): Promise<void>` — obtains camera stream (user permission)
- `scan(): Promise<ScanResult>` — analyzes the current video frame
- `stop(): void` — stops all camera tracks
- `dispose(): void` — releases detector and camera (cannot restart)
- `running: boolean`, `latestResult: ScanResult`

```ts
// Contract illustration (the actual SDK is plain JavaScript).
type ScanResult = {
  timestampMs: number;
  detections: Array<{
    object: string;
    objectConfidence: number | null;
    material: "unknown";            // v0.1
    materialConfidence: null;        // v0.1
    materialCandidates: string[];    // hints only, not predictions
    needsConfirmation: true;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
};
```

Coordinates are in source-video pixels. The SDK expects the video and canvas to share a displayed aspect ratio.

## Model choice and provenance

- Runtime: `@mediapipe/tasks-vision@1.2.3`, CPU/WASM for compatibility.
- Detection model: Google EfficientDet-Lite0 int8, trained on COCO object classes.
- Source: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
- Limitation: COCO classes (bottle, cup, book, etc.) are **object labels**, not material or waste classes.
- `prepare:assets` copies WASM and downloads the model for self-hosting. The model is not committed to Git.

Review upstream model/package redistribution terms and third-party notices before shipping. In deployment, avoid third-party runtime CDNs to keep image processing local and reduce unexpected network dependencies.

## Security and privacy requirements

- Secure context (HTTPS or localhost); explicit camera permissions.
- Never upload image frames, logs containing frames, or model inputs.
- Stop all `MediaStreamTrack` objects when scanning stops.
- Handle inference failures and camera-denied exceptions.
- Treat AI labels and material candidates as untrusted hints.
- Include MediaPipe's documented performance/usage metrics behavior in privacy review; do not claim a zero-network app until verified.
- Benchmark heat/battery, iOS Safari/Android Chrome, permission handling, and build artifacts before production.

## Roadmap

### v0.1 — object-detection proof of concept
- [x] Module-oriented SDK and camera lifecycle
- [x] MediaPipe adapter
- [x] 2D AR-style overlay
- [x] Readable results with unresolved material
- [x] Basic tests
- [ ] Real-device and performance verification

### v0.2 — evidence-based material classification
- [ ] Waste-specific dataset with item/material labels and licensing review
- [ ] Independent material model with calibratable scores
- [ ] Recycling mark recognition and OCR
- [ ] Evidence fusion + reject/unknown thresholds
- [ ] Per-class confusion matrices and confidence calibration

### v0.3 — app integration
- [ ] Stable API and package build
- [ ] Language-neutral material taxonomy
- [ ] Confirmation UI with user override
- [ ] Offline/PWA precaching and regression tests
- [ ] Municipality-specific rule engine as a separate package
- [ ] Accessibility and localization

## Decision log

- **AR means 2D overlays in v0.1.** WebXR is not required for bounding boxes.
- **Unknown is the default material.** Do not infer PET from a bottle silhouette.
- **Object confidence != material confidence.** Scores are separate by design.
- **No SDK-owned disposal logic.** City/ward rules belong in the host application.
