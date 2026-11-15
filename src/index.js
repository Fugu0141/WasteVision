export { createWasteScanner } from "./scanner.js";
export { createMediaPipeDetector } from "./adapters/mediapipe.js";
export { resolveMaterialHint, normalizeDetection } from "./materials.js";
export { createTemporalStabilizer, selectPrimaryObject } from "./temporal.js";
export { getObjectDisplayName } from "./labels.js";
export { chooseSnapshotRegion, captureWasteSnapshot, normalizeRemoteRecognition, recognizeWasteSnapshot } from "./hybrid.js";
