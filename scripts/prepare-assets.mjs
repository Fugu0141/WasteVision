import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDestination = join(root, "public", "wasm");
const modelDestination = join(root, "public", "models", "efficientdet_lite0.tflite");
const modelUrl = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";

await mkdir(wasmDestination, { recursive: true });
await cp(wasmSource, wasmDestination, { recursive: true, force: true });
await mkdir(join(root, "public", "models"), { recursive: true });

let exists = false;
try { exists = (await stat(modelDestination)).size > 0; } catch { /* first run */ }

if (!exists) {
  console.log("Downloading EfficientDet-Lite0 (one-time setup)...");
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  await writeFile(modelDestination, new Uint8Array(await response.arrayBuffer()));
}
console.log("Local MediaPipe WASM and model assets are ready.");
