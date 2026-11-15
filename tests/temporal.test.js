import test from "node:test";
import assert from "node:assert/strict";
import {createTemporalStabilizer,selectPrimaryObject} from "../src/temporal.js";
import {getObjectDisplayName} from "../src/labels.js";
const d=(name,x=10,score=0.8)=>({
  object:name,objectConfidence:score,boundingBox:{x,y:10,width:50,height:60}
});
test("requires three consecutive observations before stable text",()=>{
 const t=createTemporalStabilizer();
 assert.equal(t.update([d("bottle")]).length,0);
 assert.equal(t.update([d("bottle",12)]).length,0);
 const result=t.update([d("bottle",14)]);
 assert.equal(result[0].object,"bottle");
 assert.deepEqual(result[0].stability,{observations:3,window:3});
 assert.equal(result[0].material,"unknown");
});
test("alternating labels need a vote and never invent confidence",()=>{
 const t=createTemporalStabilizer();
 for(const label of ["cup","bottle","cup","bottle"])assert.equal(t.update([d(label)]).length,0);
 assert.equal(t.update([d("bottle")])[0].object,"bottle");
 t.update([d("bottle")]);
 const result=t.update([d("cup",10,0.99)]);
 assert.equal(result[0].object,"bottle");
 assert.equal(result[0].objectConfidence,null);
});
test("separate object locations are tracked separately",()=>{
 const t=createTemporalStabilizer();
 for(let i=0;i<3;i++)t.update([d("bottle",0),d("bottle",250)]);
 assert.equal(t.update([d("bottle",0),d("bottle",250)]).length,2);
});
test("lost detection and reset do not return stale labels",()=>{
 const t=createTemporalStabilizer();
 for(let i=0;i<3;i++)t.update([d("bottle")]);
 assert.deepEqual(t.update([]),[]);
 t.reset();
 assert.deepEqual(t.update([d("bottle")]),[]);
});
test("center bias and Japanese display labels",()=>{
 const far=d("cup",0,0.8);far.boundingBox={x:0,y:0,width:30,height:30};
 const near=d("bottle",240,0.79);near.boundingBox={x:240,y:160,width:160,height:160};
 assert.equal(selectPrimaryObject([far,near],640,480).object,"bottle");
 assert.equal(selectPrimaryObject([],640,480),null);
 assert.equal(getObjectDisplayName("bottle"),"ボトル");
 assert.equal(getObjectDisplayName("bottle","en"),"bottle");
});
