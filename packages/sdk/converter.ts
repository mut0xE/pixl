/**
 * Image -> Artwork converter.
 *
 * A pure, DOM-free function that turns raw RGBA pixel data into a season
 * {@link Artwork} (a row-major grid of palette indexes with
 * {@link TRANSPARENT_INDEX} for untouched cells). The admin UI decodes an image
 * to {@link SourceImage} via a `<canvas>` and calls {@link convertImageToArtwork};
 * unit tests exercise the same function against synthetic pixel data.
 *
 * Pipeline: fit (contain/crop) -> area-average downsample -> alpha threshold ->
 * nearest palette color (weighted RGB). The artwork is clamped to the season's
 * live canvas bounds. Already-painted canvas pixels are not consulted.
 */

import { TRANSPARENT_INDEX, type Artwork } from "./blueprint";
import { u32ToRgba, type Rgba } from "./canvas";

/** Raw decoded image: RGBA, row-major, `data.length === width * height * 4`. */
export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Options controlling a single conversion. */
export interface ConvertOptions {
  /** Season palette, packed u32 `0xRRGGBBAA`. */
  palette: number[];
  /** Live canvas bounds; the artwork is clamped to fit. */
  canvasWidth: number;
  canvasHeight: number;
  /** Artwork width in cells. Defaults to fit the canvas. */
  targetWidth?: number;
  /** Artwork height in cells. Defaults to the aspect-preserving value. */
  targetHeight?: number;
  /** Placement on the canvas (cells). Defaults to 0,0; clamped to fit. */
  x?: number;
  y?: number;
  /** `"contain"` (default) preserves aspect with transparent margins; `"crop"` fills. */
  fit?: "contain" | "crop";
  /** Averaged alpha below this becomes transparent. Default 128. */
  alphaThreshold?: number;
  id: string;
  name: string;
}

/** Result of a conversion. */
export interface ConvertResult {
  /** Ready for `blueprint.ts` / JSON export. */
  artwork: Artwork;
  /** Number of non-transparent target cells. */
  targetPixelCount: number;
  /** Quantized preview buffer, `width * height * 4` RGBA (transparent = alpha 0). */
  previewRgba: Uint8ClampedArray;
}

const DEFAULT_ALPHA_THRESHOLD = 128;

/** Aspect-preserving height for a chosen width. Never returns 0. */
export function deriveHeight(
  srcW: number,
  srcH: number,
  targetW: number
): number {
  if (srcW <= 0) return 1;
  return Math.max(1, Math.round((targetW * srcH) / srcW));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// Weighted-RGB ("redmean") squared distance between two opaque colors.
function colorDistance(a: Rgba, b: Rgba): number {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (
    (((512 + rmean) * dr * dr) >> 8) +
    4 * dg * dg +
    (((767 - rmean) * db * db) >> 8)
  );
}

function nearestPaletteIndex(color: Rgba, palette: Rgba[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = colorDistance(color, palette[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Straight (non-premultiplied) average of the source over [sx0,sx1) x [sy0,sy1). */
function averageRegion(
  src: SourceImage,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number
): Rgba {
  let r = 0,
    g = 0,
    b = 0,
    a = 0,
    n = 0;
  const x0 = Math.max(0, Math.floor(sx0));
  const y0 = Math.max(0, Math.floor(sy0));
  const x1 = Math.min(src.width, Math.ceil(sx1));
  const y1 = Math.min(src.height, Math.ceil(sy1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4;
      r += src.data[i];
      g += src.data[i + 1];
      b += src.data[i + 2];
      a += src.data[i + 3];
      n++;
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: r / n, g: g / n, b: b / n, a: a / n };
}

/** Convert a decoded image into a canvas-bounded {@link Artwork}. */
export function convertImageToArtwork(
  src: SourceImage,
  opts: ConvertOptions
): ConvertResult {
  const { palette, canvasWidth, canvasHeight } = opts;
  const fit = opts.fit ?? "contain";
  const alphaThreshold = opts.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;

  // Resolve target size, clamped to the canvas.
  const width = clampInt(
    opts.targetWidth ?? Math.min(src.width, canvasWidth),
    1,
    canvasWidth
  );
  const rawHeight =
    opts.targetHeight ?? deriveHeight(src.width, src.height, width);
  const height = clampInt(rawHeight, 1, canvasHeight);

  // Clamp origin so the artwork stays fully in bounds.
  const x = clampInt(opts.x ?? 0, 0, canvasWidth - width);
  const y = clampInt(opts.y ?? 0, 0, canvasHeight - height);

  const paletteRgba = palette.map(u32ToRgba);

  // Fit maths: contain scales to fit inside (margins), crop scales to cover.
  const scaleContain = Math.min(width / src.width, height / src.height);
  const scaleCover = Math.max(width / src.width, height / src.height);
  const scale = fit === "crop" ? scaleCover : scaleContain;
  const drawW = src.width * scale;
  const drawH = src.height * scale;
  const offsetX = (width - drawW) / 2; // target-space top-left of the image
  const offsetY = (height - drawH) / 2;

  const pixels = new Array<number>(width * height);
  const preview = new Uint8ClampedArray(width * height * 4);
  let targetPixelCount = 0;

  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const idx = ty * width + tx;
      // Source rectangle covered by this target cell.
      const sx0 = (tx - offsetX) / scale;
      const sy0 = (ty - offsetY) / scale;
      const sx1 = (tx + 1 - offsetX) / scale;
      const sy1 = (ty + 1 - offsetY) / scale;

      // Fully outside the image (contain margins) => transparent.
      if (sx1 <= 0 || sy1 <= 0 || sx0 >= src.width || sy0 >= src.height) {
        pixels[idx] = TRANSPARENT_INDEX;
        continue;
      }

      const avg = averageRegion(src, sx0, sy0, sx1, sy1);
      if (avg.a < alphaThreshold) {
        pixels[idx] = TRANSPARENT_INDEX;
        continue;
      }

      const pi = nearestPaletteIndex(avg, paletteRgba);
      pixels[idx] = pi;
      targetPixelCount++;
      const c = paletteRgba[pi];
      preview[idx * 4] = c.r;
      preview[idx * 4 + 1] = c.g;
      preview[idx * 4 + 2] = c.b;
      preview[idx * 4 + 3] = 255;
    }
  }

  const artwork: Artwork = {
    id: opts.id,
    name: opts.name,
    x,
    y,
    width,
    height,
    transparentIndex: TRANSPARENT_INDEX,
    pixels,
  };

  return { artwork, targetPixelCount, previewRgba: preview };
}
