import test from "node:test";
import assert from "node:assert/strict";
import { createWasteScanner } from "../src/scanner.js";

test("camera permission and preview run before loading AI model", async () => {
  const events = [];
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const raf = globalThis.requestAnimationFrame;
  const caf = globalThis.cancelAnimationFrame;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => {
      events.push("camera-permission");
      return { getTracks: () => [{ stop() { events.push("camera-stopped"); } }] };
    } } }
  });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const video = {
    srcObject: null, readyState: 2, videoWidth: 640, videoHeight: 480,
    currentTime: 0, async play() { events.push("preview"); }
  };
  const scanner = createWasteScanner({
    video,
    onCameraReady: () => events.push("camera-ready"),
    detectorFactory: async () => {
      events.push("load-model");
      return { detect: () => [], close() {} };
    }
  });
  try {
    await scanner.start();
    assert.deepEqual(events.slice(0, 4), [
      "camera-permission", "preview", "camera-ready", "load-model"
    ]);
    assert.equal(scanner.running, true);
  } finally {
    scanner.dispose();
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete globalThis.navigator;
    if (raf) globalThis.requestAnimationFrame = raf;
    else delete globalThis.requestAnimationFrame;
    if (caf) globalThis.cancelAnimationFrame = caf;
    else delete globalThis.cancelAnimationFrame;
  }
});
test("failed model download does not block camera permission or leak camera", async () => {
  const events = [];
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => {
      events.push("permission");
      return { getTracks: () => [{ stop: () => events.push("released") }] };
    } } }
  });
  const scanner = createWasteScanner({
    video: { async play() { events.push("preview"); }, srcObject: null },
    detectorFactory: async () => { throw Error("model missing"); }
  });
  try {
    await assert.rejects(scanner.start(), /model missing/);
    assert.deepEqual(events, ["permission", "preview", "released"]);
    assert.equal(scanner.running, false);
  } finally {
    scanner.dispose();
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete globalThis.navigator;
  }
});
