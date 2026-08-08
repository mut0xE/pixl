# Image Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an arbitrary image into a season `Artwork` (palette-mapped pixel grid) bounded by the season's live canvas, with an admin UI and JSON export.

**Architecture:** A DOM-free pure core in the SDK (`convertImageToArtwork`) operates on raw RGBA and the season palette/canvas bounds; a thin React admin component decodes the image via `<canvas>`, drives previews, and exports JSON.

**Tech Stack:** TypeScript, ts-mocha + chai (SDK unit tests), Next.js/React (admin UI), existing `packages/sdk/blueprint.ts` + `canvas.ts` helpers.

## Global Constraints

- Inputs: PNG, transparent PNG, JPG. Any dimensions (wide/tall/square).
- Palette colors are packed u32 `0xRRGGBBAA` (use `u32ToRgba` from `canvas.ts`).
- Transparent cell value = `TRANSPARENT_INDEX` (255) from `blueprint.ts`.
- Contain is default; crop only when explicitly chosen. Never crop otherwise.
- Downsample = area-average (RGB + alpha). Nearest color = weighted-RGB (redmean).
- Alpha threshold: averaged alpha `< threshold` => transparent.
- Canvas-aware, **size only**: clamp artwork to season canvas bounds; ignore painted pixels.
- SDK core must be DOM-free (testable in Node).

---

### Task 1: Pure converter core + tests

**Files:**
- Create: `packages/sdk/converter.ts`
- Test: `packages/sdk/converter.unit.test.ts`
- Modify: `packages/sdk/index.ts` (add `export * from "./converter";`)

**Interfaces:**
- Consumes: `TRANSPARENT_INDEX`, `Artwork`, `validateArtwork` from `./blueprint`; `u32ToRgba` from `./canvas`.
- Produces:
  - `interface SourceImage { width: number; height: number; data: Uint8ClampedArray }`
  - `interface ConvertOptions { palette: number[]; canvasWidth: number; canvasHeight: number; targetWidth?: number; targetHeight?: number; x?: number; y?: number; fit?: "contain" | "crop"; alphaThreshold?: number; id: string; name: string }`
  - `interface ConvertResult { artwork: Artwork; targetPixelCount: number; previewRgba: Uint8ClampedArray }`
  - `function deriveHeight(srcW: number, srcH: number, targetW: number): number`
  - `function convertImageToArtwork(src: SourceImage, opts: ConvertOptions): ConvertResult`

- [ ] **Step 1: Write failing tests**

```ts
// packages/sdk/converter.unit.test.ts
import { expect } from "chai";
import { convertImageToArtwork, deriveHeight, type SourceImage } from "./converter";
import { TRANSPARENT_INDEX, validateArtwork } from "./blueprint";

// Palette: 0=black, 1=white, 2=red. Packed 0xRRGGBBAA.
const PALETTE = [0x000000ff, 0xffffffff, 0xff0000ff];

/** Build a solid RGBA image. */
function solid(w: number, h: number, r: number, g: number, b: number, a = 255): SourceImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width: w, height: h, data };
}

const base = { palette: PALETTE, canvasWidth: 64, canvasHeight: 64, id: "a", name: "a" };

describe("deriveHeight", () => {
  it("scales height by aspect ratio", () => {
    expect(deriveHeight(4, 1, 8)).to.equal(2);
    expect(deriveHeight(1, 1, 8)).to.equal(8);
    expect(deriveHeight(3, 7, 6)).to.equal(14);
  });
  it("never returns 0", () => {
    expect(deriveHeight(100, 1, 4)).to.equal(1);
  });
});

describe("convertImageToArtwork", () => {
  it("square image fills target with no transparent padding", () => {
    const { artwork, targetPixelCount } = convertImageToArtwork(solid(8, 8, 255, 0, 0), {
      ...base, targetWidth: 8, fit: "contain",
    });
    expect(artwork.width).to.equal(8);
    expect(artwork.height).to.equal(8);
    expect(targetPixelCount).to.equal(64);
    expect(artwork.pixels.every((p) => p === 2)).to.equal(true); // red index
  });

  it("wide image contained into square target pads top/bottom transparent", () => {
    // 4x1 red -> targetWidth 8 => derived height 2, canvas leaves rest transparent.
    // Force square target via explicit targetHeight to test padding.
    const { artwork } = convertImageToArtwork(solid(4, 1, 255, 0, 0), {
      ...base, targetWidth: 8, targetHeight: 8, fit: "contain",
    });
    expect(artwork.width).to.equal(8);
    expect(artwork.height).to.equal(8);
    // Middle rows (3 or 4) contain the red band; top & bottom rows transparent.
    const row = (y: number) => artwork.pixels.slice(y * 8, y * 8 + 8);
    expect(row(0).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(row(7).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(row(3).some((p) => p === 2) || row(4).some((p) => p === 2)).to.equal(true);
  });

  it("tall image contained into square target pads left/right transparent", () => {
    const { artwork } = convertImageToArtwork(solid(1, 4, 255, 0, 0), {
      ...base, targetWidth: 8, targetHeight: 8, fit: "contain",
    });
    const col = (x: number) => artwork.pixels.filter((_, i) => i % 8 === x);
    expect(col(0).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(col(7).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
  });

  it("respects alpha threshold -> transparent cells", () => {
    const { artwork, targetPixelCount } = convertImageToArtwork(solid(4, 4, 255, 0, 0, 100), {
      ...base, targetWidth: 4, alphaThreshold: 128,
    });
    expect(artwork.pixels.every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(targetPixelCount).to.equal(0);
  });

  it("maps visible pixels to nearest palette color", () => {
    // Near-white -> index 1
    const { artwork } = convertImageToArtwork(solid(2, 2, 250, 250, 250), {
      ...base, targetWidth: 2,
    });
    expect(artwork.pixels.every((p) => p === 1)).to.equal(true);
  });

  it("clamps oversized target and origin to canvas bounds and validates", () => {
    const { artwork } = convertImageToArtwork(solid(8, 8, 255, 0, 0), {
      ...base, canvasWidth: 10, canvasHeight: 10, targetWidth: 999, x: 999, y: 999,
    });
    expect(artwork.x + artwork.width).to.be.at.most(10);
    expect(artwork.y + artwork.height).to.be.at.most(10);
    validateArtwork(artwork, 10, 10, PALETTE.length); // throws if invalid
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `yarn test:sdk`
Expected: FAIL (`converter` module / `convertImageToArtwork` not found).

- [ ] **Step 3: Implement `packages/sdk/converter.ts`**

```ts
import { TRANSPARENT_INDEX, type Artwork } from "./blueprint";
import { u32ToRgba } from "./canvas";

export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA row-major, length = width*height*4
}

export interface ConvertOptions {
  palette: number[];
  canvasWidth: number;
  canvasHeight: number;
  targetWidth?: number;
  targetHeight?: number;
  x?: number;
  y?: number;
  fit?: "contain" | "crop";
  alphaThreshold?: number;
  id: string;
  name: string;
}

export interface ConvertResult {
  artwork: Artwork;
  targetPixelCount: number;
  previewRgba: Uint8ClampedArray;
}

const DEFAULT_ALPHA_THRESHOLD = 128;

export function deriveHeight(srcW: number, srcH: number, targetW: number): number {
  if (srcW <= 0) return 1;
  return Math.max(1, Math.round((targetW * srcH) / srcW));
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

type Rgba = { r: number; g: number; b: number; a: number };

// Weighted-RGB (redmean) squared distance between two opaque colors.
function colorDistance(a: Rgba, b: Rgba): number {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8);
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

/**
 * Average the source RGBA over the rectangle [sx0,sx1) x [sy0,sy1).
 * Returns straight (non-premultiplied) average; alpha averaged independently.
 */
function averageRegion(
  src: SourceImage,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
): Rgba {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
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

export function convertImageToArtwork(
  src: SourceImage,
  opts: ConvertOptions,
): ConvertResult {
  const { palette, canvasWidth, canvasHeight } = opts;
  const fit = opts.fit ?? "contain";
  const alphaThreshold = opts.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;

  // Resolve target size, clamped to canvas.
  const width = clampInt(opts.targetWidth ?? Math.min(src.width, canvasWidth), 1, canvasWidth);
  const rawHeight = opts.targetHeight ?? deriveHeight(src.width, src.height, width);
  const height = clampInt(rawHeight, 1, canvasHeight);

  // Clamp origin so the artwork stays fully in bounds.
  const x = clampInt(opts.x ?? 0, 0, canvasWidth - width);
  const y = clampInt(opts.y ?? 0, 0, canvasHeight - height);

  const paletteRgba = palette.map(u32ToRgba);

  // Fit maths: map each target cell to a source rectangle.
  // contain: whole image scaled to fit inside width x height, centered, margins transparent.
  // crop: image scaled to cover width x height, centered, overflow cropped.
  const scaleContain = Math.min(width / src.width, height / src.height);
  const scaleCover = Math.max(width / src.width, height / src.height);
  const scale = fit === "crop" ? scaleCover : scaleContain;
  const drawW = src.width * scale;
  const drawH = src.height * scale;
  const offsetX = (width - drawW) / 2; // target-space offset of image top-left
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
```

- [ ] **Step 4: Export from SDK barrel**

Add to `packages/sdk/index.ts`: `export * from "./converter";`

- [ ] **Step 5: Run tests, verify pass**

Run: `yarn test:sdk`
Expected: PASS (all converter + existing tests green).

- [ ] **Step 6: Typecheck & format**

Run: `yarn typecheck && yarn format`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/converter.ts packages/sdk/converter.unit.test.ts packages/sdk/index.ts
git commit -m "feat(sdk): image-to-artwork converter core"
```

---

### Task 2: Admin image converter UI

**Files:**
- Create: `app/web/components/admin/ImageConverter.tsx`
- Modify: `app/web/components/admin/SeasonManage.tsx` (mount the converter for a season, passing canvas dims + palette)

**Interfaces:**
- Consumes: `convertImageToArtwork`, `type SourceImage`, `type ConvertResult`, `deriveHeight` from `packages/sdk`; `useCanvasData` (`width`, `height`, `palette`) already used in `SeasonManage`.
- Produces: `<ImageConverter canvasWidth height palette seasonId />` React component. No new exports consumed by other tasks.

- [ ] **Step 1: Implement `ImageConverter.tsx`**

Component responsibilities (client component, `"use client"`):
- `<input type="file" accept=".png,.jpg,.jpeg">`; on change, decode via an offscreen `HTMLCanvasElement` + `getImageData` into `SourceImage`; keep an object URL for the original preview.
- State: `targetWidth`, `posX`, `posY`, `fit` (`"contain" | "crop"`), `alphaThreshold`, `aspectLock` (bool).
- When `aspectLock`, height is `deriveHeight(src.width, src.height, targetWidth)`; else expose a `targetHeight` input.
- Clamp inputs to `[0, canvasWidth]` / `[0, canvasHeight]` in the UI (core also clamps defensively).
- `useMemo` -> call `convertImageToArtwork(src, { palette, canvasWidth, canvasHeight, targetWidth, targetHeight?, x, y, fit, alphaThreshold, id: \`art-${seasonId}\`, name })`.
- Render **original preview** (the `<img>` from object URL) and **converted preview**: paint `result.previewRgba` onto a small `<canvas>` at cell resolution, CSS-scaled up with `image-rendering: pixelated`.
- Show **target pixel count** = `result.targetPixelCount` and the resolved `width x height`.
- **Export Artwork JSON** button: `JSON.stringify(result.artwork, null, 2)`, trigger a download (`Blob` + anchor) and copy-to-clipboard.

Use existing admin styling classes/patterns from sibling components (e.g. `AdminShell`, form field styles in `CreateSeasonForm`/`DateTimeField`) — match, don't invent a new design system. Follow the repo's `<frontend_aesthetics>` guidance for any new styling: distinctive, not generic.

- [ ] **Step 2: Mount in `SeasonManage.tsx`**

Read `SeasonManage.tsx` first. Where it already has `useCanvasData`, render `<ImageConverter canvasWidth={canvas.width} canvasHeight={canvas.height} palette={canvas.palette} seasonId={canvas.seasonId} />` inside a titled panel/section consistent with the existing manage layout.

- [ ] **Step 3: Typecheck the web app**

Run: `yarn --cwd app/web typecheck`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `yarn web:dev`, open a season's manage page, load a wide/tall/transparent PNG and the Solana logo; confirm contain keeps the full logo+text visible, previews render, pixel count updates, JSON exports.

- [ ] **Step 5: Format & commit**

```bash
yarn format
git add app/web/components/admin/ImageConverter.tsx app/web/components/admin/SeasonManage.tsx
git commit -m "feat(web): admin image-to-artwork converter"
```

---

## Self-Review

- Spec coverage: PNG/JPG/transparent input (Task 2 file input, Task 1 alpha handling) ✓; contain default + no crop (core `fit`) ✓; aspect-preserve + auto height (`deriveHeight`, contain fit) ✓; clamp to canvas (Task 1 clamp test) ✓; pixel-art preview (Task 2 pixelated canvas) ✓; preserve transparency (alpha threshold) ✓; nearest palette (weighted RGB) ✓; admin width/x/y controls (Task 2) ✓; original + converted preview (Task 2) ✓; target pixel count (both) ✓; manual threshold (Task 2 slider) ✓; JSON export (Task 2) ✓; tests wide/tall/square/transparent (Task 1) ✓; canvas-aware size-only (Task 1 opts + Task 2 useCanvasData) ✓.
- Placeholder scan: none.
- Type consistency: `SourceImage`/`ConvertOptions`/`ConvertResult`/`convertImageToArtwork`/`deriveHeight` consistent across tasks.
