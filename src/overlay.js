/**
 * Draw 2D bounding boxes on top of a video.
 * The canvas and video must be displayed at the same aspect ratio.
 * This is NOT WebXR or 3D spatial AR.
 */
export function drawOverlay(canvas, video, detections = []) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("WasteVision requires a 2D canvas context.");

  const width = video.videoWidth || canvas.width || 1;
  const height = video.videoHeight || canvas.height || 1;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const lineWidth = Math.max(2, Math.round(width / 320));
  const fontSize = Math.max(14, Math.round(width / 45));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const entry of detections) {
    const { x, y, width: w, height: h } = entry.boundingBox;
    if (w <= 0 || h <= 0) continue;

    ctx.strokeStyle = "#42e0b3";
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, w, h);

    const score = entry.objectConfidence == null
      ? ""
      : ` ${Math.round(entry.objectConfidence * 100)}%`;
    const label = `${entry.object}${score} | material: unknown`;
    const labelWidth = Math.min(width, ctx.measureText(label).width + 12);
    const labelX = Math.max(0, Math.min(x, width - labelWidth));
    const labelY = y > fontSize + 12 ? y - fontSize - 10 : Math.min(height - fontSize - 8, y + 2);
    ctx.fillStyle = "rgba(5, 23, 31, 0.9)";
    ctx.fillRect(labelX, labelY, labelWidth, fontSize + 8);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, labelX + 6, labelY + 4, Math.max(1, labelWidth - 12));
  }
}


/** AR-like color-coded outlines: observe=amber, waiting=blue, known=green. */
export function drawTrackedOverlay(canvas, video, objects = []) {
  if (!canvas) return;
  const ctx=canvas.getContext("2d");
  if (!ctx) return;
  const width=video.videoWidth || canvas.width || 1;
  const height=video.videoHeight || canvas.height || 1;
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  ctx.clearRect(0,0,width,height);
  const fontSize=Math.max(14,Math.round(width/44));
  const colors={
    observing:"#f6bb50",
    pending:"#51c9ff",
    known:"#48e3a2",
    captured:"#bc9cff",
    unresolved:"#e6a2c5",
    error:"#ff7474"
  };
  ctx.font="600 "+fontSize+"px system-ui, sans-serif";
  ctx.textBaseline="top";
  for(const item of objects) {
    const b=item.boundingBox;
    if(!b || !(b.width>0 && b.height>0)) continue;
    const color=colors[item.status]||colors.observing;
    ctx.strokeStyle=color;
    ctx.lineWidth=Math.max(3,Math.round(width/240));
    ctx.strokeRect(b.x,b.y,b.width,b.height);
    const phase=item.status==="pending"?"解析待ち":
      item.status==="known"?"記録済み":
      item.status==="captured"?"画像取得済み":
      item.status==="error"?"エラー":"検出中";
    const labelName=typeof item.metadata?.label==="string"
      ? item.metadata.label : (item.localLabel||"unknown");
    const label=phase+" #"+String(item.id).slice(0,7)+" "+labelName;
    const w=Math.min(width-6,ctx.measureText(label).width+14);
    const x=Math.max(0,Math.min(b.x,width-w));
    const y=b.y>fontSize+12?b.y-fontSize-10:
      Math.min(Math.max(0,height-fontSize-8),b.y+2);
    ctx.fillStyle="rgba(3,17,25,0.92)";
    ctx.fillRect(x,y,w,fontSize+8);
    ctx.fillStyle=color;
    ctx.fillText(label,x+7,y+4,Math.max(1,w-14));
  }
}
