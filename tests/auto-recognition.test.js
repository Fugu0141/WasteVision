import test from "node:test";
import assert from "node:assert/strict";
import { createAutoRecognition } from "../src/extensions/auto-recognition.js";
import { describePixels } from "../src/appearance.js";
import { createObjectRegistry } from "../src/identity.js";
const pixels=Uint8ClampedArray.from(Array.from({length:9*8},()=>[230,15,15,255]).flat());
const desc=describePixels(pixels);
const detect=[{object:"bottle",boundingBox:{x:1,y:2,width:80,height:90}}];
const tick=()=>new Promise(r=>setImmediate(r));

test("auto capture once, wait for async analyzer, attach to correct object ID",async()=>{
 let done, crops=0, calls=0, seq=0;
 const analyze=()=>{calls++;return new Promise(resolve=>{done=resolve;});};
 const controller=createAutoRecognition({
  video:{},
  registry:createObjectRegistry({idFactory:()=>String(++seq)}),
  sample:()=>desc,
  capture:async()=>({blob:new Blob(["jpg"],{type:"image/jpeg"})}),
  onCrop:()=>{crops++;},
  analyze
 });
 for(let i=0;i<3;i++)controller.ingest(detect);
 await tick();
 const first=controller.visible[0];
 assert.equal(first.status,"pending");
 assert.equal(crops,1);
 assert.equal(calls,1);
 assert.equal(controller.pendingCount,1);
 const id=first.id;
 // Removed from camera while AI is working. Completion still attaches to ID.
 for(let i=0;i<5;i++)controller.ingest([]);
 done({label:"bottle",source:"fake-async"});
 await tick();
 assert.equal(controller.registry.get(id).status,"known");
 const back=controller.ingest([{...detect[0],boundingBox:{x:350,y:20,width:80,height:90}}]);
 assert.equal(back[0].id,id);
 assert.equal(back[0].metadata.label,"bottle");
 assert.equal(calls,1);
 controller.dispose();
});
test("pipeline runs without analyzer, never sends network data",async()=>{
 let captured=0;
 const pipeline=createAutoRecognition({
  video:{},sample:()=>desc,capture:async()=>({blob:new Blob(["jpg"])}),
  onCrop:()=>{captured++;}
 });
 for(let i=0;i<3;i++)pipeline.ingest(detect);
 await tick();
 assert.equal(captured,1);
 assert.equal(pipeline.visible[0].status,"captured");
 pipeline.dispose();
});
test("dispose aborts pending analyze and ignores late result",async()=>{
 let resolve;
 const pipeline=createAutoRecognition({
  video:{},sample:()=>desc,capture:async()=>({blob:new Blob(["jpg"])}),
  analyze:()=>new Promise(r=>{resolve=r;})
 });
 for(let i=0;i<3;i++)pipeline.ingest(detect);
 await tick();
 const id=pipeline.visible[0].id;
 pipeline.dispose();
 resolve({label:"stale"});
 await tick();
 assert.equal(pipeline.registry.get(id).metadata,null);
});
