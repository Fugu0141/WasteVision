/**
 * Class-agnostic image-plane measurements.
 * None of these values imply a real-world length or a physical material.
 */
export function analyzeMask({ data, width, height, threshold = 0.5, source = "user_tap" }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0 || !data || data.length !== width * height) {
    throw new TypeError("A width × height foreground mask is required.");
  }
  if (!(threshold >= 0 && threshold <= 1)) throw new RangeError("Invalid mask threshold");

  let minX = width, minY = height, maxX = -1, maxY = -1;
  let count = 0, sumX = 0, sumY = 0, perimeter = 0;
  const isOn = (x, y) => x >= 0 && y >= 0 && x < width && y < height &&
    data[y * width + x] >= threshold;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOn(x, y)) continue;
      count++;
      sumX += x; sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (!isOn(x - 1, y)) perimeter++;
      if (!isOn(x + 1, y)) perimeter++;
      if (!isOn(x, y - 1)) perimeter++;
      if (!isOn(x, y + 1)) perimeter++;
    }
  }

  const bboxPx = count ? {
    x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1
  } : null;
  const aspectRatio = bboxPx ? bboxPx.width / bboxPx.height : null;
  const elongation = bboxPx ? Math.max(aspectRatio, 1 / aspectRatio) : null;
  const shape = !bboxPx ? "unknown" : elongation >= 2.2
    ? "elongated" : elongation <= 1.35 ? "compact" : "oblong";

  return {
    status: count ? "segmented" : "unknown",
    objectName: null,
    region: { source, bboxPx, maskAvailable: true },
    geometry: {
      widthPx: bboxPx?.width ?? null,
      heightPx: bboxPx?.height ?? null,
      areaPx: count,
      areaFraction: count / (width * height),
      aspectRatio,
      centroidPx: count ? { x: sumX / count, y: sumY / count } : null,
      perimeterPx: count ? perimeter : null,
      shape,
      dimensionsMm: null,
      scaleSource: "none"
    },
    material: { value: "unknown", candidates: [], verified: false },
    marks: [],
    needsConfirmation: true
  };
}

/**
 * A manually selected rectangle only establishes a region of interest.
 * It is NOT a foreground segmentation mask.
 */
export function analyzeRectangle(rect, frameWidth, frameHeight) {
  if (!(frameWidth > 0 && frameHeight > 0) || !rect) {
    throw new TypeError("A frame and selection rectangle are required.");
  }
  const x1 = Math.max(0, Math.min(frameWidth, Math.min(rect.x, rect.x + rect.width)));
  const x2 = Math.max(0, Math.min(frameWidth, Math.max(rect.x, rect.x + rect.width)));
  const y1 = Math.max(0, Math.min(frameHeight, Math.min(rect.y, rect.y + rect.height)));
  const y2 = Math.max(0, Math.min(frameHeight, Math.max(rect.y, rect.y + rect.height)));
  if (x2 - x1 < 2 || y2 - y1 < 2) throw new RangeError("Selection is too small.");
  const bboxPx = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  return {
    status: "region_selected",
    objectName: null,
    region: { source: "manual_rectangle", bboxPx, maskAvailable: false },
    geometry: {
      widthPx: bboxPx.width,
      heightPx: bboxPx.height,
      areaPx: null,
      areaFraction: null,
      regionFraction: (bboxPx.width * bboxPx.height) / (frameWidth * frameHeight),
      aspectRatio: bboxPx.width / bboxPx.height,
      centroidPx: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
      perimeterPx: null,
      shape: "unknown",
      dimensionsMm: null,
      scaleSource: "none"
    },
    material: { value: "unknown", candidates: [], verified: false },
    marks: [],
    needsConfirmation: true
  };
}

/** Converts a displayed canvas pointer position into image-plane coordinates. */
export function pointerToImagePoint(clientX, clientY, clientRect, width, height) {
  if (!(clientRect?.width > 0 && clientRect?.height > 0 && width > 0 && height > 0)) {
    throw new RangeError("Image has no visible dimensions.");
  }
  const nx = Math.max(0, Math.min(1, (clientX - clientRect.left) / clientRect.width));
  const ny = Math.max(0, Math.min(1, (clientY - clientRect.top) / clientRect.height));
  return { x: nx * width, y: ny * height, normalizedX: nx, normalizedY: ny };
}
