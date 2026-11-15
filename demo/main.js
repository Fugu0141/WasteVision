import { createMediaPipeDetector, createWasteScanner } from "../src/index.js";

const video = document.querySelector("#camera");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const copyButton = document.querySelector("#copy");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const json = document.querySelector("#json");

let scanner = null;

function render(result) {
  json.textContent = JSON.stringify(result, null, 2);
  results.replaceChildren();
  if (result.detections.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだ物体が見つかりません。";
    results.append(li);
    return;
  }
  for (const item of result.detections) {
    const li = document.createElement("li");
    const percent = item.objectConfidence == null
      ? "n/a" : `${Math.round(item.objectConfidence * 100)}%`;
    const candidates = item.materialCandidates.length
      ? item.materialCandidates.join(", ") : "なし";
    li.textContent = `${item.object} (${percent}) — 材質: unknown / 候補: ${candidates}`;
    results.append(li);
  }
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status.textContent = "カメラの使用許可を確認しています…";
  try {
    if (!scanner) {
      const base = import.meta.env.BASE_URL;
      scanner = createWasteScanner({
        video, overlay,
        detectorFactory: () => createMediaPipeDetector({
          wasmPath: base + "wasm",
          modelUrl: base + "models/efficientdet_lite0.tflite"
        }),
        fps: 5,
        onCameraReady: () => {
          status.textContent = "カメラ接続成功。端末内AIを初期化しています…";
        },
        onResult: render,
        onError: (error) => {
          status.textContent = `認識エラー: ${error.message}`;
          stopButton.disabled = true;
          startButton.disabled = false;
        }
      });
    }
    status.textContent = "カメラの使用許可を確認しています…";
    await scanner.start();
    status.textContent = "スキャン中（ブラウザ内で処理）";
    stopButton.disabled = false;
  } catch (error) {
    console.error(error);
    const secure = window.isSecureContext;
    const guidance = !secure ? " HTTPSまたはlocalhostで開いてください。" :
      error?.name === "NotAllowedError" ? " ブラウザ設定でカメラを許可してください。" :
      " AIモデルの読み込み失敗ならモデル/WASMの配信を確認してください。";
    status.textContent = `開始できません: ${error.message}` + guidance;
    startButton.disabled = false;
  }
});

stopButton.addEventListener("click", () => {
  scanner?.stop();
  stopButton.disabled = true;
  startButton.disabled = false;
  status.textContent = "停止しました。";
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(json.textContent);
    copyButton.textContent = "コピーしました";
  } catch {
    copyButton.textContent = "コピーできませんでした";
  }
});
window.addEventListener("pagehide", () => scanner?.dispose());
