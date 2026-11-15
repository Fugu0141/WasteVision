import test from "node:test";
import assert from "node:assert/strict";
import { createHttpRecognitionProvider } from "../src/provider-http.js";

test("only HTTPS or loopback endpoints are allowed", () => {
 assert.throws(()=>createHttpRecognitionProvider({url:"http://example.com/vision"}),/HTTPS/);
 assert.throws(()=>createHttpRecognitionProvider({url:"https://user:pw@example.com/vision"}),/Credentials/);
 assert.throws(()=>createHttpRecognitionProvider({url:"https://example.com/vision?token=x"}),/Credentials/);
 assert.equal(typeof createHttpRecognitionProvider({url:"https://example.com/api/vision"}),"function");
});
test("a snapshot is sent only to explicitly configured proxy, with no credentials",async()=>{
 const old=globalThis.fetch;
 let observed;
 globalThis.fetch=async(url,options)=>{
  observed={url,options};
  return {ok:true,json:async()=>({status:"recognized",label:"beverage_can"})};
 };
 try{
  const classify=createHttpRecognitionProvider({url:"https://example.com/vision"});
  const result=await classify({
   image:new Blob(["abc"],{type:"image/jpeg"}),localHint:"bottle"
  });
  assert.equal(result.label,"beverage_can");
  assert.equal(observed.url,"https://example.com/vision");
  assert.equal(observed.options.method,"POST");
  assert.equal(observed.options.credentials,"omit");
  assert.equal(observed.options.body.get("localHint"),"bottle");
  assert.equal(observed.options.body.get("image").type,"image/jpeg");
 }finally{
  if(old===undefined)delete globalThis.fetch;else globalThis.fetch=old;
 }
});
