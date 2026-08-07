export type Camera = { scale: number; offsetX: number; offsetY: number };
export type Viewport = { width: number; height: number };
export type CanvasSize = { width: number; height: number };
export type Point = { x: number; y: number };

/** Default zoom bounds, in screen pixels per canvas cell. */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 40;
/** Show the pixel grid only when a cell is at least this many screen px. */
export const GRID_SCALE_THRESHOLD = 8;

export function clampScale(
  scale: number,
  min = MIN_SCALE,
  max = MAX_SCALE
): number {
  if (!(min <= max))
    throw new RangeError(`min (${min}) must be <= max (${max})`);
  return Math.min(max, Math.max(min, scale));
}

export function fitScale(vp: Viewport, canvas: CanvasSize): number {
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError("canvas dimensions must be positive");
  }
  return Math.min(vp.width / canvas.width, vp.height / canvas.height);
}

/** Camera that fits the canvas fully and centers it in the viewport. */
export function fitCamera(vp: Viewport, canvas: CanvasSize): Camera {
  const scale = fitScale(vp, canvas);
  return centerCamera(scale, vp, canvas);
}

/** Camera at a given scale, centered in the viewport. */
export function centerCamera(
  scale: number,
  vp: Viewport,
  canvas: CanvasSize
): Camera {
  return {
    scale,
    offsetX: (vp.width - canvas.width * scale) / 2,
    offsetY: (vp.height - canvas.height * scale) / 2,
  };
}

/** Screen point -> fractional canvas coordinate (not floored). */
export function screenToCanvas(cam: Camera, sx: number, sy: number): Point {
  return {
    x: (sx - cam.offsetX) / cam.scale,
    y: (sy - cam.offsetY) / cam.scale,
  };
}

/**
 * Screen point -> integer canvas cell, or null if the point falls outside the
 * canvas bounds. Flooring maps any point inside a cell to that cell.
 */
export function screenToCell(
  cam: Camera,
  sx: number,
  sy: number,
  canvas: CanvasSize
): Point | null {
  const p = screenToCanvas(cam, sx, sy);
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { x, y };
}

/** Canvas cell (x, y) -> screen coordinate of its top-left corner. */
export function cellToScreen(cam: Camera, x: number, y: number): Point {
  return { x: cam.offsetX + x * cam.scale, y: cam.offsetY + y * cam.scale };
}

export function zoomAt(
  cam: Camera,
  factor: number,
  anchorX: number,
  anchorY: number,
  min = MIN_SCALE,
  max = MAX_SCALE
): Camera {
  const newScale = clampScale(cam.scale * factor, min, max);
  if (newScale === cam.scale) return cam;
  // Canvas coordinate under the anchor before zooming must stay under it after.
  const canvasPt = screenToCanvas(cam, anchorX, anchorY);
  return {
    scale: newScale,
    offsetX: anchorX - canvasPt.x * newScale,
    offsetY: anchorY - canvasPt.y * newScale,
  };
}

/** Translate the camera by a screen-space delta (e.g. a mouse drag). */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy };
}

export function clampOffset(
  cam: Camera,
  vp: Viewport,
  canvas: CanvasSize,
  margin = 24
): Camera {
  const spanX = canvas.width * cam.scale;
  const spanY = canvas.height * cam.scale;
  const m = Math.min(margin, spanX, spanY);
  const clamp = (offset: number, span: number, viewport: number) => {
    // offset ranges so that [offset, offset+span] overlaps [0, viewport] by >= m.
    const minOffset = m - span; // canvas mostly to the left
    const maxOffset = viewport - m; // canvas mostly to the right
    return Math.min(maxOffset, Math.max(minOffset, offset));
  };
  return {
    scale: cam.scale,
    offsetX: clamp(cam.offsetX, spanX, vp.width),
    offsetY: clamp(cam.offsetY, spanY, vp.height),
  };
}

export function shouldShowGrid(
  scale: number,
  threshold = GRID_SCALE_THRESHOLD
): boolean {
  return scale >= threshold;
}
