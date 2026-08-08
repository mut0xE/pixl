# Image → Blueprint Artwork Converter

## Goal

An admin tool that turns an arbitrary image (PNG, transparent PNG, JPG) into a
season **Artwork** (see `packages/sdk/blueprint.ts`): a row-major grid of palette
indexes with `255` (`TRANSPARENT_INDEX`) for untouched cells, positioned at
`x,y` on the canvas. Output is exported as JSON. Scope stops at conversion +
JSON export — no on-chain upload, no multi-artwork blueprint assembly.

## Key decisions

- **Canvas-aware, size only.** The converter uses the season's *live* canvas
  dimensions and palette as bounds. It does **not** read already-painted pixels.
- **Pure core + thin UI.** Conversion logic is a DOM-free function in the SDK so
  it is testable in Node against synthetic RGBA data. The React component only
  decodes the image and renders previews.
- **Contain by default.** The whole image is scaled into the target box
  preserving aspect ratio; empty margins become transparent. Never crop unless
  the admin explicitly selects crop mode. Guarantees e.g. the full Solana
  logo+text stays visible.
- **Area-average downsample.** Each target cell = box-filter average of the
  source pixels under it (RGB and alpha averaged).
- **Alpha threshold.** A cell whose averaged alpha `< alphaThreshold` becomes
  `TRANSPARENT_INDEX`; at/above it maps to nearest palette color. JPGs (opaque)
  stay fully visible.
- **Weighted-RGB (redmean) nearest-color** quantization to the season palette.

## Unit 1 — Pure core: `packages/sdk/converter.ts`

```ts
export interface SourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, row-major, length = width*height*4
}

export interface ConvertOptions {
  palette: number[];        // season palette, packed u32 0xRRGGBBAA
  canvasWidth: number;      // season's live canvas bounds
  canvasHeight: number;
  targetWidth?: number;     // admin-chosen; defaults to fit canvas
  targetHeight?: number;    // omitted => derived from source aspect ratio
  x?: number; y?: number;   // placement; default 0,0; clamped to fit
  fit?: "contain" | "crop"; // default "contain"
  alphaThreshold?: number;  // 0..255, default e.g. 128
  id: string;
  name: string;
}

export interface ConvertResult {
  artwork: Artwork;                 // ready for blueprint.ts / JSON export
  targetPixelCount: number;         // non-transparent cells
  previewRgba: Uint8ClampedArray;   // width*height*4, quantized, for preview
}

export function convertImageToArtwork(
  src: SourceImage,
  opts: ConvertOptions,
): ConvertResult;

export function deriveHeight(srcW: number, srcH: number, targetW: number): number;
```

Pipeline:

1. **Resolve bounds.** `targetWidth = clamp(opts.targetWidth ?? default, 1, canvasWidth)`.
   `targetHeight = opts.targetHeight ?? deriveHeight(...)`, clamped to `canvasHeight`.
   `x,y` clamped so `x+width ≤ canvasWidth`, `y+height ≤ canvasHeight`.
2. **Fit.** `contain`: scale whole image into `targetW×targetH` preserving
   aspect, remainder = transparent cells. `crop`: fill box, center-crop overflow.
3. **Downsample.** Area-average source region → one target cell (RGB + alpha).
4. **Threshold.** averaged alpha `< alphaThreshold` → `TRANSPARENT_INDEX`.
5. **Quantize.** visible cell → nearest palette index via weighted-RGB distance.
6. Emit `artwork` (`transparentIndex = TRANSPARENT_INDEX`), `targetPixelCount`,
   `previewRgba` (transparent cells rendered as alpha 0).

`deriveHeight(srcW, srcH, targetW) = max(1, round(targetW * srcH / srcW))`.

## Unit 2 — Thin UI: `app/web/components/admin/ImageConverter.tsx`

- File input accepting `.png,.jpg,.jpeg`. Decode via offscreen `<canvas>`
  `getImageData` → `SourceImage`.
- Reads `width`, `height`, `palette` from `useCanvasData(season)`; passes as
  `canvasWidth`/`canvasHeight`/`palette`.
- Controls: width, x, y (bounded by canvas), fit mode (contain/crop), alpha
  threshold slider, aspect-lock toggle (locks height to derived value).
- **Original preview** (raw image) + **converted preview** (render `previewRgba`
  scaled up with `image-rendering: pixelated`).
- **Target pixel count** display.
- **Export Artwork JSON** button (download + copy).

## Tests — `packages/sdk/converter.unit.test.ts` (ts-mocha + chai)

- **Wide** (e.g. 4×1) contained into square target → top/bottom transparent
  padding, full width preserved.
- **Tall** → left/right transparent padding.
- **Square** → fills exactly, no transparent padding.
- **Transparent PNG** → transparent regions become `TRANSPARENT_INDEX`; alpha
  threshold boundary respected.
- Nearest-color picks the correct palette index (weighted RGB).
- `targetPixelCount` equals non-transparent cell count; produced `artwork`
  passes `validateArtwork`.
- `deriveHeight` correctness.
- **Clamping**: `targetWidth`/`x` larger than canvas are clamped so the artwork
  stays in bounds.
