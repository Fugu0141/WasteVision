/**
 * OPTIONAL remote-image extension. It is deliberately excluded from the
 * root SDK entry point and from the default browser demo.
 */
export {
  chooseSnapshotRegion, captureWasteSnapshot,
  normalizeRemoteRecognition, recognizeWasteSnapshot
} from "../hybrid.js";
export { createHttpRecognitionProvider } from "../provider-http.js";
