import {
  createMediaPipeDetector, createWasteScanner, getObjectDisplayName
} from "../src/index.js";
import { drawTrackedOverlay } from "../src/overlay.js";
import { createObjectRegistry } from "../src/identity.js";
import { createAutoRecognition } from "../src/extensions/auto-recognition.js";

const $ = id => document.getElementById(id);
const video = $("camera");
const overlay = $("overlay");
const startButton = $("start");
const stopButton = $("stop");
const modelMode = $("modelMode");
const status = $("status");
const primary = $("primary");
const results = $("results");
const json = $("json");
const copyButton = $("copy");
const tracked = $("trackedObjects");
const memoryNote = $("memoryNote");
const clearButton = $("clearMemory");
const lastCrop = $("lastCrop");
const cropInfo = $("cropInfo");
startButton.dataset.sdkReady = "true";

let scanner = null;
let previewUrl = null;
let storage = null;
try { storage = window.localStorage; } catch { /* disabled browser storage */ }

const registry = createObjectRegistry({
  storage,
  ttlMs:24*60*60*1000,
  maxObjects:60,
  minObservations:3
});
const labels = {
  observing:"検出中", pending:"解析待ち", known:"記録済み",
  captured:"切り出し済み", error:"解析エラー", unresolved:"判定不明"
};

function updateMemoryUi({visible,records}) {
  const known=records.filter(r=>r.status==="known").length;
  memoryNote.textContent = "現在の検出: " + visible.length + "件 / 記録: " +
    known + "件 / 処理待ち: " + visible.filter(r=>r.status==="pending").length +
    "件。特徴量と結果のみ" + (storage ? "この端末に最大24時間保存" : "メモリ内に保存") + "。写真は保存しません。";
  if (scanner?.running) drawTrackedOverlay(overlay,video,visible);
  tracked.replaceChildren();
  if(!visible.length) {
    const li=document.createElement("li");
    li.textContent="まだ物体がありません。カメラに物体を向けてください。";
    tracked.append(li);
  }
  for(const r of visible) {
    const li=document.createElement("li");
    li.className="tracked-"+r.status;
    const knownLabel = typeof r.metadata?.label==="string" ? r.metadata.label :
      (r.localLabel||"unknown");
    li.textContent="● "+labels[r.status]+" / #"+r.id.slice(0,8)+
      " / "+getObjectDisplayName(knownLabel)+
      (r.reidentified?"（再登場）":"");
    tracked.append(li);
  }
  json.textContent=JSON.stringify({
    activeObjects:visible,
    storedObjects:records.map(({boundingBox,...r})=>r),
    provider:"demo_local_label_only"
  },null,2);
}
const pipeline=createAutoRecognition({
  video, registry,
  onUpdate:updateMemoryUi,
  onCrop:({id,crop})=>{
    if(previewUrl)URL.revokeObjectURL(previewUrl);
    previewUrl=URL.createObjectURL(crop.blob);
    lastCrop.src=previewUrl;
    lastCrop.hidden=false;
    cropInfo.textContent="自動切り出し: #"+id.slice(0,8)+
      " / "+crop.width+"×"+crop.height+"px / "+crop.blob.size+"bytes" +
      "（端末外への画像送信なし）";
  },
  // This is a DEMO stub, not a second AI. Real models / approved cloud APIs
  // are supplied by the host application through the same async callback.
  analyze:async ({crop,localLabel,signal})=>{
    await new Promise(resolve=>{
      const timer=setTimeout(resolve,950);
      signal.addEventListener("abort",()=>{
        clearTimeout(timer);resolve();
      },{once:true});
    });
    if(signal.aborted)return null;
    return {
      label:localLabel ?? "unknown",
      material:"unknown",
      source:"demo_local_detector_label",
      cropWidthPx:crop.width,
      cropHeightPx:crop.height
    };
  },
  onError:error=>console.error("Object analysis failed:",error)
});
updateMemoryUi({visible:[],records:registry.list()});

function render(result) {
  primary.textContent=result.text
    ? getObjectDisplayName(result.text)+" / "+result.text
    : "認識中…";
  pipeline.ingest(result.detections);
  results.replaceChildren();
  const count=result.detections.length;
  const li=document.createElement("li");
  li.textContent="ローカル物体検出: "+count+"件。"+
    "認識した物体に色付きの枠とIDを付け、自動で切り出します。";
  results.append(li);
}
function releaseScanner() {
  scanner?.dispose();
  scanner=null;
  startButton.disabled=false;
  stopButton.disabled=true;
  modelMode.disabled=false;
  // Keep registry and outstanding async results across camera restarts.
}
function explainError(error) {
  if(!window.isSecureContext)return "HTTPSまたはlocalhostで開いてください。";
  if(error?.name==="NotAllowedError")return "カメラの許可が必要です。";
  return error?.message??String(error);
}
startButton.addEventListener("click",async()=>{
  startButton.disabled=true;
  modelMode.disabled=true;
  status.textContent="カメラの許可を確認しています…";
  try {
    const base=import.meta.env.BASE_URL;
    scanner=createWasteScanner({
      video,overlay,
      detectorFactory:()=>createMediaPipeDetector({
        wasmPath:base+"wasm",
        modelUrl:base+"models/"+
          (modelMode.value==="lite2"?"efficientdet_lite2.tflite":"efficientdet_lite0.tflite"),
        scoreThreshold:0.35,maxResults:8
      }),
      fps:modelMode.value==="lite2"?4:6,
      onCameraReady:()=>{
        status.textContent="カメラ接続成功。端末内AIを初期化しています…";
      },
      onResult:render,
      onError:error=>{
        console.error(error);
        status.textContent="認識エラー: "+explainError(error);
        releaseScanner();
      }
    });
    await scanner.start();
    stopButton.disabled=false;
    status.textContent="スキャン中。黄＝観測、青＝返信待ち、緑＝保存済み。";
  }catch(error) {
    console.error(error);
    status.textContent="開始できません: "+explainError(error);
    releaseScanner();
  }
});
stopButton.addEventListener("click",()=>{
  releaseScanner();
  status.textContent="カメラを停止しました。認識記録は残っています。";
});
clearButton.addEventListener("click",()=>{
  pipeline.clear();
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=null;
  lastCrop.hidden=true;
  lastCrop.removeAttribute("src");
  cropInfo.textContent="切り出し画像は保持していません。";
});
copyButton.addEventListener("click",async()=>{
  try{
    await navigator.clipboard.writeText(json.textContent);
    copyButton.textContent="コピーしました";
  }catch{
    copyButton.textContent="コピーできませんでした";
  }
});
window.addEventListener("pagehide",()=>{
  pipeline.dispose();
  scanner?.dispose();
  if(previewUrl)URL.revokeObjectURL(previewUrl);
});
