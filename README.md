# WasteVision

**An on-device waste object detection SDK for web apps.**  
Webアプリに組み込める、ごみ・物体認識用JavaScript SDKの試作プロジェクトです。

> [!IMPORTANT]
> **v0.1 は物体検出のプロトタイプです。** カメラ映像から「bottle」「cup」などの物体を検出し、AR風の枠を重ねます。**材質（PET、金属、ガラスなど）を画像のみから確定判定する機能は未実装**です。物体の信頼度を材質の信頼度として扱いません。

## Features / 初期版の機能

- カメラ映像を `getUserMedia` で取得（許可が必要）
- MediaPipe Object Detector / EfficientDet-Lite0 をブラウザ端末内で実行
- バウンディングボックスとラベルをCanvasに描画（2D AR風オーバーレイ）
- 検出結果をJavaScriptオブジェクトとして返す
- 不明な材質を `unknown` として扱い、素材候補のみ提示
- 検出エンジンを差し替え可能なSDK設計
- サーバーへカメラ画像をアップロードしない

## Quick start / 試し方

**Node.js 20.19+ または 22.12+ 推奨**（Vite 7）。

```bash
git clone https://github.com/Fugu0141/WasteVision.git
cd WasteVision
npm install
npm run prepare:assets
npm run dev
```

表示された `http://localhost:5173` をブラウザで開き、「カメラを開始」を押してください。

`prepare:assets` は MediaPipe のWASMを `node_modules` から `public/wasm` にコピーし、Googleが公開するEfficientDet-Lite0のモデルを `public/models` にダウンロードします。**初回セットアップにはインターネット接続が必要**です。実行時は自己ホストしたモデル/WASMを使用し、映像推論はローカルで実行します。npm依存パッケージはビルド後にアプリへ同梱されます。完全オフライン配信には、ビルド済みファイルを配布/キャッシュしてください。

> カメラを使うには HTTPS または localhost などの安全なコンテキストが必要です。スマホからLAN内の `http://192.168...` にアクセスするだけでは通常カメラを利用できません。

## スマートフォンで試す

GitHub Pages の公開ワークフローを追加しています。リポジトリの **Settings → Pages → Build and deployment → Source: GitHub Actions** を選び、Actions で Deploy WasteVision demo の成功を確認してください。

公開先: **https://fugu0141.github.io/WasteVision/** （公開設定後）。

HTTPのLANアドレスではカメラ権限を使用できない場合があります。HTTPSで開いてください。開始ボタンを押すとまずカメラ権限を要求し、映像を表示してからAIモデルを読み込みます。

## SDK API (prototype)

```js
import { createWasteScanner, createMediaPipeDetector } from "./src/index.js";

const scanner = createWasteScanner({
  video: document.querySelector("video"),
  overlay: document.querySelector("canvas"),
  detectorFactory: () => createMediaPipeDetector({
    wasmPath: "/wasm",
    modelUrl: "/models/efficientdet_lite0.tflite",
  }),
  onCameraReady: () => console.log("Camera ready, loading AI..."),
  fps: 5,
  onResult: (result) => console.log(result),
});

await scanner.start();
const result = await scanner.scan();
console.log(result.detections[0]?.material); // "unknown"
scanner.stop();
scanner.dispose();
```

戻り値の例:

```json
{
  "timestampMs": 13500,
  "detections": [
    {
      "object": "bottle",
      "objectConfidence": 0.86,
      "material": "unknown",
      "materialConfidence": null,
      "materialCandidates": ["plastic", "glass", "metal"],
      "needsConfirmation": true,
      "boundingBox": {"x": 100, "y": 50, "width": 90, "height": 180}
    }
  ]
}
```

※ この例の数値は架空の値です。材質候補は物体ラベルに基づくヒントであり、画像からの材質推定結果ではありません。

## Architecture

```text
Camera (getUserMedia)
    → Detector adapter (MediaPipe / replaceable)
    → Object detections with scores and bounding boxes
    → Material resolver (v0.1: unknown + possible candidates)
    → WasteScanner API callbacks + Canvas overlay
    → Host app (e.g. Samurai)
```

設計方針と拡張予定: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Privacy & limitations

- モデル推論はブラウザ内で実行します。SDK自身は画像をサーバーに送信しません。
- MediaPipeは利用状況・性能に関するメトリクス送信があり得ます。プロダクト運用前にMediaPipeのプライバシー通知を確認してください。
- COCO学習済み物体検出モデルは「一般物体」を認識します。ごみの分別区分や樹脂種別の確定には使用できません。
- ARは2D画像オーバーレイです。WebXRの空間追跡・3D計測は含みません。
- ごみの出し方は自治体によって異なります。WasteVisionは分別判断そのものを行いません。

## Development

```bash
npm test
npm run build
```

## Status

**Experimental / v0.1** — APIは変更される可能性があります。ライセンス・配布条件は公開前に確定します。

### References

- [MediaPipe Object Detector](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector)
- [getUserMedia (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
