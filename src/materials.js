/**
 * A label is not a material measurement.
 * Never convert object confidence into material confidence.
 */
const HINTS = Object.freeze({
  bottle: ["plastic", "glass", "metal"],
  cup: ["paper", "plastic", "glass", "ceramic", "metal"],
  "wine glass": ["glass", "plastic"],
  bowl: ["ceramic", "plastic", "glass", "metal"],
  fork: ["metal", "plastic", "wood"],
  knife: ["metal", "plastic", "ceramic"],
  spoon: ["metal", "plastic", "wood"],
  book: ["paper", "plastic"],
  banana: ["organic"],
  apple: ["organic"],
  orange: ["organic"]
});

export function resolveMaterialHint(objectName) {
  const label = String(objectName ?? "").trim().toLowerCase();
  return {
    material: "unknown",
    materialConfidence: null,
    materialCandidates: [...(HINTS[label] ?? [])],
    needsConfirmation: true
  };
}

export function normalizeDetection(raw) {
  const objectName = String(raw?.object ?? raw?.label ?? "unknown");
  const confidence = raw?.score == null ? NaN : Number(raw.score);
  const box = raw?.boundingBox ?? {};
  const n = (v) => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
  return {
    object: objectName,
    objectConfidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : null,
    ...resolveMaterialHint(objectName),
    boundingBox: {
      x: n(box.x ?? box.originX),
      y: n(box.y ?? box.originY),
      width: n(box.width),
      height: n(box.height)
    }
  };
}
