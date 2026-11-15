import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDetection, resolveMaterialHint } from "../src/materials.js";

test("object confidence must never imply material confidence", () => {
  const detection = normalizeDetection({
    object: "bottle",
    score: 0.98,
    boundingBox: { originX: 3, originY: 4, width: 50, height: 80 }
  });
  assert.equal(detection.objectConfidence, 0.98);
  assert.equal(detection.material, "unknown");
  assert.equal(detection.materialConfidence, null);
  assert.equal(detection.needsConfirmation, true);
  assert.deepEqual(detection.materialCandidates, ["plastic", "glass", "metal"]);
  assert.deepEqual(detection.boundingBox, { x: 3, y: 4, width: 50, height: 80 });
});

test("an unseen label remains unknown", () => {
  assert.deepEqual(resolveMaterialHint("mystery object").materialCandidates, []);
});

test("invalid scores and coordinates are normalized safely", () => {
  const detection = normalizeDetection({
    label: "cup",
    score: 9,
    boundingBox: { x: -5, y: NaN, width: 15, height: -10 }
  });
  assert.equal(detection.objectConfidence, 1);
  assert.deepEqual(detection.boundingBox, { x: 0, y: 0, width: 15, height: 0 });
});

test("missing score is null, not an invented zero-confidence score", () => {
  assert.equal(normalizeDetection({ object: "cup" }).objectConfidence, null);
});
