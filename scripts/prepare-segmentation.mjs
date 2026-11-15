import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = join(root, "public", "models");
const destination = join(dir, "interactive_segmentation.task");
const url = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task";

await mkdir(dir, { recursive: true });
let exists = false;
try { exists = (await stat(destination)).size > 1024; } catch { /* not present */ }
if (!exists) {
  console.log("Downloading optional MagicTouch segmentation model...");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Segmentation model download failed: HTTP " + response.status);
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength < 1024) throw new Error("Downloaded model was unexpectedly small.");
  const temp = destination + ".partial";
  await writeFile(temp, buffer);
  await rename(temp, destination);
}
console.log("Optional MagicTouch model is ready: " + destination);
