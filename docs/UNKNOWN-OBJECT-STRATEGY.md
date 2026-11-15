# WasteVision — unknown-object geometry and material evidence (design proposal)

Status: **DESIGN ONLY — v0.2.1 does not implement this pipeline**.

## Direction

WasteVision must not require the correct *name* of a waste item. Return
observable geometry and evidence, with explicit unknowns, so the host
application can decide how to guide the user. Keep the default SDK offline,
modular, and small; load ML extras only when the host opts in.

### Default SDK and optional modules

```text
waste-vision (default)
  ├─ camera + lifecycle
  ├─ detector adapter + normalized results
  ├─ mask/geometry interface (planned)
  └─ structured uncertain result (planned)

optional, separate imports
  ├─ extensions/segmentation  (planned: user-point object mask)
  ├─ extensions/markers       (planned: OCR/symbol evidence)
  ├─ extensions/measurement   (planned: scale reference)
  └─ extensions/hybrid        (existing: optional cloud snapshot provider)
```

**No cloud SDK import, API key, network request, or upload UI in the default
browser demo.** The existing v0.2 object detector remains functional.

## Recognition without knowing the object's class

### Step 1: user points at an object (class-agnostic segmentation)

- Let the user tap the screen or place a cursor over the item.
- Invoke an optional point/brush-prompted segmentation model that returns a
  mask for *that object*, without requiring a label like "bottle".
- The mask can support a live AR-style contour if performance permits. Start
  with a **single snapshot** to reduce battery and heat.
- Google's MediaPipe Interactive Segmenter is a candidate for a Web/JS adapter.
  Verify exact model compatibility, size, licensing, latency, and smartphone
  support before adopting it.
- If no suitable segmenter is installed, allow a **manual rectangle crop**.
  A user-selected rectangle is an ROI, not a guaranteed object mask.
- Do not silently treat generic COCO bounding boxes as exhaustive; they miss
  out-of-distribution objects.

### Step 2: measure pixel-space properties from the mask

The following measurements require no semantic class label:
- Mask bounding box and its pixel width/height
- Mask area in pixels and as a share of the camera frame
- Aspect ratio; contour/elongation; circularity or solidity when contour
  extraction is implemented
- Color distribution and approximate texture features, marked as descriptive
  observations rather than material facts

These are **image-plane properties**; they are not the item's real-world
dimensions or volume. Perspective, camera pose and occlusion matter.

### Step 3: real-world size is optional and needs a scale source

A **single uncalibrated RGB camera image cannot uniquely recover absolute
physical size**, because the apparent dimensions depend on distance from the
camera. Therefore:
- Default `dimensionsMm: null` and `scaleSource: "none"`.
- A user-supplied ruler/reference marker of known dimensions in the same
  plane can supply an approximate scale. Report accuracy limits, especially
  for perspective and curved or out-of-plane objects.
- Some AR/depth-capable devices offer depth APIs; support this only as an
  optional, feature-detected measurement plugin (not mandatory WebXR).
- Never imply that frame-area fraction or a small bounding box means a
  physically small object. Density/weight cannot be measured from RGB.

### Step 4: material is an evidence problem, not a visual certainty

Collect signals in decreasing order of typical reliability:
1. **Explicit recycling/material code** visible on the packaging, read
   with OCR, mark recognition, and user confirmation (e.g. PET 1, paper marks).
   Marks can refer to a *component* of mixed packaging, not the full object.
2. **User-provided evidence**: printed packaging information or a material
   choice for an ambiguous object.
3. **Image-based material candidate model** (optional) can suggest
   `plastic`, `metal`, `glass`, `paper`, `wood`, etc. Keep scores
   uncalibrated until evaluated on representative waste samples.
4. If insufficient or contradictory evidence: `material: "unknown"`.

Be especially cautious with glass vs transparent plastic, shiny metalized
plastic, aluminum vs steel, multilayer containers, contaminated/laminated
paper and composites. Image recognition cannot reliably infer magnetism
or identify a plastic polymer by appearance alone.

### Step 5: do not conflate physical properties with disposal rules

The SDK reports object features and uncertainty. Samurai or another host
app maps verified features, jurisdiction and item context into local
collection instructions. It must not infer local municipal rules in SDK code.

## Proposed machine-readable result, NOT current v0.2 output

```json
{
  "status": "needs_confirmation",
  "objectName": null,
  "region": {
    "source": "user_tap",
    "bboxPx": {"x": 40, "y": 60, "width": 210, "height": 310},
    "maskAvailable": true
  },
  "geometry": {
    "widthPx": 210,
    "heightPx": 310,
    "areaFraction": 0.16,
    "shape": "elongated",
    "dimensionsMm": null,
    "scaleSource": "none"
  },
  "material": {
    "value": "unknown",
    "candidates": [],
    "evidence": [],
    "verified": false
  },
  "marks": [],
  "needsConfirmation": true
}
```

All values are illustrative, not measured outputs. The design must support
both a `maskAvailable: false` state and `status: "unknown"`.

## v0.3 implementation order

1. **Small core boundary and independent extension imports**: done in
   v0.2.1; keep the existing demo local-only.
2. **Manual point/rectangle selection and geometry output**: first v0.3
   prototype with no requirement to recognize an object class. Define image
   coordinate contracts and ensure mobile pointer handling.
3. **Class-agnostic segmenter extension**: validate point/brush segmentation
   on iOS Safari and Android Chrome; allow rectangle fallback.
4. **Scale-reference measurement extension**: pixel measurement is base,
   real-world estimates are opt-in with explicit calibration.
5. **Materials evidence extension**: printed mark extraction (optional OCR)
   and optional conservative material candidates; return unknown by default.
6. Test unknown objects, mixed materials and backgrounds. Do not equate
   segmentation IoU or COCO mAP with real-world material classification
   quality.

## Acceptance tests for the future geometry prototype

- It returns a selected ROI when the generic object detector returns [].
- It never claims real dimensions without reference/depth calibration.
- It never claims a definite material without supporting evidence.
- It can return an unknown object with useful shape measurements.
- All core tests pass without a cloud endpoint or remote credentials.
- Regression: camera permission remains camera-first; iOS Safari and
  Android Chrome should each be tested on actual devices.

## References

- MediaPipe Interactive Segmenter:
  https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter
- WebXR depth API standard:
  https://www.w3.org/TR/webxr-depth-sensing-1/
