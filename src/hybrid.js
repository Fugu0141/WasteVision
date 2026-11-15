/**
 * Hybrid recognition is OPT-IN.
 * The SDK can crop a snapshot locally and delegate its recognition to an
 * application-supplied provider. It never embeds or sends an API token.
 */

export function chooseSnapshotRegion(width, height, box = null, paddingRatio = 0.14) {
  if (!(width > 0) || !(height > 0)) throw new RangeError("Video dimensions are unavailable.");
  if (!box || !(box.width > 0 && box.height > 0)) {
    const side = Math.min(width, height) * 0.78;
    return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side, source: "center" };
  }
  const pad = Math.max(box.width, box.height) * paddingRatio;
  const x1 = Math.max(0, box.x - pad);
  const y1 = Math.max(0, box.y - pad);
  const x2 = Math.min(width, box.x + box.width + pad);
  const y2 = Math.min(height, box.y + box.height + pad);
  if (!(x2 > x1 && y2 > y1)) throw new RangeError("Bounding box is outside the video.");
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1, source: "detected_object" };
}

export async function captureWasteSnapshot(video, {
  boundingBox = null,
  maxDimension = 768,
  jpegQuality = 0.78
} = {}) {
  const width = video?.videoWidth;
  const height = video?.videoHeight;
  if (!(width > 0 && height > 0) || video.readyState < 2) {
    throw new Error("Camera video is not ready.");
  }
  const crop = chooseSnapshotRegion(width, height, boundingBox);
  if (!(maxDimension >= 128 && maxDimension <= 2048)) {
    throw new RangeError("maxDimension must be between 128 and 2048.");
  }
  const scale = Math.min(1, maxDimension / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height,
    0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) :
      reject(new Error("Snapshot encoding failed.")), "image/jpeg", jpegQuality);
  });
  // A canvas-rendered JPEG does not copy camera EXIF/GPS metadata.
  return {
    blob,
    crop,
    width: canvas.width,
    height: canvas.height,
    contentType: "image/jpeg"
  };
}

const empty = (status, reason) => ({
  status, text: null, source: "remote_ai", confidence: null,
  alternatives: [], reason
});

export function normalizeRemoteRecognition(value) {
  if (!value || typeof value !== "object") return empty("unknown", "invalid_response");
  if (value.status === "unknown") return empty("unknown", "provider_uncertain");
  if (value.status != null && value.status !== "recognized") {
    return empty("unknown", "invalid_status");
  }
  const label = typeof value.label === "string" ? value.label.trim() :
    typeof value.object === "string" ? value.object.trim() : "";
  // Only allow a concise plain-text object name, never model instructions.
  if (!label || label.length > 60 || !/^[\p{L}\p{N}_ -]+$/u.test(label)) {
    return empty("unknown", "invalid_label");
  }
  return {
    status: "recognized",
    text: label,
    source: "remote_ai",
    // Model-written percentages are not calibrated probabilities.
    confidence: null,
    alternatives: [],
    reason: null
  };
}

/**
 * An app-hosted provider is required; e.g. a school-approved backend proxy.
 * Upload only after user approves this specific cropped snapshot.
 * No automatic uploads and no direct browser access to private credentials.
 */
export async function recognizeWasteSnapshot({
  snapshot,
  provider,
  consent = false,
  localHint = null,
  signal
} = {}) {
  if (!consent) return empty("consent_required", "explicit_approval_required");
  if (!snapshot?.blob || snapshot.contentType !== "image/jpeg") {
    throw new TypeError("A JPEG snapshot from captureWasteSnapshot is required.");
  }
  if (typeof provider !== "function") return empty("provider_unavailable", "provider_not_configured");
  try {
    const response = await provider({
      image: snapshot.blob,
      contentType: snapshot.contentType,
      localHint: typeof localHint === "string" ? localHint.slice(0, 80) : null,
      signal
    });
    return normalizeRemoteRecognition(response);
  } catch (error) {
    if (signal?.aborted) return empty("cancelled", "aborted");
    return empty("error", error?.name === "TimeoutError" ? "timeout" : "provider_error");
  }
}
