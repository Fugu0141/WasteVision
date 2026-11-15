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
  status.textContent = "端末内AIの初期化中…";
  try {
    if (!scanner) {
      const base = import.meta.env.BASE_URL;
      const detector = await createMediaPipeDetector({
        wasmPath: `${base}wasm`,
        modelUrl: `${base}models/efficientdet_lite0.tflite`
      });
      scanner = createWasteScanner({
        video, overlay, detector,
        fps: 5,
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
    status.textContent = `開始できません: ${error.message}`;
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
