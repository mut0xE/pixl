"use client";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { decodeCanvas, fetchCanvas, fetchSeason } from "../../../packages/sdk";
import { usePixlProgram } from "./program";
import { getErConnection } from "./er";

// On-chain canvas layout + palette. Read ER-first (the delegated live state),
// falling back to L1 (the last committed snapshot) when the ER clone is absent.
export type SeasonTiming = {
  startTime: number;
  endTime: number;
  completed: boolean;
};

export type CanvasData = {
  width: number;
  height: number;
  /** Flat row-major palette indices, length = width * height. */
  pixels: number[];
  /** Packed 0xRRGGBBAA colors, indexed by pixel value. */
  palette: number[];
  frozen: boolean;
  canvasAddress: PublicKey;
  season: SeasonTiming;
  /** Human-facing season identity, surfaced in the canvas header. */
  seasonId: number;
  title: string;
  description: string;
};

// Cache the last decoded snapshot per season in localStorage so a refresh paints
// instantly, then reconciles with the fresh fetch. Pixels are base64-packed.
const CACHE_PREFIX = "pixl.canvas.";

type CachedCanvas = Omit<CanvasData, "pixels" | "canvasAddress"> & {
  pixels: string; // base64-packed palette indices
  canvasAddress: string; // base58
};

function cacheKey(seasonAddress: PublicKey) {
  return CACHE_PREFIX + seasonAddress.toBase58();
}

function packPixels(pixels: number[]): string {
  const bytes = Uint8Array.from(pixels, (p) => p & 0xff);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function unpackPixels(packed: string): number[] {
  const bin = atob(packed);
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readCache(seasonAddress: PublicKey): CanvasData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(seasonAddress));
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedCanvas;
    return {
      ...c,
      pixels: unpackPixels(c.pixels),
      canvasAddress: new PublicKey(c.canvasAddress),
    };
  } catch {
    return null;
  }
}

function writeCache(seasonAddress: PublicKey, data: CanvasData) {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCanvas = {
      ...data,
      pixels: packPixels(data.pixels),
      canvasAddress: data.canvasAddress.toBase58(),
    };
    window.localStorage.setItem(
      cacheKey(seasonAddress),
      JSON.stringify(cached)
    );
  } catch {
    // Quota or serialization failure is non-fatal — the fresh fetch still works.
  }
}

export function useCanvasData(seasonAddress: PublicKey | null) {
  const program = usePixlProgram();
  const { connection } = useConnection();
  const [data, setData] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!program || !seasonAddress) return;
    // Paint the last-known snapshot instantly while the authoritative fetch runs.
    const cached = readCache(seasonAddress);
    if (cached) setData(cached);
    setLoading(true);
    setError(null);
    try {
      const season = await fetchSeason(program, seasonAddress);
      // ER-first snapshot; fall back to the L1 committed state.
      const er = getErConnection();
      const erInfo = await er.getAccountInfo(season.canvas, "confirmed");
      const canvas = erInfo
        ? decodeCanvas(erInfo.data)
        : await fetchCanvas(connection, season.canvas);
      if (!canvas) {
        throw new Error("Canvas account not found for this season.");
      }
      const fresh: CanvasData = {
        width: canvas.width,
        height: canvas.height,
        pixels: canvas.pixels,
        palette: season.palette.map((c: number) => Number(c)),
        frozen: canvas.frozen,
        canvasAddress: season.canvas,
        season: {
          startTime: Number(season.startTime),
          endTime: Number(season.endTime),
          completed: season.completed,
        },
        seasonId: Number(season.id),
        title: season.title,
        description: season.description,
      };
      setData(fresh);
      writeCache(seasonAddress, fresh);
    } catch (e) {
      // Keep any cached snapshot on screen rather than blanking on a fetch error.
      if (!cached) setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [program, connection, seasonAddress?.toBase58()]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
