"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicKey, Keypair } from "@solana/web3.js";
import {
  fitCamera,
  zoomAt,
  panBy,
  clampOffset,
  screenToCell,
  shouldShowGrid,
  u32ToRgba,
  type Camera,
  type SessionMeta,
} from "../../../packages/sdk";
import { useCanvasData, type CanvasData } from "../lib/useCanvasData";
import { useErProgram, erExplorerTxUrl } from "../lib/er";
import { usePainting } from "../lib/usePainting";
import { PalettePicker } from "./PalettePicker";
import { PaintEnergyHud } from "./PaintEnergyHud";
import { ShareGame } from "./ShareGame";
import { CopyKey } from "./CopyKey";

// Interactive painting renderer. A 1:1 offscreen texture holds the pixel art;
// the visible canvas draws it with a camera transform (nearest-neighbor, zoom +
// pan). Authoritative pixels come from an ER subscription (via usePainting);
// optimistic paints patch single texture pixels immediately, with no rebuild
// and no whole-app refetch. A click paints; a drag pans.

const WHEEL_ZOOM_STEP = 1.15;
const BUTTON_ZOOM_STEP = 1.4;
const CLICK_SLOP = 4; // px of movement below which a mouseup counts as a click

type Tex = {
  canvas: HTMLCanvasElement;
  img: ImageData;
  ctx: CanvasRenderingContext2D;
};

/** Build a 1:1 offscreen texture from palette indices + packed colors. */
function buildTexture(pixels: number[], data: CanvasData): Tex {
  const { width, height, palette } = data;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++)
    writePixel(img, i, pixels[i], palette);
  ctx.putImageData(img, 0, 0);
  return { canvas, img, ctx };
}

function writePixel(
  img: ImageData,
  index: number,
  colorIndex: number,
  palette: number[]
) {
  const color = palette[colorIndex] ?? palette[0] ?? 0x000000ff;
  const { r, g, b, a } = u32ToRgba(color);
  const o = index * 4;
  img.data[o] = r;
  img.data[o + 1] = g;
  img.data[o + 2] = b;
  img.data[o + 3] = a;
}

export function PixlCanvas({
  seasonAddress,
  wallet = null,
  session = null,
  sessionSecret = null,
  shareable = false,
}: {
  seasonAddress: PublicKey | null;
  // Painting props — omitted for read-only historical views (SeasonBrowser).
  wallet?: PublicKey | null;
  session?: SessionMeta | null;
  sessionSecret?: Keypair | null;
  // Show a Share button in the HUD (the SeasonBrowser detail view has its own
  // Share button in the header, so it leaves this off to avoid a duplicate).
  shareable?: boolean;
}) {
  const { data, loading, error, refetch } = useCanvasData(seasonAddress);
  const erProgram = useErProgram(sessionSecret);
  const {
    selectedColor,
    setSelectedColor,
    paint,
    error: paintError,
    revision,
    drainDirty,
    colorAt,
    energy,
    maxEnergy,
    energyState,
    recentTxs,
  } = usePainting({ erProgram, data, wallet, seasonAddress, session });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const texRef = useRef<Tex | null>(null);
  const cameraRef = useRef<Camera>({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const fittedRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [zoomLabel, setZoomLabel] = useState(1);

  const paintable = Boolean(erProgram && session && data && !data.frozen);

  // Track the container size so the canvas is crisp on resize / DPR changes.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewport({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rebuild the texture and require a fresh auto-fit whenever a new snapshot
  // loads (e.g. a new season's canvas). Per-pixel updates never come through here.
  useEffect(() => {
    texRef.current = data ? buildTexture(data.pixels, data) : null;
    fittedRef.current = false;
    maybeFitAndDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Patch only the dirty pixels (optimistic paints, reverts, other players'
  // paints) into the existing texture, then redraw. No rebuild.
  useEffect(() => {
    const tex = texRef.current;
    if (!tex || !data) return;
    const dirty = drainDirty();
    if (dirty.length === 0) return;
    for (const index of dirty) {
      writePixel(tex.img, index, colorAt(index), data.palette);
      const x = index % data.width;
      const y = Math.floor(index / data.width);
      tex.ctx.putImageData(tex.img, 0, 0, x, y, 1, 1);
    }
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    maybeFitAndDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  function maybeFitAndDraw() {
    if (data && viewport.width > 0 && !fittedRef.current) {
      cameraRef.current = fitCamera(viewport, data);
      setZoomLabel(cameraRef.current.scale);
      fittedRef.current = true;
    }
    draw();
  }

  function draw() {
    const canvas = canvasRef.current;
    const tex = texRef.current;
    if (!canvas || viewport.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    if (!tex || !data) return;

    const { scale, offsetX, offsetY } = cameraRef.current;
    const w = data.width * scale;
    const h = data.height * scale;
    ctx.fillStyle = "#00000055";
    ctx.fillRect(offsetX, offsetY, w, h);
    ctx.drawImage(
      tex.canvas,
      0,
      0,
      data.width,
      data.height,
      offsetX,
      offsetY,
      w,
      h
    );

    if (shouldShowGrid(scale)) {
      ctx.strokeStyle = "#ffffff14";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= data.width; x++) {
        const px = Math.round(offsetX + x * scale) + 0.5;
        ctx.moveTo(px, offsetY);
        ctx.lineTo(px, offsetY + h);
      }
      for (let y = 0; y <= data.height; y++) {
        const py = Math.round(offsetY + y * scale) + 0.5;
        ctx.moveTo(offsetX, py);
        ctx.lineTo(offsetX + w, py);
      }
      ctx.stroke();
    }

    // The hovered cell is rendered as a DOM overlay (see `paint-cursor` below)
    // so it can carry the live color preview + energy readout.
  }

  function applyCamera(next: Camera) {
    if (!data) return;
    cameraRef.current = clampOffset(next, viewport, data);
    setZoomLabel(cameraRef.current.scale);
    draw();
  }

  function localPoint(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Wheel-to-zoom needs preventDefault to stop the page scrolling, but React
  // attaches wheel handlers as passive (where preventDefault is a no-op and
  // logs a console error). Bind a native non-passive listener instead.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!data) return;
      e.preventDefault();
      const { x, y } = localPoint(e);
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      applyCamera(zoomAt(cameraRef.current, factor, x, y));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, viewport.width, viewport.height]);

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!data) return;
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP)
        movedRef.current = true;
      dragRef.current = { x: e.clientX, y: e.clientY };
      applyCamera(panBy(cameraRef.current, dx, dy));
    }
    const { x, y } = localPoint(e);
    setHover(screenToCell(cameraRef.current, x, y, data));
  }
  function onMouseUp(e: React.MouseEvent) {
    const wasDragging = dragRef.current !== null;
    const moved = movedRef.current;
    dragRef.current = null;
    if (!data || !wasDragging || moved || !paintable) return;
    const { x, y } = localPoint(e);
    const cell = screenToCell(cameraRef.current, x, y, data);
    if (cell) void paint(cell.x, cell.y);
  }
  function endDrag() {
    dragRef.current = null;
  }

  function zoomButton(factor: number) {
    applyCamera(
      zoomAt(cameraRef.current, factor, viewport.width / 2, viewport.height / 2)
    );
  }
  function resetView() {
    if (data) applyCamera(fitCamera(viewport, data));
  }

  // Only surface the blocking error screen when we have nothing to show. If a
  // cached snapshot is already painted, keep it up and let the background retry
  // reconcile — a transient fetch failure shouldn't blank the canvas.
  if (error && !data) {
    return (
      <div className="canvas-stage canvas-stage--message">
        <p>Canvas unavailable: {error}</p>
        <button className="canvas-btn" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="pixl-play">
     <div className="pixl-main">
      {data && (
        <header className="season-head">
          <div className="season-head__ident">
            <span className="season-head__eyebrow">
              SEASON<span className="season-head__num"> · #{data.seasonId}</span>
            </span>
            <h2 className="season-head__title" title={data.title}>
              {data.title || "Untitled season"}
            </h2>
            {seasonAddress && (
              <CopyKey
                value={seasonAddress.toBase58()}
                label="Season address"
              />
            )}
          </div>
          {shareable && (
            <ShareGame className="canvas-btn season-head__invite" />
          )}
          {data.description && (
            <p className="season-head__desc">{data.description}</p>
          )}
        </header>
      )}
      <div className="canvas-stage">
      <div
        ref={wrapRef}
        className="canvas-viewport"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          endDrag();
          setHover(null);
        }}
      >
        <canvas ref={canvasRef} className="canvas-surface" />
        {paintable && hover && data && (() => {
          const { scale, offsetX, offsetY } = cameraRef.current;
          const size = Math.max(1, scale);
          const swatch = data.palette[selectedColor];
          const rgba = swatch != null ? u32ToRgba(swatch) : null;
          const out = energy === 0;
          return (
            <div
              className="paint-cursor"
              data-empty={out || undefined}
              style={{
                left: Math.round(offsetX + hover.x * scale),
                top: Math.round(offsetY + hover.y * scale),
                width: size,
                height: size,
                background: rgba
                  ? `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a / 255})`
                  : undefined,
              }}
            >
              {energy !== null && maxEnergy !== null && (
                <span className="paint-cursor__energy">
                  <span className="paint-cursor__bolt" aria-hidden>⚡</span>
                  {energy}/{maxEnergy}
                </span>
              )}
            </div>
          );
        })()}
        {loading && <span className="canvas-badge">syncing…</span>}
      </div>

      {data && (
        <PalettePicker
          palette={data.palette}
          selected={selectedColor}
          onSelect={setSelectedColor}
          disabled={!paintable}
        />
      )}

      <div className="canvas-bar">
        <div className="canvas-bar__meta">
          <span className="canvas-coord">
            {hover ? `${hover.x}, ${hover.y}` : "—"}
          </span>
          {data && <span className="canvas-dims">{data.width}×{data.height}</span>}
          {data?.frozen && <span className="canvas-flag">frozen</span>}
          {!data?.frozen && (
            <span className="canvas-hint">
              {paintable ? "click to paint" : "view only"}
            </span>
          )}
        </div>

        <div className="canvas-bar__zoom">
          <button
            className="canvas-btn"
            title="Zoom out"
            onClick={() => zoomButton(1 / BUTTON_ZOOM_STEP)}
          >
            −
          </button>
          <span className="canvas-bar__level">
            {Math.round(zoomLabel * 100) / 100}×
          </span>
          <button
            className="canvas-btn"
            title="Zoom in"
            onClick={() => zoomButton(BUTTON_ZOOM_STEP)}
          >
            +
          </button>
          <button className="canvas-btn" title="Fit to screen" onClick={resetView}>
            Fit
          </button>
        </div>
      </div>

      {paintError && <p className="canvas-error">{paintError}</p>}
      </div>
     </div>

      <aside className="pixl-rail">
        {paintable && (
          <PaintEnergyHud energy={energyState} session={session} />
        )}
        <div className="tx-feed">
          {recentTxs.length === 0 ? (
            <p className="tx-feed__empty">
              Paint a pixel — signatures land here as they confirm on the rollup.
            </p>
          ) : (
          <ul className="tx-feed__list">
            {recentTxs.map((tx) => {
              const swatch = data?.palette[tx.colorIndex];
              const rgba = swatch != null ? u32ToRgba(swatch) : null;
              return (
                <li
                  className="tx-row"
                  data-status={tx.status}
                  data-mine={tx.mine}
                  key={tx.id}
                >
                  <span
                    className="tx-row__swatch"
                    style={
                      rgba
                        ? {
                            background: `rgba(${rgba.r},${rgba.g},${rgba.b},${
                              rgba.a / 255
                            })`,
                          }
                        : undefined
                    }
                    aria-hidden
                  />
                  <span className="tx-row__coord">
                    x{tx.x} y{tx.y}
                  </span>
                  <span className="tx-row__painter" title={tx.painter}>
                    {tx.mine
                      ? "you"
                      : tx.painter
                      ? `${tx.painter.slice(0, 4)}…${tx.painter.slice(-4)}`
                      : "—"}
                  </span>
                  <span className="tx-row__status">
                    {tx.status === "pending"
                      ? "sending…"
                      : tx.status === "confirmed"
                      ? "confirmed"
                      : "failed"}
                  </span>
                  {tx.signature ? (
                    <a
                      className="tx-row__link"
                      href={erExplorerTxUrl(tx.signature)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Verify ${tx.signature} on Explorer`}
                      aria-label="Verify on Explorer"
                    >
                      ↗
                    </a>
                  ) : (
                    <span className="tx-row__link tx-row__link--muted" aria-hidden>
                      ·
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
