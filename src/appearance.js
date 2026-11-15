/**
 * Lightweight visual descriptor (NOT an identity guarantee or embedding model).
 * Draws only the detected crop into a 9x8 canvas and stores no full-resolution
 * image. Distinct objects with similar colors/texture may be confused.
 */
export function clampBox(box, width, height, insetRatio = 0) {
  if (!box || !Number.isFinite(width) || !Number.isFinite(height) ||
      !(width > 0 && height > 0)) return null;
  const x = Number(box.x), y = Number(box.y);
  const w = Number(box.width), h = Number(box.height);
  if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const px = w * insetRatio, py = h * insetRatio;
  const x1 = Math.max(0, Math.min(width, x + px));
  const y1 = Math.max(0, Math.min(height, y + py));
  const x2 = Math.max(0, Math.min(width, x + w - px));
  const y2 = Math.max(0, Math.min(height, y + h - py));
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function describePixels(pixels, width = 9, height = 8, aspect = 1) {
  if (!(width >= 2 && height >= 2) || pixels.length < width * height * 4) {
    throw new TypeError("Expected sampled RGBA pixels.");
  }
  const histogram = new Array(12).fill(0);
  const luminance = [];
  let sum = 0, sumSquares = 0;
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i*4]/255, g = pixels[i*4+1]/255, b = pixels[i*4+2]/255;
    const value = 0.299*r + 0.587*g + 0.114*b;
    luminance.push(value);
    sum += value; sumSquares += value*value;
    for (const [channel, c] of [r,g,b].entries()) {
      histogram[channel*4 + Math.min(3, Math.floor(c*4))] += 1/(width*height);
    }
  }
  let hash = "";
  for (let y = 0; y < height; y++) for (let x = 0; x < width-1; x++) {
    hash += luminance[y*width + x] > luminance[y*width+x+1] ? "1" : "0";
  }
  const variance = Math.max(0, sumSquares/(width*height) - (sum/(width*height))**2);
  return {
    version: 1,
    histogram: histogram.map(v => +v.toFixed(5)),
    hash,
    aspect: Math.max(0.1, Math.min(10, aspect)),
    texture: +Math.sqrt(variance).toFixed(4)
  };
}

export function appearanceDistance(a, b) {
  if (!a || !b || a.version !== 1 || b.version !== 1 ||
      !Array.isArray(a.histogram) || !Array.isArray(b.histogram) ||
      a.histogram.length !== 12 || b.histogram.length !== 12 ||
      typeof a.hash !== "string" || typeof b.hash !== "string" ||
      a.hash.length !== 64 || b.hash.length !== 64 ||
      !(a.aspect > 0) || !(b.aspect > 0)) return Infinity;
  let color = 0, bits = 0;
  for(let i=0;i<12;i++) {
    if (!Number.isFinite(a.histogram[i]) || !Number.isFinite(b.histogram[i])) return Infinity;
    color += Math.abs(a.histogram[i] - b.histogram[i]);
  }
  for(let i=0;i<64;i++) bits += Number(a.hash[i] !== b.hash[i]);
  // Equal-sized bins, normalized to 0..1; modest pose/scale penalty.
  const aspect = Math.min(1, Math.abs(Math.log(a.aspect / b.aspect))/1.2);
  return 0.55*(color/6) + 0.3*(bits/64) + 0.15*aspect;
}

export function sampleAppearance(video, boundingBox, {
  createCanvas = () => document.createElement("canvas")
} = {}) {
  const box = clampBox(boundingBox, video?.videoWidth, video?.videoHeight, 0.08);
  if (!box) return null;
  const canvas = createCanvas();
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, 9, 8);
  const rgba = ctx.getImageData(0, 0, 9, 8).data;
  return describePixels(rgba, 9, 8, box.width/box.height);
}

export async function captureObjectCrop(video, boundingBox, {
  maxSide = 640, jpegQuality = 0.78,
  createCanvas = () => document.createElement("canvas")
} = {}) {
  if (!(maxSide >= 128 && maxSide <= 2048)) throw new RangeError("Invalid crop size.");
  const box = clampBox(boundingBox, video?.videoWidth, video?.videoHeight);
  if (!box || video.readyState < 2) throw new Error("Video frame/crop is unavailable.");
  const padding = Math.min(box.width, box.height)*0.08;
  const padded = clampBox({
    x: box.x-padding, y: box.y-padding,
    width: box.width+2*padding, height: box.height+2*padding
  }, video.videoWidth, video.videoHeight);
  const scale = Math.min(1, maxSide/Math.max(padded.width,padded.height));
  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.round(padded.width*scale));
  canvas.height = Math.max(1, Math.round(padded.height*scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context.");
  ctx.drawImage(video,padded.x,padded.y,padded.width,padded.height,
    0,0,canvas.width,canvas.height);
  const blob = await new Promise((resolve,reject)=>
    canvas.toBlob(b=>b?resolve(b):reject(new Error("JPEG encode failed")),
      "image/jpeg",jpegQuality));
  return {
    blob, contentType:"image/jpeg", boundingBox:padded,
    width:canvas.width, height:canvas.height
  };
}
