# WasteVision v0.3 — Accuracy Recovery Plan

Status: **approved direction for implementation, NOT an implemented classifier**.
Replaces the previous assumption that simply switching from EfficientDet-Lite0 to Lite2 will solve recognition.

## User-observed problem and diagnosis

The v0.2 smartphone demo frequently returns both **incorrect labels** and **no detections**.
This is expected when an 80-class general-object COCO detector is applied to Japanese waste items, many of which have no matching category. Temporal voting can stabilize a wrong label. Model size alone cannot solve missing classes.

## Product target

- Camera footage and ML inference remain local to the browser (HTML/CSS/JavaScript SDK).
- Main output is the **object category name**, not inferred material or the local disposal instruction.
- A failed or uncertain prediction yields `unknown` / `null` instead of a plausible-but-unreliable guess.
- Works even when the general-object detector fails; preserve existing live overlay as an optional aid.
- Model training is an offline developer step and can use Python; no Python runs inside the Web application. MediaPipe Image Classifier consumes metadata-compatible `.tflite` assets.

## Architecture decision

```text
Camera / HTMLVideoElement
  |
  +-> Optional generic live detector (v0.2, Lite0/Lite2) ---> AR-style guidance
  |
  +-> Scan button / user selects an object in frame
         |
         +-> freeze one frame + center ROI, or detected ROI if selected
                |
                +-> WasteClassifierAdapter (custom TFLite / MediaPipe Image Classifier)
                       |
                       +-> top-k candidates + reject/unknown decision
                              |
                              +-> ScanResult label/text + user confirmation
```

**Why this order:** a single-object crop classification can run without a successful bounding-box detection. A future trained waste-specific detector is only necessary when supporting multiple objects in one scene or automatic selection.

### Compatibility and error handling

- Keep `createWasteScanner`, `start`, `scan`, `stop`, `dispose`, `onResult`, `detections`, `stableDetections`, `recognizedObjects`, and v0.2 `text` unchanged for existing integrations.
- Add an optional separate snapshot API: `scanSnapshot({ region: 'center' })` (proposed; not yet implemented). The first version does not assume that the object detector found a bounding box.
- Do **not** replace v0.2 streaming results with classifier output before validation.
- If no custom classifier model is available, the snapshot mode MUST report `model_unavailable`, not fabricate class predictions or silently fall back to generic COCO names.
- Request camera permission before loading AI models, matching the earlier mobile bug fix.
- Avoid concurrent expensive inference on the main thread; run image classification only when scanning a snapshot at first, then consider a Worker after benchmarking platform support.

### Proposed snapshot response contract

```json
{
  "status": "recognized",
  "text": "beverage_can",
  "label": "beverage_can",
  "score": 0.87,
  "candidates": [
    { "label": "beverage_can", "score": 0.87 },
    { "label": "bottle", "score": 0.08 }
  ],
  "source": "center_crop",
  "modelVersion": "waste-classifier-v1"
}
```

Illustrative JSON only; no real trained model exists yet. `score` is the classifier output, NOT an established probability of correctness. In uncertain cases: `status: 'unknown'`, `text: null`, `label: null`. For load failures: `status: 'model_unavailable'`.

## Class taxonomy v1

Use mutually distinguishable **object form** categories, not unsupported material or municipal disposal labels.

| Canonical label | Japanese UI label | Definition / borderline cases |
|---|---|---|
| `bottle` | ボトル | Beverage/household bottle; do NOT presume PET or glass |
| `beverage_can` | 飲料缶 | Beverage can, but NOT aluminum versus steel |
| `cup` | コップ・カップ | Drinking cup of any material |
| `food_tray` | 食品トレー | Open tray-like food container; not every lidded box |
| `plastic_bag` | 袋 | Flexible shopping or packaging bag; visual class only |
| `battery` | 乾電池 | Common removable cylindrical household battery; expanded types later |
| `other` | 対象外・不明 | Background, hands, unrelated objects, ambiguous/novel waste |

Revisit labels only after examining actual user errors; use a versioned taxonomy. The `other` class alone is NOT sufficient for safe rejection.

## Implementation milestones (order matters)

### Milestone A — Reproducible benchmark + fallback UI

- [ ] Add a `Scan once` action that freezes the frame, draws a central framing guide, and works with zero detections.
- [ ] Add optional user selection of existing bounding boxes; keep center ROI as an independent fallback.
- [ ] Log label, score, device/browser category, latency and predicted/confirmed class **locally only** with user consent.
- [ ] Add a simple offline results export without auto-uploading personal camera images.
- [ ] Capture baseline results for Lite0 and Lite2 using identical held-out scenes; track no-detection separately from wrong-detection.
- [ ] First milestone must work without any new classifier: show `classifier not installed`, not a fictitious result.

### Milestone B — Waste-specific single-object classifier

- [ ] Gather a diverse, licensed, labeled dataset for taxonomy v1 plus negatives.
- [ ] Fine-tune a small Image Classification model (start with an EfficientNet-Lite0/MobileNet-family candidate) offline and export a metadata-compatible TFLite model.
- [ ] Add `src/adapters/waste-classifier.js` using MediaPipe `ImageClassifier.createFromOptions()` and `.classify()` for snapshots.
- [ ] Add configurable rejection based on **validation-calibrated** score and top-two margin. Do not hardcode 0.70 or similar as a universal truth.
- [ ] Compare snapshot-only classifier with v0.2 detector+temporal voting on the same held-out test set.
- [ ] Keep the model in static self-hosted assets; do not transmit images to an API or load a remote hosted model at inference time.

### Milestone C — Multiple objects and SDK integration

- [ ] If needed, train a waste-specific detector and return multiple per-object boxes; avoid requiring detector boxes for the single-object mode.
- [ ] Optional ROI cropping from a user-tapped box; define box-to-canvas coordinate scaling explicitly.
- [ ] Add versioned public `scanSnapshot()` with stable unknown/error output and integration samples for Samurai.
- [ ] Add browser-specific performance regression tests and accessibility/permission behavior.

## Dataset capture and split protocol

- Start with a pilot of around 100–200 labeled photos per target class, from **multiple distinct physical items** and contexts. This is a collection target, not a scientifically established minimum.
- Include at least 100 `other` / out-of-scope images. Vary indoor/outdoor lighting, clutter, distance, angle, reflectivity, background, phones, and item condition (crushed/stained).
- Do not mix nearly identical frames or photos of the **same physical item** across train, validation, and test: group by item ID and capture session.
- Reserve roughly 70% of item groups for training, 15% validation, and 15% test (adjust for few-item classes); a final holdout remains untouched while selecting thresholds/models.
- Preserve labels and source/license/attribution; do not upload a private camera image merely because a scan fails.
- TACO provides a starting point for bottles, cans, and bags in context, but class coverage, background distribution, and dataset asset licenses require verification for each intended use.

## Evaluation: require baseline comparison before calling v0.3 'more accurate'

Record each class and the `other` negatives separately.

| Metric | Definition | Provisional target (not measured) |
|---|---|---|
| Incorrect accepted rate | Wrong non-unknown predictions / all non-unknown predictions | <=5% |
| In-scope coverage | Accepted predictions / eligible in-scope tests | >=80% |
| Per-class recall | Correct accepted outputs / ground-truth tests of that class | Report every class |
| No-result rate | Unknown, unavailable, no detection / all trials (reported by mode) | Report with confidence intervals |
| Time to result | From user action to snapshot decision on iOS/Android | Report p50/p95; target p50 <=2 s |
| Privacy | Uploaded camera image bytes by SDK | 0 |

Targets are **initial product goals**, NOT achieved metrics. A model that reduces errors by saying `unknown` for everything must fail the coverage gate. A model that confidently mislabels unusual objects must fail the incorrect-accepted gate.

## Risks and safeguards

- Classification is single-object only initially; crowded scenes may produce irrelevant predictions.
- Every confidence threshold needs measurement on a representative holdout; softmax values can be overconfident.
- Do not treat `bottle` as equivalent to `PET`; do not infer recycling instructions from class labels alone.
- Training can use developer Python tools without changing the HTML/CSS/JS-only web runtime.
- Keep CPU/thermal budget manageable by doing snapshot classification rather than two heavyweight continuous loops.
- Do not commit recorded faces, addresses, location metadata, or unrelated private details. Any dataset contribution must be opt-in and reviewable.

## Prioritized issue checklist

1. Build snapshot/center-crop diagnostic mode with an explicit not-yet-trained state.
2. Create dataset capture/export format, test split and error baseline.
3. Train and validate a narrow classifier and integrate it behind an adapter.
4. Re-evaluate whether a waste-specific detector is needed after the single-object flow is measured.

## References

- MediaPipe Image Classifier (Web): https://developers.google.com/edge/mediapipe/solutions/vision/image_classifier?tab=Web
- Image classification transfer learning + export: https://developers.google.com/edge/litert/libraries/modify/image_classification
- TACO litter dataset: https://github.com/pedropro/TACO
