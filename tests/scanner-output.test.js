import test from "node:test";
import assert from "node:assert/strict";
import { createWasteScanner } from "../src/scanner.js";

test("scanner emits a stable primary text and raw detection list", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis,"navigator");
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  Object.defineProperty(globalThis,"navigator",{
    configurable:true,
    value:{mediaDevices:{getUserMedia: async()=>({
      getTracks:()=>[{stop(){}}]
    })}}
  });
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  const video={
    videoWidth:640,videoHeight:480,readyState:2,currentTime:0,srcObject:null,
    async play(){}
  };
  const callbacks=[];
  const scanner=createWasteScanner({
    video,
    detector:{detect:()=>[{
      object:"bottle",score:0.83,
      boundingBox:{originX:200,originY:150,width:130,height:180}
    }],close(){}},
    onResult: (result)=>callbacks.push(result.text)
  });
  try {
    await scanner.start();
    assert.equal((await scanner.scan()).text,null);
    assert.equal((await scanner.scan()).text,null);
    const third=await scanner.scan();
    assert.equal(third.text,"bottle");
    assert.deepEqual(third.recognizedObjects,["bottle"]);
    assert.equal(third.detections[0].material,"unknown");
    assert.equal(third.stableDetections[0].stability.observations,3);
    assert.deepEqual(callbacks,[null,null,"bottle"]);
    scanner.stop();
    await scanner.start();
    assert.equal((await scanner.scan()).text,null);
  } finally {
    scanner.dispose();
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);
    else delete globalThis.navigator;
    if(originalRaf)globalThis.requestAnimationFrame=originalRaf;
    else delete globalThis.requestAnimationFrame;
    if(originalCaf)globalThis.cancelAnimationFrame=originalCaf;
    else delete globalThis.cancelAnimationFrame;
  }
});
