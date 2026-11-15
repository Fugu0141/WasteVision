import test from "node:test";
import assert from "node:assert/strict";
import { describePixels, appearanceDistance, clampBox, captureObjectCrop } from "../src/appearance.js";

const pixels=(r,g,b)=>Uint8ClampedArray.from(Array.from({length:9*8},()=>[r,g,b,255]).flat());
test("identical sampled colors produce comparable fingerprints",()=>{
  const red=describePixels(pixels(255,0,0)), red2=describePixels(pixels(255,0,0));
  const blue=describePixels(pixels(0,0,255));
  assert.equal(red.hash.length,64);
  assert.equal(appearanceDistance(red,red2),0);
  assert.ok(appearanceDistance(red,blue)>0.13);
  assert.equal(appearanceDistance(red,{}),Infinity);
});
test("box crop stays within image bounds",()=>{
  assert.deepEqual(clampBox({x:-8,y:2,width:30,height:25},20,20),{
    x:0,y:2,width:20,height:18
  });
  assert.equal(clampBox({x:0,y:0,width:0,height:12},20,20),null);
});
test("crop is a jpeg blob of only the object region",async()=>{
  let coords;
  const canvas={
    getContext:()=>({drawImage(...args){coords=args;}}),
    toBlob(cb){cb(new Blob(["jpg"],{type:"image/jpeg"}));}
  };
  const video={videoWidth:500,videoHeight:400,readyState:3};
  const crop=await captureObjectCrop(video,{
    x:30,y:40,width:100,height:90
  },{createCanvas:()=>canvas});
  assert.equal(coords[0],video);
  assert.ok(coords[1]>=0&&coords[2]>=0);
  assert.ok(coords[3]<500 && coords[4]<400);
  assert.equal(crop.blob.type,"image/jpeg");
  assert.equal(crop.width,canvas.width);
});
