import test from "node:test";
import assert from "node:assert/strict";
import { createObjectRegistry } from "../src/identity.js";
import { describePixels } from "../src/appearance.js";
const pix=(r,g,b)=>Uint8ClampedArray.from(Array.from({length:9*8},()=>[r,g,b,255]).flat());
const red=describePixels(pix(250,5,5));
const blue=describePixels(pix(5,5,250));
const make=(descriptor,object="bottle",x=30)=>({object,descriptor,boundingBox:{x,y:10,width:70,height:100}});
test("track, attach metadata, lose and immediately reidentify from appearance",()=>{
  let seq=0;let time=1000;
  const registry=createObjectRegistry({
    idFactory:()=>String(++seq),now:()=>time
  });
  let result;
  for(let i=0;i<3;i++)result=registry.observe([make(red)]);
  assert.equal(result[0].seenCount,3);
  const id=result[0].id;
  registry.attach(id,{label:"PET bottle",source:"test"});
  for(let i=0;i<5;i++)registry.observe([]);
  result=registry.observe([make(red,"bottle",200)]);
  assert.equal(result[0].id,id);
  assert.equal(result[0].status,"known");
  assert.equal(result[0].reidentified,true);
  assert.equal(result[0].metadata.label,"PET bottle");
  assert.equal(registry.list().length,1);
  registry.observe([]);
  const different=registry.observe([make(blue,"bottle",200)]);
  assert.notEqual(different[0].id,id);
});
test("does not reuse ID for one of two visually ambiguous known objects",()=>{
  let seq=0;
  const registry=createObjectRegistry({idFactory:()=>String(++seq)});
  const a=registry.observe([make(red,"cup",20),make(red,"cup",250)]);
  // First frame creates two separate tracks.
  assert.equal(new Set(a.map(x=>x.id)).size,2);
  for(const r of a)registry.attach(r.id,{label:"cup"});
  for(let i=0;i<5;i++)registry.observe([]);
  const fresh=registry.observe([make(red,"cup",400)]);
  assert.notEqual(fresh[0].id,a[0].id);
  assert.notEqual(fresh[0].id,a[1].id);
});
test("persist metadata+features across new registry, but never photos",()=>{
 const map=new Map();
 const storage={
  getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k)
 };
 let ids=0;
 const config={storage,idFactory:()=>String(++ids)};
 const one=createObjectRegistry(config);
 const a=one.observe([make(red)]);
 one.attach(a[0].id,{label:"known bottle"});
 const serialized=map.get("wastevision:objects:v1");
 assert.ok(serialized.includes("histogram"));
 assert.ok(!serialized.includes("data:image"));
 const two=createObjectRegistry(config);
 const b=two.observe([make(red,"bottle",300)]);
 assert.equal(b[0].id,a[0].id);
 assert.equal(b[0].metadata.label,"known bottle");
 two.clear();
 assert.equal(storage.getItem("wastevision:objects:v1"),null);
});
test("unknown malformed saved descriptors are ignored",()=>{
 const storage={getItem:()=>'{wrong json',setItem:()=>{}};
 const r=createObjectRegistry({storage});
 assert.deepEqual(r.list(),[]);
});

test("camera pause invalidates spatial tracks but keeps recognized metadata",()=>{
 const registry=createObjectRegistry({idFactory:()=>String(Math.random())});
 const obj=registry.observe([make(red,"bottle",40)])[0];
 registry.attach(obj.id,{label:"cached"});
 registry.suspend();
 assert.equal(registry.get(obj.id).boundingBox,null);
 const b=registry.observe([make(red,"bottle",310)])[0];
 assert.equal(b.id,obj.id);
 assert.equal(b.metadata.label,"cached");
});
