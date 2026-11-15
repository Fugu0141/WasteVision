import { appearanceDistance } from "./appearance.js";
import { intersectionOverUnion } from "./temporal.js";


function safeMetadata(value, depth = 0) {
  if (depth > 3) throw new TypeError("Analyzer metadata is too deeply nested.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 500 || /^data:|^blob:/i.test(value)) {
      throw new TypeError("Raw image data or oversized metadata is not allowed.");
    }
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 16) throw new TypeError("Metadata array too large.");
    return value.map(item => safeMetadata(item,depth+1));
  }
  if (typeof value === "object" && value) {
    if (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) {
      throw new TypeError("Metadata must be plain JSON-like data.");
    }
    const keys=Object.keys(value);
    if (keys.length > 20) throw new TypeError("Too many metadata properties.");
    const clean=Object.create(null);
    for (const key of keys) {
      if (key.length>60 || ["__proto__","constructor","prototype"].includes(key)) {
        throw new TypeError("Unsafe metadata property.");
      }
      clean[key]=safeMetadata(value[key],depth+1);
    }
    return clean;
  }
  throw new TypeError("Metadata must contain only JSON-safe values.");
}

const savedVersion = 1;
const publicRecord = (record) => ({
  id: record.id,
  localLabel: record.localLabel,
  metadata: record.metadata,
  status: record.status,
  seenCount: record.seenCount,
  reidentified: record.reidentified,
  boundingBox: record.boundingBox ? {...record.boundingBox} : null,
  lastSeen: record.lastSeen
});
const validDescriptor = d =>
  d?.version === 1 && Array.isArray(d.histogram) &&
  d.histogram.length === 12 && typeof d.hash === "string" &&
  d.hash.length === 64 && d.aspect > 0;

export function createObjectRegistry({
  storage = null,
  storageKey = "wastevision:objects:v1",
  now = () => Date.now(),
  ttlMs = 24 * 60 * 60 * 1000,
  maxObjects = 60,
  minObservations = 3,
  reidentifyThreshold = 0.12,
  minMargin = 0.045,
  idFactory = () => globalThis.crypto?.randomUUID?.() ??
    ("wv-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2))
} = {}) {
  if (!Number.isInteger(maxObjects) || maxObjects < 1 ||
      !Number.isInteger(minObservations) || minObservations < 1) {
    throw new RangeError("Invalid registry limits.");
  }
  let records = new Map();
  let frame = 0;

  const persist = () => {
    if (!storage) return;
    try {
      const entries = [...records.values()]
        .filter(r => r.metadata && validDescriptor(r.descriptor))
        .sort((a,b)=>b.lastSeen-a.lastSeen)
        .slice(0,maxObjects).map(r => ({
          id:r.id, localLabel:r.localLabel, descriptor:r.descriptor,
          metadata:r.metadata, lastSeen:r.lastSeen
        }));
      storage.setItem(storageKey,JSON.stringify({version:savedVersion,records:entries}));
    } catch { /* private mode or quota failure: memory-only */ }
  };

  const load = () => {
    if (!storage) return;
    try {
      const saved=JSON.parse(storage.getItem(storageKey) ?? "null");
      if (saved?.version!==savedVersion || !Array.isArray(saved.records)) return;
      for(const item of saved.records.slice(0,maxObjects)) {
        if (!item || typeof item.id!=="string" || item.id.length>120 ||
            !validDescriptor(item.descriptor) ||
            !Number.isFinite(item.lastSeen) ||
            item.lastSeen>now()+60_000 ||
            now()-item.lastSeen>ttlMs || !item.metadata ||
            typeof item.metadata!=="object" || Array.isArray(item.metadata)) continue;
        records.set(item.id,{
          ...item, status:"known", boundingBox:null,
          seenCount:0,seenFrame:-1,reidentified:false
        });
      }
    } catch { /* ignore corrupt/blocked local storage */ }
  };
  load();
  const prune = () => {
    for(const [id,r] of records) {
      if(now()-r.lastSeen>ttlMs && r.seenFrame!==frame)records.delete(id);
    }
    if(records.size>maxObjects) {
      const ordered=[...records.values()].sort((a,b)=>a.lastSeen-b.lastSeen);
      for(const r of ordered.slice(0,records.size-maxObjects))records.delete(r.id);
    }
  };
  const snapshots=()=>[...records.values()].map(publicRecord);

  function observe(observations) {
    frame++;
    const visible = [];
    const used = new Set();
    for(const item of observations) {
      const box=item.boundingBox;
      if (!box || !validDescriptor(item.descriptor)) continue;
      let best = null, bestIoU=0.24;
      // Continuous tracking takes priority and never swaps one track twice.
      for(const r of records.values()) {
        if(used.has(r.id) || r.seenFrame<frame-3 || !r.boundingBox)continue;
        const iou=intersectionOverUnion(r.boundingBox,box);
        if(iou>bestIoU && appearanceDistance(r.descriptor,item.descriptor)<0.28) {
          bestIoU=iou;best=r;
        }
      }
      let reacquired=false;
      if(!best) {
        // Conservative appearance-only matching when the item leaves & returns.
        const ranked=[...records.values()]
          .filter(r=>(r.metadata || r.status==="pending" || r.status==="captured") && !used.has(r.id) &&
            (r.seenFrame<0 || r.seenFrame<frame-3) &&
            (!r.localLabel || !item.object || r.localLabel===item.object))
          .map(r=>({r,d:appearanceDistance(r.descriptor,item.descriptor)}))
          .sort((a,b)=>a.d-b.d);
        const first=ranked[0];
        // Ambiguity margin blocks two near-identical candidates from exchanging IDs.
        if(first && first.d<=reidentifyThreshold &&
           (!ranked[1] || ranked[1].d-first.d>=minMargin)) {
          best=first.r;reacquired=true;
        }
      }
      if(!best) {
        best={
          id:idFactory(),localLabel:item.object??null,metadata:null,
          descriptor:item.descriptor, status:"observing",
          seenCount:0,seenFrame:-1, lastSeen:now(),
          reidentified:false,boundingBox:null
        };
        records.set(best.id,best);
      }
      best.reidentified=reacquired;
      best.seenCount=(best.seenFrame===frame-1)?best.seenCount+1:1;
      best.seenFrame=frame;
      best.lastSeen=now();
      best.boundingBox={...box};
      if(!best.localLabel && item.object)best.localLabel=item.object;
      if(!best.metadata && best.status!=="pending" && best.status!=="captured") {
        best.status="observing";
      }
      used.add(best.id);
      visible.push(publicRecord(best));
    }
    prune();
    return visible;
  }
  function setStatus(id,status) {
    const r=records.get(id);
    if(!r)return null;
    r.status=status;
    persist();
    return publicRecord(r);
  }
  function attach(id,metadata) {
    const r=records.get(id);
    if(!r)return null;
    if(!metadata || typeof metadata!=="object" || Array.isArray(metadata)) {
      throw new TypeError("Analyzer must return metadata object.");
    }
    // Keep metadata separate from a model's uncalibrated score.
    r.metadata=safeMetadata(metadata);
    r.status="known";
    r.lastSeen=now();
    persist();
    return publicRecord(r);
  }
  function suspend() {
    // Camera stop must not retain screen positions as identity anchors.
    // Keep the appearance descriptors and already attached metadata.
    for(const r of records.values()) {
      r.boundingBox=null;
      r.seenCount=0;
      r.seenFrame=-1;
      r.reidentified=false;
    }
  }
  function clear() {
    records.clear();frame=0;
    if(storage)try{storage.removeItem(storageKey)}catch{}
  }
  function forget(id) {
    const deleted=records.delete(id);
    persist();
    return deleted;
  }
  return {
    observe,attach,setStatus,suspend,clear,forget,
    get(id){const r=records.get(id);return r?publicRecord(r):null;},
    list:snapshots,
    get minObservations(){return minObservations;}
  };
}
