import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMask, analyzeRectangle, pointerToImagePoint } from "../src/geometry.js";

test("unknown class mask yields pixel geometry but never material or real dimensions", () => {
  const width = 8, height = 6, data = new Float32Array(width * height);
  for (let y = 1; y <= 4; y++) for (let x = 2; x <= 3; x++) data[y * width + x] = 0.9;
  const result = analyzeMask({ data, width, height });
  assert.equal(result.status, "segmented");
  assert.equal(result.objectName, null);
  assert.equal(result.region.maskAvailable, true);
  assert.deepEqual(result.region.bboxPx, { x: 2, y: 1, width: 2, height: 4 });
  assert.equal(result.geometry.areaPx, 8);
  assert.equal(result.geometry.areaFraction, 8 / 48);
  assert.equal(result.geometry.perimeterPx, 12);
  assert.deepEqual(result.geometry.centroidPx, { x: 2.5, y: 2.5 });
  assert.equal(result.geometry.shape, "oblong");
  assert.equal(result.geometry.dimensionsMm, null);
  assert.equal(result.material.value, "unknown");
  assert.equal(result.material.verified, false);
});
test("empty mask returns unknown with no object bounding box", () => {
  const r = analyzeMask({ data: new Float32Array(12), width: 4, height: 3 });
  assert.equal(r.status, "unknown");
  assert.equal(r.region.bboxPx, null);
  assert.equal(r.geometry.areaPx, 0);
  assert.equal(r.geometry.widthPx, null);
});
test("invalid masks are rejected", () => {
  assert.throws(() => analyzeMask({ data: new Float32Array(2), width: 5, height: 2 }), /mask/);
  assert.throws(() => analyzeMask({ data: new Float32Array(4), width: 2, height: 2, threshold: 3 }), /threshold/);
});
test("manual rectangle is ROI, not a silhouette mask", () => {
  const r = analyzeRectangle({ x: 15, y: 8, width: -20, height: 30 }, 100, 60);
  assert.deepEqual(r.region.bboxPx, { x: 0, y: 8, width: 15, height: 30 });
  assert.equal(r.region.maskAvailable, false);
  assert.equal(r.geometry.areaPx, null);
  assert.equal(r.geometry.areaFraction, null);
  assert.equal(r.geometry.regionFraction, 0.075);
  assert.equal(r.geometry.shape, "unknown");
  assert.equal(r.geometry.dimensionsMm, null);
});
test("pointer position maps into intrinsic canvas coordinates on mobile", () => {
  const rect = { left: 25, top: 100, width: 200, height: 100 };
  const p = pointerToImagePoint(125, 150, rect, 800, 400);
  assert.deepEqual(p, { x: 400, y: 200, normalizedX: 0.5, normalizedY: 0.5 });
  assert.equal(pointerToImagePoint(0, 0, rect, 800, 400).normalizedY, 0);
  assert.throws(() => pointerToImagePoint(1, 1, { width: 0, height: 1 }, 800, 400));
});
