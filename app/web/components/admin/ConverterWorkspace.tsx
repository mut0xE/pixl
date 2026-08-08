"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import type { SeasonSummary } from "../../../../packages/sdk";
import { useSeasons } from "../../lib/useSeasons";
import { useCanvasData } from "../../lib/useCanvasData";
import { AdminShell } from "./AdminShell";
import { ImageConverter } from "./ImageConverter";

// Standalone admin page: pick a season, then convert an image into an Artwork
// bounded by that season's live canvas + palette.
export function ConverterWorkspace() {
  const { seasons } = useSeasons();
  const [selected, setSelected] = useState<string | null>(null);

  // Default to the first season once the roster loads.
  useEffect(() => {
    if (!selected && seasons && seasons.length > 0) {
      setSelected(seasons[0].address);
    }
  }, [seasons, selected]);

  return (
    <AdminShell
      title="IMAGE CONVERTER"
      back={{ href: "/admin", label: "← ADMIN" }}
    >
      {() => {
        if (!seasons) {
          return (
            <section className="admin-card" aria-busy>
              <span
                className="skeleton skeleton--line"
                style={{ width: "50%" }}
              />
              <span className="skeleton skeleton--block" />
            </section>
          );
        }
        if (seasons.length === 0) {
          return (
            <section className="admin-card">
              <h3 className="admin-card__heading">No seasons yet</h3>
              <p className="admin-card__note">
                Create a season first — the converter maps images onto a
                season&apos;s canvas and palette.
              </p>
              <Link href="/admin/seasons/new" className="canvas-btn">
                Create a season
              </Link>
            </section>
          );
        }
        return (
          <Body seasons={seasons} selected={selected} onSelect={setSelected} />
        );
      }}
    </AdminShell>
  );
}

function Body({
  seasons,
  selected,
  onSelect,
}: {
  seasons: SeasonSummary[];
  selected: string | null;
  onSelect: (address: string) => void;
}) {
  return (
    <>
      <section className="admin-card">
        <label className="admin-field admin-field--wide">
          <span>Season</span>
          <select
            className="admin-select"
            value={selected ?? ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {seasons.map((s) => (
              <option key={s.address} value={s.address}>
                #{s.id} — {s.title || "Untitled"} ({s.status})
              </option>
            ))}
          </select>
        </label>
      </section>

      {selected && <Converter address={selected} />}
    </>
  );
}

function Converter({ address }: { address: string }) {
  const seasonKey = useMemo(() => new PublicKey(address), [address]);
  const { data: canvas, loading } = useCanvasData(seasonKey);

  if (!canvas) {
    return (
      <section className="admin-card" aria-busy={loading}>
        <h3 className="admin-card__heading">IMAGE → ARTWORK</h3>
        <p className="admin-card__note">
          {loading ? "Reading canvas layout…" : "Canvas unavailable."}
        </p>
      </section>
    );
  }

  return (
    <ImageConverter
      canvasWidth={canvas.width}
      canvasHeight={canvas.height}
      canvasPixels={canvas.pixels}
      palette={canvas.palette}
      seasonId={canvas.seasonId}
    />
  );
}
