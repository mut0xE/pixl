"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PublicKey, Keypair } from "@solana/web3.js";
import {
  zoomAt,
  panBy,
  clampOffset,
  screenToCell,
  shouldShowGrid,
  u32ToRgba,
  computeContributionPct,
  formatPercent,
  MIN_SCALE,
  type Camera,
  type SessionMeta,
} from "../../../packages/sdk";
import { useCanvasData, type CanvasData } from "../lib/useCanvasData";
import { useErProgram, erExplorerTxUrl } from "../lib/er";
import { usePainting } from "../lib/usePainting";
import { PalettePicker } from "./PalettePicker";
import { PaintEnergyHud } from "./PaintEnergyHud";
import { CommunityCard } from "./CommunityCard";
import { useContribution } from "../lib/useContribution";
import { ShareGame } from "./ShareGame";
import { CopyKey } from "./CopyKey";

// Interactive painting renderer: a 1:1 offscreen texture drawn through a camera
// transform (nearest-neighbor zoom + pan). Click paints, drag pans.
const WHEEL_ZOOM_STEP = 1.15;
const BUTTON_ZOOM_STEP = 1.4;
const CLICK_SLOP = 4; // px of movement below which a mouseup counts as a click
const DETAIL_GRID_THRESHOLD = 14;
const ENTERED_KEY = "pixl.entered";
const FIT_PADDING = 14;
const FIT_BOTTOM_GUTTER = 86;

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

function fitCanvasCamera(
  viewport: { width: number; height: number },
  canvas: { width: number; height: number }
) {
  const left = FIT_PADDING;
  const right = FIT_PADDING;
  const top = FIT_PADDING;
  const bottom = viewport.width <= 880 ? FIT_PADDING : FIT_BOTTOM_GUTTER;
  const innerWidth = Math.max(1, viewport.width - left - right);
  const innerHeight = Math.max(1, viewport.height - top - bottom);
  const scale = Math.max(
    MIN_SCALE,
    Math.min(innerWidth / canvas.width, innerHeight / canvas.height)
  );
  return {
    scale,
    offsetX: left + (innerWidth - canvas.width * scale) / 2,
    offsetY: top + (innerHeight - canvas.height * scale) / 2,
  };
}

function resolveViewport(
  fallback: { width: number; height: number },
  element: HTMLDivElement | null
) {
  if (!element) return fallback;
  const width = element.clientWidth || fallback.width;
  const height = element.clientHeight || fallback.height;
  return { width, height };
}

export function PixlCanvas({
  seasonAddress,
  wallet = null,
  session = null,
  sessionSecret = null,
  shareable = false,
  readOnly = false,
  chrome = null,
}: {
  seasonAddress: PublicKey | null;
  // Painting props — omitted for read-only historical views (SeasonBrowser).
  wallet?: PublicKey | null;
  session?: SessionMeta | null;
  sessionSecret?: Keypair | null;
  // Show a Share button in the HUD.
  shareable?: boolean;
  // Public spectator view: strip all painting chrome and never allow paints.
  readOnly?: boolean;
  // Slot rendered in the floating top-right bar (wallet control, admin link).
  chrome?: ReactNode;
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

  const contribution = useContribution(seasonAddress, wallet, sessionSecret);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const texRef = useRef<Tex | null>(null);
  const cameraRef = useRef<Camera>({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{ x: number; y: number; pointerId: number } | null>(
    null
  );
  const movedRef = useRef(false);
  const fittedRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [energyAlertTick, setEnergyAlertTick] = useState(0);

  const paintable =
    !readOnly && Boolean(erProgram && session && data && !data.frozen);

  function goHome() {
    try {
      window.sessionStorage.removeItem(ENTERED_KEY);
    } catch {
      /* sessionStorage may be unavailable; navigation still works */
    }
    window.location.href = "/";
  }

  useEffect(() => {
    if (!paintError) return;
    if (!/energy|recharge/i.test(paintError)) return;
    setEnergyAlertTick((tick) => tick + 1);
  }, [paintError]);

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

  // Rebuild the texture + re-fit whenever a new snapshot loads.
  useEffect(() => {
    texRef.current = data ? buildTexture(data.pixels, data) : null;
    fittedRef.current = false;
    maybeFitAndDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Patch only the dirty pixels into the existing texture, then redraw.
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
    const nextViewport = resolveViewport(viewport, wrapRef.current);
    if (data && nextViewport.width > 0 && !fittedRef.current) {
      cameraRef.current = clampOffset(fitCanvasCamera(nextViewport, data), nextViewport, data);
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
    ctx.fillStyle = "#d8dadd";
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

    if (shouldShowGrid(scale, DETAIL_GRID_THRESHOLD)) {
      ctx.strokeStyle = "#ffffff10";
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

    // The hovered cell is a DOM overlay (`paint-cursor` below), not drawn here.
  }

  function applyCamera(next: Camera) {
    if (!data) return;
    cameraRef.current = clampOffset(
      next,
      resolveViewport(viewport, wrapRef.current),
      data
    );
    setZoomLabel(cameraRef.current.scale);
    draw();
  }

  function localPoint(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Wheel-to-zoom needs a native non-passive listener so preventDefault works
  // (React's synthetic wheel handlers are passive).
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

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!data) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    movedRef.current = false;
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!data) return;
    if (dragRef.current) {
      if (dragRef.current.pointerId !== e.pointerId) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP)
        movedRef.current = true;
      dragRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      applyCamera(panBy(cameraRef.current, dx, dy));
    }
    const { x, y } = localPoint(e);
    setHover(screenToCell(cameraRef.current, x, y, data));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = dragRef.current !== null;
    const moved = movedRef.current;
    if (dragRef.current && dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!data || !wasDragging || moved || !paintable) return;
    if (energy !== null && energy <= 0) {
      setEnergyAlertTick((tick) => tick + 1);
    }
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
    if (!data) return;
    const nextViewport = resolveViewport(viewport, wrapRef.current);
    cameraRef.current = clampOffset(
      fitCanvasCamera(nextViewport, data),
      nextViewport,
      data
    );
    fittedRef.current = true;
    setZoomLabel(cameraRef.current.scale);
    draw();
  }

  // Only show the blocking error screen when there's no cached snapshot to keep up.
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

  // The interactive canvas surface + live paint cursor — shared by both the
  // embedded read-only view and the full-bleed play stage.
  const canvasBoard = (
    <div
      ref={wrapRef}
      className="canvas-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        endDrag();
        setHover(null);
      }}
      onPointerLeave={() => {
        endDrag();
        setHover(null);
      }}
    >
      <canvas ref={canvasRef} className="canvas-surface" />
      {paintable &&
        hover &&
        data &&
        (() => {
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
                  <span className="paint-cursor__bolt" aria-hidden>
                    ⚡
                  </span>
                  {energy}/{maxEnergy}
                </span>
              )}
            </div>
          );
        })()}
      {loading && <span className="canvas-badge">syncing…</span>}
    </div>
  );

  const zoomTools = (
    <div className="stage-tools stage-tools--overlay">
      <span className="stage-tools__zoom">
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
        <button
          className="canvas-btn"
          title="Fit to screen"
          onClick={resetView}
        >
          Fit
        </button>
      </span>
    </div>
  );

  // Embedded historical view (SeasonBrowser): keep the compact boxed layout.
  if (readOnly) {
    return (
      <div className="pixl-play pixl-play--embed">
        <div className="pixl-main">
          {data && (
            <header className="season-head">
              <div className="season-head__ident">
                <span className="season-head__eyebrow">
                  SEASON
                  <span className="season-head__num"> · #{data.seasonId}</span>
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
              {data.description && (
                <p className="season-head__desc">{data.description}</p>
              )}
            </header>
          )}
          <div className="canvas-stage">
            {canvasBoard}
            {zoomTools}
          </div>
        </div>
      </div>
    );
  }

  // Full-bleed play stage: the canvas is the screen; every control floats over
  // it, pxls-style. Bold move goes to the canvas — the chrome stays quiet.
  return (
    <div className="pixl-stage">
      <div className="stage-shell">
        <header className="stage-bar stage-bar--top">
          <div className="stage-brand">
            <div className="stage-brand__block">
              <span className="stage-brand__eyebrow">Collaborative canvas</span>
              <button
                type="button"
                className="stage-brand__mark"
                aria-label="Go home"
                onClick={goHome}
              >
                Pixl
              </button>
            </div>
            {data && (
              <span className="stage-brand__season">
                <span className="stage-brand__id">Season #{data.seasonId}</span>
                <span className="stage-brand__title" title={data.title}>
                  {data.title || "Untitled season"}
                </span>
                {seasonAddress && (
                  <CopyKey
                    value={seasonAddress.toBase58()}
                    label="Season address"
                  />
                )}
              </span>
            )}
          </div>
          <div className="stage-actions">
            {shareable && <ShareGame className="canvas-btn canvas-btn--primary" />}
            {chrome}
          </div>
        </header>

        <div className="stage-layout">
          <section className="stage-canvas-panel">
            <div className="stage-canvas-panel__frame">
              {canvasBoard}
              {zoomTools}
            </div>
            <div className="stage-canvas-panel__footer">
              {data && (
                <div className="stage-dock">
                  <PalettePicker
                    palette={data.palette}
                    selected={selectedColor}
                    onSelect={setSelectedColor}
                    disabled={!paintable}
                  />
                </div>
              )}
            </div>
          </section>

          <aside className="stage-hud">
            {paintable && (
              <PaintEnergyHud
                energy={energyState}
                session={session}
                alertTick={energyAlertTick}
                error={paintError}
                hover={hover}
                canvas={data ? { width: data.width, height: data.height, frozen: data.frozen } : null}
              />
            )}

            {wallet && (
              <details className="hud-panel" open>
                <summary className="hud-panel__summary">
                  <span className="hud-panel__label">Community</span>
                  {contribution && (
                    <span className="hud-panel__meta">
                      {contribution.rank !== null ? `#${contribution.rank}` : "—"}
                      <span className="hud-panel__meta-accent">
                        {formatPercent(
                          computeContributionPct(
                            contribution.yourPixels,
                            contribution.communityPixels
                          )
                        )}
                      </span>
                    </span>
                  )}
                  <span className="hud-panel__chevron" aria-hidden />
                </summary>
                <CommunityCard
                  contribution={contribution}
                  season={data?.season ?? null}
                />
              </details>
            )}

            <details className="hud-panel">
              <summary className="hud-panel__summary">
                <span className="hud-panel__label">Activity</span>
                <span className="hud-panel__chevron" aria-hidden />
              </summary>
              {recentTxs.length === 0 ? (
                <p className="tx-feed__empty">
                  Paint a pixel — signatures land here as they confirm on the
                  rollup.
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
                          <span
                            className="tx-row__link tx-row__link--muted"
                            aria-hidden
                          >
                            ·
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </aside>
        </div>
      </div>
    </div>
  );
}
