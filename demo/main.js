import {
  createMediaPipeDetector, createWasteScanner, getObjectDisplayName
} from "../src/index.js";

const video = document.querySelector("#camera");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const modeSelect = document.querySelector("#modelMode");
const copyButton = document.querySelector("#copy");
const status = document.querySelector("#status");
const primary = document.querySelector("#primary");
const recognitionHint = document.querySelector("#recognitionHint");
const results = document.querySelector("#results");
const json = document.querySelector("#json");
startButton.dataset.sdkReady = "true";

let scanner = null;

function render(result) {
  json.textContent = JSON.stringify(result, null, 2);
  if (result.text) {
    const label = getObjectDisplayName(result.text);
    primary.textContent = label + " / " + result.text;
    recognitionHint.textContent = "複数フレームで安定した検出結果（材質ではありません）";
  } else {
    primary.textContent = "認識中…";
    recognitionHint.textContent = "物体にカメラを向けてください。数フレームの一致を待っています。";
  }
  results.replaceChildren();
  const stable = result.stableDetections;
  if (!stable.length) {
    const li = document.createElement("li");
    li.textContent = "安定した物体名はまだありません（単発検出：" +
      result.detections.length + "件）。";
    results.append(li);
    return;
  }
  for (const item of stable) {
    const li = document.createElement("li");
    const label = getObjectDisplayName(item.object);
    const score = item.objectConfidence == null
      ? "今回のスコアなし" : "今回のスコア " + Math.round(item.objectConfidence * 100) + "%";
    li.textContent = label + " (" + item.object + ") — " +
      item.stability.observations + "/" + item.stability.window +
      "フレーム一致、" + score;
    results.append(li);
  }
}

function releaseScanner() {
  scanner?.dispose();
  scanner = null;
  modeSelect.disabled = false;
  stopButton.disabled = true;
  startButton.disabled = false;
}

function explainError(error) {
  if (!window.isSecureContext) return "HTTPSまたはlocalhostで開いてください。";
  if (error?.name === "NotAllowedError") return "ブラウザのカメラ許可設定を確認してください。";
  if (error?.name === "NotFoundError") return "利用可能なカメラが見つかりません。";
  return error?.message ?? String(error);
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  modeSelect.disabled = true;
  status.textContent = "カメラの使用許可を確認しています…";
  try {
    const base = import.meta.env.BASE_URL;
    const modelName = modeSelect.value === "lite2" ?
      "efficientdet_lite2.tflite" : "efficientdet_lite0.tflite";
    const fps = modeSelect.value === "lite2" ? 4 : 6;
    scanner = createWasteScanner({
      video, overlay,
      detectorFactory: () => createMediaPipeDetector({
        wasmPath: base + "wasm",
        modelUrl: base + "models/" + modelName,
        scoreThreshold: 0.35,
        maxResults: 8
      }),
      fps,
      temporal: { minObservations: 3, windowSize: 5 },
      onCameraReady: () => {
        status.textContent = "カメラ接続成功。AIモデルを読み込み中…";
      },
      onResult: render,
      onError: (error) => {
        console.error("WasteVision recognition error:", error);
        status.textContent = "認識エラー: " + explainError(error);
        releaseScanner();
      }
    });
    await scanner.start();
    status.textContent = modeSelect.value === "lite2" ?
      "高精度モードでスキャン中（端末内AI）" :
      "軽量モードでスキャン中（端末内AI）";
    stopButton.disabled = false;
  } catch (error) {
    console.error("WasteVision startup error:", error);
    status.textContent = "開始できません: " + explainError(error);
    releaseScanner();
  }
});

stopButton.addEventListener("click", () => {
  releaseScanner();
  status.textContent = "停止しました。";
  primary.textContent = "停止中";
  recognitionHint.textContent = "別の認識モードを選んで再開できます。";
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
