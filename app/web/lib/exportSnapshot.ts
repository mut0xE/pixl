"use client";
import {
  snapshotToRgbaBytes,
  snapshotToJson,
  type CanvasSnapshot,
} from "../../../packages/sdk";

// Browser-only snapshot download; the pure grid → RGBA / JSON work is in the SDK.
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Rasterize a snapshot to a PNG Blob at an integer pixel scale (nearest). */
export async function snapshotToPngBlob(
  snap: CanvasSnapshot,
  scale = 1
): Promise<Blob> {
  const bytes = snapshotToRgbaBytes(snap);
  // Draw the 1:1 grid, then upscale with nearest-neighbor into a second canvas.
  const src = document.createElement("canvas");
  src.width = snap.width;
  src.height = snap.height;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("2D canvas context unavailable");
  const img = new ImageData(snap.width, snap.height);
  img.data.set(bytes);
  sctx.putImageData(img, 0, 0);

  const out = document.createElement("canvas");
  out.width = snap.width * scale;
  out.height = snap.height * scale;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("2D canvas context unavailable");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, out.width, out.height);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG encode failed"));
    }, "image/png");
  });
}

/** Download both the PNG and the reproducible JSON for a snapshot. */
export async function downloadSnapshot(
  snap: CanvasSnapshot,
  baseName: string,
  scale = 8
): Promise<void> {
  const png = await snapshotToPngBlob(snap, scale);
  triggerDownload(png, `${baseName}.png`);
  const json = new Blob([snapshotToJson(snap)], { type: "application/json" });
  triggerDownload(json, `${baseName}.json`);
}
