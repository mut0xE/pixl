// Byte size of a Canvas account; must match `state.rs`.
export function canvasAccountSpace(width: number, height: number): number {
  assertUint("width", width);
  assertUint("height", height);
  return 8 + 32 + 2 + 2 + 4 + width * height + 1;
}

// 10 MiB hard ceiling on a canvas account; 10 KiB is the max a program-touched
// tx can grow an account, gating whether create + start_season fit in one tx.
export const MAX_PERMITTED_DATA_LENGTH = 10 * 1024 * 1024;
export const SINGLE_TX_CANVAS_MAX_BYTES = 10 * 1024;

// True when create + start_season can share a single transaction.
export function canvasFitsSingleTx(width: number, height: number): boolean {
  return canvasAccountSpace(width, height) <= SINGLE_TX_CANVAS_MAX_BYTES;
}

export function toCanvasIndex(x: number, y: number, width: number): number {
  assertUint("x", x);
  assertUint("y", y);
  assertUint("width", width);
  if (width === 0) {
    throw new RangeError("width must be greater than zero");
  }
  if (x >= width) {
    throw new RangeError(`x (${x}) must be less than width (${width})`);
  }
  return y * width + x;
}

export function fromCanvasIndex(
  index: number,
  width: number
): { x: number; y: number } {
  assertUint("index", index);
  assertUint("width", width);
  if (width === 0) {
    throw new RangeError("width must be greater than zero");
  }
  return { x: index % width, y: Math.floor(index / width) };
}

export type Rgba = { r: number; g: number; b: number; a: number };

export function rgbaToU32({ r, g, b, a }: Rgba): number {
  for (const [name, value] of [
    ["r", r],
    ["g", g],
    ["b", b],
    ["a", a],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError(`${name} channel must be a byte (0-255): ${value}`);
    }
  }
  // `>>> 0` coerces the result back into an unsigned 32-bit integer.
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function u32ToRgba(color: number): Rgba {
  assertUint("color", color);
  if (color > 0xffffffff) {
    throw new RangeError(`color must fit in a u32: ${color}`);
  }
  return {
    r: (color >>> 24) & 0xff,
    g: (color >>> 16) & 0xff,
    b: (color >>> 8) & 0xff,
    a: color & 0xff,
  };
}

export function u32ToHex(color: number): string {
  const { r, g, b, a } = u32ToRgba(color);
  const byte = (c: number) => (c < 16 ? "0" : "") + c.toString(16);
  return "#" + [r, g, b, a].map(byte).join("");
}

export function hexToU32(hex: string): number {
  const cleaned = hex.startsWith("#") ? hex.slice(1) : hex;
  if (cleaned.length !== 6 && cleaned.length !== 8) {
    throw new RangeError(`hex must be #RRGGBB or #RRGGBBAA: ${hex}`);
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new RangeError(`hex contains non-hex characters: ${hex}`);
  }
  const rgb = cleaned.slice(0, 6);
  const a = cleaned.length === 8 ? cleaned.slice(6, 8) : "ff";
  return parseInt(rgb + a, 16) >>> 0;
}

function assertUint(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer: ${value}`);
  }
}
