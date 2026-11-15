import { cp, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDestination = join(root, "public", "wasm");
const modelDirectory = join(root, "public", "models");
const models = [
  {
    filename: "efficientdet_lite0.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite"
  },
  {
    filename: "efficientdet_lite2.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/int8/latest/efficientdet_lite2.tflite"
  }
];

await mkdir(wasmDestination, { recursive: true });
await cp(wasmSource, wasmDestination, { recursive: true, force: true });
await mkdir(modelDirectory, { recursive: true });
for (const model of models) {
  const destination = join(modelDirectory, model.filename);
  let exists = false;
  try { exists = (await stat(destination)).size > 1024; } catch { /* first run */ }
  if (exists) continue;
  console.log("Downloading " + model.filename + " for on-device inference...");
  const response = await fetch(model.url);
  if (!response.ok) throw new Error(model.filename + ": HTTP " + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(model.filename + ": invalid download");
  const temporary = destination + ".partial";
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}
console.log("Self-hosted MediaPipe WASM and both EfficientDet model variants are ready.");
