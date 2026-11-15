# WasteVision

**v0.4 — Local object memory and non-blocking auto-recognition SDK (experimental)**

カメラに映った物体を自動でマークし、**物体ID / 色付きAR風枠 / 画像の自動切り出し / 非同期の認識結果 / 再登場時の結果再表示**を試すJavaScript SDKです。

[**Open mobile demo**](https://fugu0141.github.io/WasteVision/) · [**Technical guide**](docs/AUTO-TRACKING.md)

## What's new / v0.4

- **撮影ボタンは不要**：検出物体が3フレーム連続して見つかれば、その領域だけを最大640pxのJPEGに自動切り出しします。
- **非同期**：アプリ側が渡す解析関数にJPEGを渡し、返信を待つ間もカメラ映像・AR表示は止めません。返信したメタデータは元の物体IDへ付与します。
- **色付きの枠**：黄＝観測中、青＝返信待ち、緑＝記録済み。
- **再登場**：物体が画面外に出て再び現れたとき、色・模様・縦横比などの軽量な特徴量と照合し、以前の物体IDを再表示します。**似た物体を取り違える可能性があります。**
- **端末内保存**：記録したID・特徴量・結果をブラウザのlocalStorageに最大24時間保存。**元画像とJPEGは保存しません。** 画面から記録を消去できます。
- **AIは交換可能**：標準SDK自身は写真を外部に送信しません。都立AIなどの通信は別の任意拡張です。

**デモの非同期返信は実AIによる解析ではありません。** 物体検出済みのラベルを約1秒後に返す動作確認用のモックです。新しいAIモデルの精度改善を主張するものではありません。

## SDK imports

| Import path | Role |
|---|---|
| waste-vision | Camera, local object detection, basic detection results |
| waste-vision/identity | Optional local object ID registry, reidentification, localStorage |
| waste-vision/appearance | Optional color/texture descriptor and local cropped JPEG |
| waste-vision/extensions/auto-recognition | Optional asynchronous crop-to-metadata linking |
| waste-vision/geometry | Pixel-level geometry from masks |
| waste-vision/extensions/segmentation | Optional tap-guided segmentation (former v0.3 experiment) |
| waste-vision/extensions/hybrid | Optional remote AI transport (excluded from default demo) |

## Local development

Node.js 20.19+ or 22.12+.

~~~sh
git clone https://github.com/Fugu0141/WasteVision.git
cd WasteVision
npm install
npm run prepare:assets
npm run dev
~~~

Open http://localhost:5173 in a browser. A phone needs HTTPS for camera permission; GitHub Pages is an example.

The optional MagicTouch segmentation model used by the old v0.3 module can be prepared separately with npm run prepare:segmentation.

## v0.4 async integration

~~~js
import { createObjectRegistry } from "waste-vision/identity";
import { createAutoRecognition } from "waste-vision/extensions/auto-recognition";

// Pass these to your existing createWasteScanner onResult callback.
const memory = createObjectRegistry({
  storage: localStorage,   // omit for memory-only storage
  maxObjects: 60,
  ttlMs: 24 * 60 * 60 * 1000
});

const pipeline = createAutoRecognition({
  video: document.querySelector("video"),
  registry: memory,
  onCrop({id,crop}) {
    console.log("JPEG crop:",id,crop.blob,crop.width,crop.height);
  },
  async analyze({id,crop,localLabel,signal}) {
    // App-specific model, or an explicitly authorized external provider.
    // This example intentionally returns the local detector hint only.
    return {label:localLabel,material:"unknown",source:"example"};
  },
  onUpdate({visible}) {
    console.log("AR object records:",visible);
  }
});

// In createWasteScanner({..., onResult(result) {...}}):
pipeline.ingest(result.detections);

// On camera stop: keep memory and pending replies while clearing stale positions.
pipeline.pause();

// To remove all locally stored records: pipeline.clear()
// To release pending work: pipeline.dispose()
~~~

The automatic crop is associated with an ID, and an async response is
attached to **that same ID** even if the object has left the frame.

## Limitations and privacy

- Automatic recognition still requires the existing detector to detect a
  bounding box. Truly novel objects outside COCO classes will not enter the
  automatic tracker until a class-agnostic detector is added.
- Local appearance-based reidentification is **heuristic**. Two visually
  identical cans/bottles may be confused; changes in lighting, pose or
  occlusion can defeat a match. This is not 3D AR world anchoring.
- Bounding-box crop may include background. Pixel dimensions are not physical
  centimeters; materials PET/glass/metal cannot be verified from a label.
- Stored appearance features can still be privacy-relevant, although raw
  photos are not persisted. The default demo has a clear-memory control.
- Crops are never automatically uploaded. Integrating an outside AI requires
  separate app-side permission and safe credential handling.
- Real-device reidentification accuracy and heat/battery impact have not yet
  been measured; GitHub Actions checks do not substitute for field tests.

Older design and implementation documentation:
[Object geometry v0.3](docs/UNKNOWN-OBJECT-IMPLEMENTATION.md),
[Unknown-object strategy](docs/UNKNOWN-OBJECT-STRATEGY.md),
[Optional Hybrid Vision](docs/PHASE-3-HYBRID.md),
[Architecture](docs/ARCHITECTURE.md).

## Development

~~~sh
npm test
npm run build
~~~

**Experimental / v0.4** — API and package design may evolve.

## License

WasteVisionのオリジナルソースコードおよびドキュメントは **MIT License** で公開しています。詳細は [LICENSE](LICENSE) を参照してください。

**注意：** MITライセンスは、外部ライブラリ（MediaPipeなど）やダウンロードする学習済みAIモデルのライセンスを変更するものではありません。再配布時は各依存物のライセンス・利用条件も個別に確認してください。
