"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  convertImageToArtwork,
  deriveHeight,
  u32ToRgba,
  type SourceImage,
} from "../../../../packages/sdk";

// Admin tool: decode an uploaded image and convert it into a season Artwork
// (palette-mapped pixel grid), bounded by the season's live canvas. Exports the
// Artwork as JSON. Pure conversion lives in the SDK; this component only handles
// decoding, controls, previews, placement, and export.

const MAX_PREVIEW_PX = 320; // css size cap for the scaled-up previews
const MAX_STAGE_PX = 440; // css size cap for the canvas placement stage
const SVG_RASTER_PX = 512; // target raster size for the largest SVG dimension

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

/** Decode a File (PNG/JPEG/WebP/SVG) into raw RGBA via an offscreen canvas. */
async function decodeImage(file: File): Promise<SourceImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = url;
    });

    // Raster formats keep their native pixels. SVG is resolution-independent, so
    // rasterize it at a fixed size (scaled from its intrinsic aspect ratio, with
    // a 1:1 fallback when the SVG declares no size) for a crisp source.
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (isSvgFile(file)) {
      if (!w || !h) {
        w = SVG_RASTER_PX;
        h = SVG_RASTER_PX;
      } else {
        const s = SVG_RASTER_PX / Math.max(w, h);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
      }
    }
    if (!w || !h) throw new Error("Image has zero dimensions");

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageConverter({
  canvasWidth,
  canvasHeight,
  canvasPixels,
  palette,
  seasonId,
}: {
  canvasWidth: number;
  canvasHeight: number;
  /** Current canvas cells (row-major palette indices) for the placement preview. */
  canvasPixels: number[];
  palette: number[];
  seasonId: number;
}) {
  const [src, setSrc] = useState<SourceImage | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [width, setWidth] = useState(64);
  const [aspectLock, setAspectLock] = useState(true);
  const [height, setHeight] = useState(64);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [fit, setFit] = useState<"contain" | "crop">("contain");
  const [alphaThreshold, setAlphaThreshold] = useState(128);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const paletteRgba = useMemo(() => palette.map(u32ToRgba), [palette]);

  // Keep the original object URL alive for the "before" preview.
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [originalUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCopied(false);
    try {
      const decoded = await decodeImage(file);
      setSrc(decoded);
      setFileName(file.name.replace(/\.[^.]+$/, ""));
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      setOriginalUrl(URL.createObjectURL(file));
      // Sensible default: fit width to canvas, keep aspect.
      const w = Math.min(decoded.width, canvasWidth);
      setWidth(w);
      setHeight(deriveHeight(decoded.width, decoded.height, w));
      setX(0);
      setY(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSrc(null);
    }
  }

  const effectiveHeight = useMemo(() => {
    if (!src) return height;
    return aspectLock ? deriveHeight(src.width, src.height, width) : height;
  }, [src, aspectLock, width, height]);

  const result = useMemo(() => {
    if (!src || palette.length === 0) return null;
    return convertImageToArtwork(src, {
      palette,
      canvasWidth,
      canvasHeight,
      targetWidth: width,
      targetHeight: effectiveHeight,
      x,
      y,
      fit,
      alphaThreshold,
      id: `art-${seasonId}`,
      name: fileName || `artwork-${seasonId}`,
    });
  }, [
    src,
    palette,
    canvasWidth,
    canvasHeight,
    width,
    effectiveHeight,
    x,
    y,
    fit,
    alphaThreshold,
    seasonId,
    fileName,
  ]);

  // Paint the quantized preview at cell resolution; CSS scales it up crisp.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !result) return;
    const { artwork, previewRgba } = result;
    canvas.width = artwork.width;
    canvas.height = artwork.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new ImageData(
      new Uint8ClampedArray(previewRgba),
      artwork.width,
      artwork.height
    );
    ctx.putImageData(img, 0, 0);
  }, [result]);

  // Render the full season canvas (existing pixels) with the converted artwork
  // composited in at its placement, so the admin sees exactly where it lands.
  useEffect(() => {
    const canvas = layoutRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
    // Base layer: current canvas cells.
    for (let i = 0; i < canvasWidth * canvasHeight; i++) {
      const c = paletteRgba[canvasPixels[i]];
      if (!c) continue; // out-of-range / unset -> leave transparent
      buf[i * 4] = c.r;
      buf[i * 4 + 1] = c.g;
      buf[i * 4 + 2] = c.b;
      buf[i * 4 + 3] = 255;
    }
    // Overlay: the artwork's non-transparent cells at (x, y).
    if (result) {
      const { artwork } = result;
      for (let row = 0; row < artwork.height; row++) {
        for (let col = 0; col < artwork.width; col++) {
          const p = artwork.pixels[row * artwork.width + col];
          if (p === artwork.transparentIndex) continue;
          const cx = artwork.x + col;
          const cy = artwork.y + row;
          if (cx < 0 || cy < 0 || cx >= canvasWidth || cy >= canvasHeight)
            continue;
          const c = paletteRgba[p];
          if (!c) continue;
          const di = (cy * canvasWidth + cx) * 4;
          buf[di] = c.r;
          buf[di + 1] = c.g;
          buf[di + 2] = c.b;
          buf[di + 3] = 255;
        }
      }
    }
    ctx.putImageData(new ImageData(buf, canvasWidth, canvasHeight), 0, 0);
  }, [canvasPixels, paletteRgba, canvasWidth, canvasHeight, result]);

  // Click the stage to place the artwork centered on the clicked cell.
  function placeFromClick(e: React.MouseEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage || !result) return;
    const rect = stage.getBoundingClientRect();
    const cellX = Math.floor(
      ((e.clientX - rect.left) / rect.width) * canvasWidth
    );
    const cellY = Math.floor(
      ((e.clientY - rect.top) / rect.height) * canvasHeight
    );
    const aw = result.artwork.width;
    const ah = result.artwork.height;
    setX(Math.max(0, Math.min(canvasWidth - aw, cellX - Math.floor(aw / 2))));
    setY(Math.max(0, Math.min(canvasHeight - ah, cellY - Math.floor(ah / 2))));
  }

  function exportJson() {
    if (!result) return;
    const json = JSON.stringify(result.artwork, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.artwork.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void navigator.clipboard?.writeText(json).then(
      () => setCopied(true),
      () => {}
    );
  }

  // CSS size for previews: scale up to fill the cap while staying crisp.
  const previewCss = (w: number, h: number) => {
    const scale = Math.max(1, Math.floor(MAX_PREVIEW_PX / Math.max(w, h)));
    return { width: w * scale, height: h * scale };
  };

  const stageScale = Math.max(
    1,
    Math.floor(MAX_STAGE_PX / Math.max(canvasWidth, canvasHeight))
  );

  return (
    <section className="admin-card">
      <h3 className="admin-card__heading">IMAGE → ARTWORK</h3>
      <p className="admin-card__note">
        Convert a PNG, transparent PNG, JPG, WebP, or SVG into an Artwork
        bounded by this season&apos;s {canvasWidth}×{canvasHeight} canvas and{" "}
        {palette.length}-color palette. Contain mode keeps the whole image
        visible; transparent pixels stay untouched.
      </p>

      <label className="admin-field admin-field--wide">
        <span>Source image</span>
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      {error && (
        <div className="tx-button__error" role="alert">
          <strong>Could not load image</strong>
          <span>{error}</span>
        </div>
      )}

      {src && result && (
        <>
          <div className="img-conv__controls">
            <label className="admin-field">
              <span>Width (cells)</span>
              <input
                type="number"
                min={1}
                max={canvasWidth}
                value={width}
                onChange={(e) =>
                  setWidth(
                    Math.max(1, Math.min(canvasWidth, Number(e.target.value)))
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span>Height (cells)</span>
              <input
                type="number"
                min={1}
                max={canvasHeight}
                value={effectiveHeight}
                disabled={aspectLock}
                onChange={(e) =>
                  setHeight(
                    Math.max(1, Math.min(canvasHeight, Number(e.target.value)))
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span>Position X</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, canvasWidth - result.artwork.width)}
                value={x}
                onChange={(e) =>
                  setX(
                    Math.max(
                      0,
                      Math.min(
                        canvasWidth - result.artwork.width,
                        Number(e.target.value)
                      )
                    )
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span>Position Y</span>
              <input
                type="number"
                min={0}
                max={Math.max(0, canvasHeight - result.artwork.height)}
                value={y}
                onChange={(e) =>
                  setY(
                    Math.max(
                      0,
                      Math.min(
                        canvasHeight - result.artwork.height,
                        Number(e.target.value)
                      )
                    )
                  )
                }
              />
            </label>
            <label className="admin-field">
              <span>Fit</span>
              <select
                className="admin-select"
                value={fit}
                onChange={(e) => setFit(e.target.value as "contain" | "crop")}
              >
                <option value="contain">Contain (no crop)</option>
                <option value="crop">Crop to fill</option>
              </select>
            </label>
            <label className="admin-field">
              <span>Lock aspect ratio</span>
              <input
                type="checkbox"
                checked={aspectLock}
                onChange={(e) => setAspectLock(e.target.checked)}
              />
            </label>
            <label className="admin-field admin-field--wide">
              <span>Transparency threshold — alpha &lt; {alphaThreshold}</span>
              <input
                type="range"
                min={0}
                max={255}
                value={alphaThreshold}
                onChange={(e) => setAlphaThreshold(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="img-conv__previews">
            <figure className="img-conv__fig">
              <figcaption>Original</figcaption>
              {originalUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={originalUrl}
                  alt="Original"
                  className="img-conv__original"
                />
              )}
            </figure>
            <figure className="img-conv__fig">
              <figcaption>Converted</figcaption>
              <canvas
                ref={previewRef}
                className="img-conv__pixel"
                style={previewCss(result.artwork.width, result.artwork.height)}
              />
            </figure>
          </div>

          <figure className="img-conv__fig">
            <figcaption>
              Placement on canvas — click to position ({result.artwork.x},{" "}
              {result.artwork.y})
            </figcaption>
            <div
              ref={stageRef}
              className="img-conv__stage"
              style={{
                width: canvasWidth * stageScale,
                height: canvasHeight * stageScale,
              }}
              onClick={placeFromClick}
              role="button"
              tabIndex={0}
              aria-label="Canvas placement — click to position the artwork"
            >
              <canvas
                ref={layoutRef}
                className="img-conv__pixel img-conv__layoutcanvas"
              />
              <div
                className="img-conv__bbox"
                style={{
                  left: `${(result.artwork.x / canvasWidth) * 100}%`,
                  top: `${(result.artwork.y / canvasHeight) * 100}%`,
                  width: `${(result.artwork.width / canvasWidth) * 100}%`,
                  height: `${(result.artwork.height / canvasHeight) * 100}%`,
                }}
              />
            </div>
          </figure>

          <dl className="img-conv__stats">
            <dt>Target size</dt>
            <dd>
              {result.artwork.width} × {result.artwork.height} cells
            </dd>
            <dt>Target pixels</dt>
            <dd>{result.targetPixelCount.toLocaleString()}</dd>
            <dt>Placement</dt>
            <dd>
              ({result.artwork.x}, {result.artwork.y}) — top-left cell; X grows
              right, Y grows down
            </dd>
          </dl>

          <button className="canvas-btn" onClick={exportJson}>
            Export Artwork JSON
          </button>
          {copied && <span className="admin-ok">Exported + copied ✓</span>}
        </>
      )}
    </section>
  );
}
