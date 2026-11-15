# WasteVision v0.4 — AR Tracking and Asynchronous Object Metadata

Status: implemented prototype. Automated tests and deployment verify code
integrity; no measured physical object re-ID accuracy or phone benchmark yet.

## 1. Core idea

Existing MediaPipe object detector supplies bounding boxes at a few FPS.
An optional lightweight pipeline samples a small cropped appearance
descriptor from each detection, assigns a local ID, and colors the camera
overlay by status. After three consecutive observations it crops one JPEG
of just the object bounding-box region. This occurs **automatically** with
no manual photo button.

A host application may provide an asynchronous callback that accepts the
crop and returns JSON metadata. The core never sends a network request.
The camera loop does not await the response; pending results are attached
to the original ID when available, even if the object moves out of view.

## 2. State machine

~~~text
new detection
    |
    v
observing (yellow, seenCount 1 .. 2)
    |
    | 3 consecutive frames
    v
crop JPEG locally -> pending (cyan)
    |
    +---- no analyzer --------> captured (purple)
    |
    +---- analyzer error -----> error (red)
    |
    +---- unknown response ---> unresolved (pink)
    |
    +---- JSON metadata -----> known (green)
                                     |
                        device-local registry
                                     |
                later appearance match (first new detection)
                                     |
                    restore ID + metadata (green)
~~~

Known IDs survive camera stop/start and optionally page reload
(localStorage). Clearing memory cancels unfinished work and deletes
the stored descriptors and JSON.

## 3. Modules

- Core unchanged: src/scanner.js, src/adapters/mediapipe.js
- src/appearance.js: 9x8 RGB sampling, channel histograms, luminance hash,
  aspect ratio and JPEG cropping. This is deliberately a cheap descriptor,
  not a learned image embedding.
- src/identity.js: bounded registry, same-frame IoU association, conservative
  appearance-only re-ID, persistent metadata store and ID lifecycle.
- src/extensions/auto-recognition.js: optional async callback adapter,
  max 2 concurrent analyses, AbortSignal, onCrop, onUpdate, attach, pause,
  clear and dispose.
- src/overlay.js: drawTrackedOverlay (yellow/cyan/green/etc.)
- demo/main.js: real-time demonstration. **Demo analyzer is a delayed copy
  of the local detector label**, NOT a cloud call or an independent AI.

## 4. API contract

~~~js
const registry = createObjectRegistry({
  storage: localStorage,  // null => RAM only
  ttlMs: 86400000,        // 1 day
  maxObjects: 60,
  minObservations: 3
});

const engine = createAutoRecognition({
  video,
  registry,
  async analyze({id,crop,localLabel,signal}) {
    // crop.blob: the automatically cut-out JPEG for ID 'id'.
    // Return JSON metadata to attach (no images/base64 strings).
    return {label:"bottle",material:"unknown",source:"your_model"};
  },
  onCrop({id,crop}) { /* optional, e.g. draw local preview */ },
  onUpdate({visible,records}) {
    // visible = current bounding boxes and IDs
    // records = retained IDs/metadata, including off-screen ones
    drawTrackedOverlay(canvas,video,visible);
  },
  onError(error,id) { console.warn(error,id); }
});

function scannerResult({detections}) {
  engine.ingest(detections);
}
engine.pause();      // camera stopped, keep ID memory + in-flight reply
engine.attach(id,{label:"confirmed"});  // attach response externally
engine.clear();      // delete records, abort outstanding requests
engine.dispose();    // release outstanding work
~~~

Tracked record example:

~~~json
{
  "id": "some-local-uuid",
  "status": "known",
  "localLabel": "bottle",
  "metadata": {
    "label": "bottle",
    "material": "unknown",
    "source": "demo_local_detector_label"
  },
  "seenCount": 4,
  "reidentified": false,
  "boundingBox": {
    "x": 52, "y": 24, "width": 140, "height": 200
  }
}
~~~

Numbers are illustrative and not real-world measurements.

## 5. Matching and limitations

- Within a continuous sequence, proximity/overlap (intersection-over-union)
  and appearance associate frames to an ID.
- After an object disappears, the first renewed detection is compared with
  saved appearance descriptors; a conservative threshold and margin reject
  some ambiguities. **This does not prove physical object identity.**
- The descriptor is only histogram + 64 comparison bits + aspect ratio.
  Two identical or similarly colored objects can be falsely joined. Pose,
  lighting, compression, occlusion and background can break re-identification.
- The current detector is COCO-trained. If it never detects an unknown item,
  that item cannot enter this automatic pipeline. Optional point-guided
  segmentation exists but does not yet feed continuous auto-tracking.
- Cropped bounding-box JPEGs can contain surrounding background.
- The live overlay is 2D camera AR-style boxes, not a 3D anchor.

## 6. Privacy and safety

- **No image upload happens by default.** An app-supplied analyze() function
  must consciously implement a provider. If external processing is needed,
  verify permission, institutional/API policy, secrets, and user consent.
- Persistent data is capped to 60 records, expires after 24 hours and
  contains a small appearance descriptor and JSON metadata only.
- Do not put raw image data or unbounded sensitive information in metadata.
  The SDK rejects binary data, data URLs and oversized JSON properties.
- A cropped Blob may temporarily remain in RAM, and the demo shows only the
  most recent crop preview until changed or the page closes.
- Clear-memory deletes localStorage entries under the WasteVision key.
- A real-world benchmark with visually identical objects is required
  before claiming robust recognition across encounters.

## 7. Next development target

The big remaining limitation is detector recall. To register truly unknown
objects, connect an **optional class-agnostic object proposal/segmentation**
pipeline that can produce candidate regions without COCO classes. For robust
re-ID, evaluate a lightweight *visual embedding model* and human correction
instead of relying only on histogram/hash descriptors.
