import { sampleAppearance, captureObjectCrop } from "../appearance.js";
import { createObjectRegistry } from "../identity.js";

/**
 * Opt-in pipeline: synchronous per-frame association + asynchronous, one-off
 * crop/analyze callback. The camera loop does not wait for any AI response.
 *
 * analyze({ id, crop, localLabel, signal }) is supplied by the host app.
 * WasteVision never makes a network request by itself.
 */
export function createAutoRecognition({
  video,
  registry = createObjectRegistry(),
  analyze = null,
  onCrop = () => {},
  onUpdate = () => {},
  onError = () => {},
  sample = sampleAppearance,
  capture = captureObjectCrop,
  minObservations = registry.minObservations,
  maxConcurrent = 2
} = {}) {
  if (!video || typeof sample !== "function" || typeof capture !== "function" ||
      (analyze != null && typeof analyze !== "function") ||
      [onCrop,onUpdate,onError].some(fn=>typeof fn!=="function")) {
    throw new TypeError("Invalid automatic recognition callbacks or video.");
  }
  if (!(minObservations >= 1) || !(maxConcurrent >= 1)) {
    throw new RangeError("Invalid recognition limits.");
  }
  let disposed = false;
  let visible = [];
  const inFlight = new Map();

  const publish = () => {
    if (disposed) return;
    // Refresh references without retaining video/crops or serializing Blob.
    visible = visible.map(r => registry.get(r.id)).filter(Boolean);
    onUpdate({ visible, records: registry.list() });
  };

  async function captureAndAnalyze(record) {
    const controller = new AbortController();
    inFlight.set(record.id, controller);
    registry.setStatus(record.id,"pending");
    publish();
    try {
      const crop = await capture(video, record.boundingBox);
      if (disposed || controller.signal.aborted) return;
      // The crop is transient; only caller-supplied metadata is saved.
      await onCrop({ id:record.id, crop, localLabel:record.localLabel });
      if (disposed || controller.signal.aborted) return;
      if (!analyze) {
        registry.setStatus(record.id,"captured");
        publish();
        return;
      }
      const metadata = await analyze({
        id:record.id, crop, localLabel:record.localLabel,
        signal:controller.signal
      });
      if (disposed || controller.signal.aborted) return;
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        registry.attach(record.id,metadata);
      } else {
        registry.setStatus(record.id,"unresolved");
      }
    } catch (error) {
      if (!disposed && !controller.signal.aborted) {
        registry.setStatus(record.id,"error");
        try { onError(error, record.id); } catch { /* no further side effects */ }
      }
    } finally {
      inFlight.delete(record.id);
      publish();
    }
  }

  function ingest(detections = []) {
    if (disposed) return [];
    // Same frame's pixel crops are sampled synchronously.
    const observations = [];
    for (const item of detections) {
      const descriptor = sample(video, item.boundingBox);
      if (!descriptor) continue;
      observations.push({ object:item.object, boundingBox:item.boundingBox, descriptor });
    }
    visible = registry.observe(observations);
    for (const record of visible) {
      if (inFlight.size >= maxConcurrent) break;
      if (record.status === "observing" && record.seenCount >= minObservations &&
          !inFlight.has(record.id)) {
        // Start without awaiting: this must never block camera inference.
        void captureAndAnalyze(record);
      }
    }
    publish();
    return visible;
  }

  function attach(id,metadata) {
    const result=registry.attach(id,metadata);
    publish();
    return result;
  }

  function pause() {
    // Camera stream may stop while an existing async request is still pending.
    // Do not cancel it or throw away its record; just remove the stale boxes.
    registry.suspend();
    visible=[];
    publish();
  }
  function clear() {
    // Cancel any unfinished analyses so stale data is not reattached.
    for(const c of inFlight.values())c.abort();
    inFlight.clear();
    registry.clear();
    visible=[];
    publish();
  }
  function dispose() {
    disposed=true;
    for(const c of inFlight.values())c.abort();
    inFlight.clear();
    visible=[];
  }
  return {
    ingest,attach,pause,clear,dispose,
    get visible(){return visible.map(r=>({...r}));},
    get registry(){return registry;},
    get pendingCount(){return inFlight.size;}
  };
}
