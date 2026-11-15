import test from "node:test";
import assert from "node:assert/strict";
import {
 chooseSnapshotRegion, captureWasteSnapshot,
 recognizeWasteSnapshot, normalizeRemoteRecognition
} from "../src/hybrid.js";

test("center fallback exists even when object detector found nothing", () => {
 const crop=chooseSnapshotRegion(640,480);
 assert.equal(crop.source,"center");
 assert.ok(crop.x>0 && crop.y>0);
 assert.ok(crop.width<=480 && crop.height<=480);
});
test("detector box is padded but clipped to frame bounds", () => {
 const crop=chooseSnapshotRegion(320,240,{x:0,y:10,width:100,height:80});
 assert.equal(crop.x,0);
 assert.equal(crop.source,"detected_object");
 assert.ok(crop.width>100);
});
test("remote inference is never called without snapshot-specific consent",async()=>{
 let calls=0;
 const snapshot={blob:new Blob(["image"],{type:"image/jpeg"}),contentType:"image/jpeg"};
 const provider=async()=>{calls++;return {label:"beverage_can"};};
 const denied=await recognizeWasteSnapshot({snapshot,provider,consent:false});
 assert.equal(denied.status,"consent_required");
 assert.equal(calls,0);
 const approved=await recognizeWasteSnapshot({snapshot,provider,consent:true});
 assert.equal(calls,1);
 assert.equal(approved.text,"beverage_can");
 assert.equal(approved.confidence,null);
});
test("remote provider unavailable or ambiguous response is not hallucinated",async()=>{
 const snapshot={blob:new Blob(["image"],{type:"image/jpeg"}),contentType:"image/jpeg"};
 const absent=await recognizeWasteSnapshot({snapshot,consent:true});
 assert.equal(absent.status,"provider_unavailable");
 assert.equal(absent.text,null);
 assert.equal(normalizeRemoteRecognition({label:"Here is a\nlong answer"}).status,"unknown");
 assert.equal(normalizeRemoteRecognition({status:"unknown"}).text,null);
});
test("capture output is a local JPEG crop, not a remote network operation",async()=>{
 const originalDocument=globalThis.document;
 let received=null;
 globalThis.document={
  createElement:()=>({
   width:0,height:0,
   getContext:()=>({drawImage(...args){received=args;}}),
   toBlob(callback){callback(new Blob(["jpeg"],{type:"image/jpeg"}));}
  })
 };
 try{
  const snapshot=await captureWasteSnapshot({
   videoWidth:1000,videoHeight:700,readyState:3
  });
  assert.equal(snapshot.contentType,"image/jpeg");
  assert.equal(snapshot.crop.source,"center");
  assert.equal(snapshot.blob.type,"image/jpeg");
  assert.ok(snapshot.width<=768 && snapshot.height<=768);
  assert.equal(received.length,9);
 }finally{
  if(originalDocument===undefined)delete globalThis.document;
  else globalThis.document=originalDocument;
 }
});
