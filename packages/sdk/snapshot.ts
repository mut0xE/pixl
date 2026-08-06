// Canvas snapshot export (pure).
//
// Turns a decoded canvas (palette-index grid + season palette) into a portable,
// reproducible JSON snapshot and resolves each pixel to an RGBA color. The
// actual PNG rasterization needs a DOM canvas and lives in the web app
// (`app/web/lib/exportSnapshot.ts`); everything here is pure and unit-tested.

import { u32ToRgba, type Rgba } from "./canvas";

export type CanvasSnapshot = {
  width: number;
  height: number;
  /** Season palette as packed u32 RRGGBBAA values. */
  palette: number[];
  /** Row-major palette indices, one byte per pixel (`y * width + x`). */
  indices: number[];
};

/** Resolve a single palette index to RGBA; out-of-range indices are transparent. */
export function paletteIndexToRgba(palette: number[], index: number): Rgba {
  const color = palette[index];
  if (color === undefined) return { r: 0, g: 0, b: 0, a: 0 };
  return u32ToRgba(color);
}

/**
 * Build the portable snapshot object. Validates that the index grid matches
 * `width * height` so a malformed export fails loudly instead of silently
 * truncating.
 */
export function canvasToSnapshot(input: {
  width: number;
  height: number;
  palette: number[];
  pixels: number[];
}): CanvasSnapshot {
  const { width, height, palette, pixels } = input;
  const expected = width * height;
  if (pixels.length !== expected) {
    throw new RangeError(
      `pixel count ${pixels.length} does not match ${width}x${height} (${expected})`
    );
  }
  return { width, height, palette: [...palette], indices: [...pixels] };
}

/** Flat RGBA byte buffer (length `width*height*4`) for `ImageData`. */
export function snapshotToRgbaBytes(snap: CanvasSnapshot): Uint8ClampedArray {
  const out = new Uint8ClampedArray(snap.width * snap.height * 4);
  for (let i = 0; i < snap.indices.length; i++) {
    const { r, g, b, a } = paletteIndexToRgba(snap.palette, snap.indices[i]);
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return out;
}

/** Pretty-printed JSON string for download. */
export function snapshotToJson(snap: CanvasSnapshot): string {
  return JSON.stringify(snap, null, 2);
}
