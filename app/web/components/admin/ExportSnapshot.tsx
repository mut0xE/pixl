"use client";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  canvasToSnapshot,
  fetchCanvas,
  normalizeError,
  type SeasonSummary,
} from "../../../../packages/sdk";
import { downloadSnapshot } from "../../lib/exportSnapshot";

const SCALE = 8;

export function ExportSnapshot({ season }: { season: SeasonSummary }) {
  const { connection } = useConnection();
  const [state, setState] = useState<"idle" | "reading" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setState("reading");
    try {
      const canvas = await fetchCanvas(
        connection,
        new PublicKey(season.canvas)
      );
      if (!canvas)
        throw new Error("Canvas unavailable on L1 (still delegated?)");
      const snap = canvasToSnapshot({
        width: canvas.width,
        height: canvas.height,
        palette: season.palette,
        pixels: canvas.pixels,
      });
      const base = `pixl-season-${season.id}`;
      await downloadSnapshot(snap, base, SCALE);
      setState("done");
    } catch (err) {
      setError(normalizeError(err).detail);
      setState("error");
    }
  }

  return (
    <section className="admin-card">
      <h3 className="admin-card__heading">EXPORT SNAPSHOT</h3>
      <p className="admin-card__note">
        Download the final canvas as a {SCALE}× PNG plus a reproducible JSON of
        palette indices. Reads L1 — undelegate first for the finalized state.
      </p>
      <button
        className="canvas-btn"
        onClick={run}
        disabled={state === "reading"}
      >
        {state === "reading" ? "Reading canvas…" : "Download PNG + JSON"}
      </button>
      {state === "done" && (
        <span className="admin-ok">Snapshot downloaded ✓</span>
      )}
      {state === "error" && error && (
        <div className="tx-button__error" role="alert">
          <strong>Export failed</strong>
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
