import { analyzeMask, analyzeRectangle, pointerToImagePoint } from "../src/geometry.js";

/**
 * Demo-only UI. Geometry is local; segmentation is lazily loaded as an optional
 * extension. The generic object detector is NOT used by either selection mode.
 */
export function initializeUnknownObjectDemo({ video, getScanner }) {
  const freeze = document.querySelector("#freezeFrame");
  const mode = document.querySelector("#regionMode");
  const stage = document.querySelector("#snapshotStage");
  const photo = document.querySelector("#snapshotCanvas");
  const overlay = document.querySelector("#maskOverlay");
  const status = document.querySelector("#unknownStatus");
  const summary = document.querySelector("#unknownSummary");
  const output = document.querySelector("#unknownJson");
  const copy = document.querySelector("#copyUnknown");

  let segmenter = null;
  let generation = 0;
  let hasPhoto = false;
  let busy = false;
  let startPoint = null;
  let lastResult = null;

  function clearOverlay() {
    const ctx = overlay.getContext("2d");
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  }
  function showResult(result) {
    lastResult = result;
    output.textContent = JSON.stringify(result, null, 2);
    const g = result.geometry;
    if (result.status === "segmented") {
      summary.textContent = "輪郭を抽出: " + g.widthPx + " × " + g.heightPx +
        " px / 画像内面積 " + (g.areaFraction * 100).toFixed(1) + "%";
    } else if (result.status === "region_selected") {
      summary.textContent = "四角形を指定: " + g.widthPx.toFixed(0) + " × " +
        g.heightPx.toFixed(0) + " px（輪郭の面積ではありません）";
    } else {
      summary.textContent = "輪郭が見つかりませんでした。四角指定を試してください。";
    }
    status.textContent = "取得したのは画像内の情報です。実寸と材質は未確定です。";
  }
  function drawBox(x, y, width, height, color = "#42e0b3") {
    clearOverlay();
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = Math.max(2, overlay.width / 350);
    ctx.strokeStyle = color;
    ctx.setLineDash([9, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);
  }
  function drawMask(mask, result) {
    if (mask.width !== photo.width || mask.height !== photo.height) {
      throw new Error("Mask and source image dimensions are inconsistent.");
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable.");
    clearOverlay();
    const pixels = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i] < 0.5) continue;
      const idx = i * 4;
      pixels.data[idx] = 56;
      pixels.data[idx + 1] = 230;
      pixels.data[idx + 2] = 171;
      pixels.data[idx + 3] = 99;
    }
    ctx.putImageData(pixels, 0, 0);
    const b = result.region.bboxPx;
    if (b) {
      ctx.strokeStyle = "#44ffd0";
      ctx.lineWidth = Math.max(2, mask.width / 350);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    }
  }

  function capture() {
    if (!getScanner()?.running || !video.videoWidth || !video.videoHeight) {
      status.textContent = "先にカメラを開始してください。";
      return;
    }
    generation++;
    hasPhoto = false;
    startPoint = null;
    const maxDimension = 768;
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    photo.width = Math.max(1, Math.round(video.videoWidth * scale));
    photo.height = Math.max(1, Math.round(video.videoHeight * scale));
    overlay.width = photo.width;
    overlay.height = photo.height;
    const ctx = photo.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable.");
    ctx.drawImage(video, 0, 0, photo.width, photo.height);
    clearOverlay();
    stage.hidden = false;
    hasPhoto = true;
    lastResult = null;
    output.textContent = '{ "status": "awaiting_selection" }';
    summary.textContent = "物体名: 不明 / 材質: 不明";
    status.textContent = mode.value === "tap"
      ? "静止画の中の物体をタップしてください。輪郭抽出モデルは初回のみ読み込みます。"
      : "静止画で四角形をドラッグしてください。モデルは使いません。";
  }

  freeze.addEventListener("click", () => {
    try { capture(); } catch (error) { status.textContent = "撮影エラー: " + error.message; }
  });
  mode.addEventListener("change", () => {
    clearOverlay();
    startPoint = null;
    if (!hasPhoto) return;
    status.textContent = mode.value === "tap"
      ? "画像内の物体をタップしてください。"
      : "開始点から終了点までドラッグしてください。";
  });

  photo.addEventListener("pointerdown", event => {
    if (!hasPhoto || busy) return;
    if (mode.value !== "rectangle") return;
    startPoint = pointerToImagePoint(
      event.clientX, event.clientY, photo.getBoundingClientRect(), photo.width, photo.height
    );
    try { photo.setPointerCapture(event.pointerId); } catch { /* unsupported */ }
  });
  photo.addEventListener("pointermove", event => {
    if (!startPoint || mode.value !== "rectangle") return;
    const p = pointerToImagePoint(
      event.clientX, event.clientY, photo.getBoundingClientRect(), photo.width, photo.height
    );
    drawBox(startPoint.x, startPoint.y, p.x - startPoint.x, p.y - startPoint.y);
  });
  photo.addEventListener("pointercancel", () => {
    startPoint = null;
    clearOverlay();
  });
  photo.addEventListener("pointerup", async event => {
    if (!hasPhoto || busy) return;
    const p = pointerToImagePoint(
      event.clientX, event.clientY, photo.getBoundingClientRect(), photo.width, photo.height
    );
    if (mode.value === "rectangle") {
      if (!startPoint) return;
      const selection = {
        x: startPoint.x, y: startPoint.y,
        width: p.x - startPoint.x, height: p.y - startPoint.y
      };
      startPoint = null;
      try {
        const result = analyzeRectangle(selection, photo.width, photo.height);
        const b = result.region.bboxPx;
        drawBox(b.x, b.y, b.width, b.height);
        showResult(result);
      } catch (error) {
        status.textContent = "範囲をもう少し大きくドラッグしてください。";
      }
      return;
    }

    busy = true;
    const current = generation;
    status.textContent = "端末内で輪郭を解析しています…";
    drawBox(p.x - 5, p.y - 5, 10, 10);
    try {
      if (!segmenter) {
        const { createInteractiveObjectSegmenter } = await import(
          "../src/extensions/segmentation.js"
        );
        const base = import.meta.env.BASE_URL;
        const created = await createInteractiveObjectSegmenter({
          wasmPath: base + "wasm",
          modelUrl: base + "models/interactive_segmentation.task",
          delegate: "CPU"
        });
        if (generation !== current) {
          created.close();
          return;
        }
        segmenter = created;
      }
      if (generation !== current) return;
      segmenter.setImage(photo);
      const mask = segmenter.segmentPoint(p.normalizedX, p.normalizedY);
      if (generation !== current) return;
      const result = analyzeMask({
        ...mask, source: "user_tap", threshold: 0.5
      });
      drawMask(mask, result);
      showResult(result);
      if (result.status === "unknown") {
        status.textContent = "対象の輪郭を抽出できませんでした。四角指定をお試しください。";
      }
    } catch (error) {
      console.error("WasteVision segmentation error:", error);
      clearOverlay();
      status.textContent = "輪郭抽出できません: " + error.message +
        "。『四角で範囲指定』なら追加モデルなしで使用できます。";
    } finally {
      busy = false;
    }
  });

  copy.addEventListener("click", async () => {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      status.textContent = "特徴データをコピーしました。";
    } catch {
      status.textContent = "コピーできませんでした。";
    }
  });
  const dispose = () => {
    generation++;
    segmenter?.close();
    segmenter = null;
  };
  window.addEventListener("pagehide", dispose);
  return {
    setCameraRunning(running) { freeze.disabled = !running; },
    dispose
  };
}
