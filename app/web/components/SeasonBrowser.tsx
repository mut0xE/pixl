"use client";
import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { type SeasonSummary } from "../../../packages/sdk";
import { useSeasons, useSeasonDetail } from "../lib/useSeasons";
import { PixlCanvas } from "./PixlCanvas";

const STATUS_LABEL: Record<SeasonSummary["status"], string> = {
  active: "ACTIVE",
  upcoming: "UPCOMING",
  ended: "ENDED",
};

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function fmtDate(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SeasonDetailView({ season }: { season: SeasonSummary }) {
  const { detail, loading } = useSeasonDetail(season.address);
  const seasonPk = useMemo(
    () => new PublicKey(season.address),
    [season.address]
  );

  const contribution = (pixels: number) => {
    const total = detail?.stats?.totalPixelsPainted ?? 0;
    if (!total) return "0%";
    const pct = (pixels / total) * 100;
    return pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
  };

  return (
    <div className="season-detail">
      <div className="season-detail__head">
        <div>
          <h2 className="season-detail__title">
            {season.title}{" "}
            <span className="season-detail__id">#{season.id}</span>
          </h2>
          <span className="season-detail__status" data-status={season.status}>
            {STATUS_LABEL[season.status]} · {fmtDate(season.startTime)} —{" "}
            {fmtDate(season.endTime)}
          </span>
        </div>
      </div>

      <div className="season-detail__grid">
        <PixlCanvas seasonAddress={seasonPk} readOnly />

        <aside className="season-panel">
          <h4 className="season-panel__heading">CONTRIBUTIONS</h4>
          <div className="season-panel__totals">
            <div>
              <span className="season-panel__num">
                {detail?.stats?.totalPixelsPainted ?? (loading ? "…" : 0)}
              </span>
              <span className="season-panel__label">community pixels</span>
            </div>
            <div>
              <span className="season-panel__num">
                {detail?.stats?.participantCount ?? (loading ? "…" : 0)}
              </span>
              <span className="season-panel__label">participants</span>
            </div>
          </div>

          <h4 className="season-panel__heading">LEADERBOARD</h4>
          <ol className="season-panel__list">
            {(detail?.contributors ?? []).slice(0, 10).map((c, i) => (
              <li key={c.player}>
                <span className="season-panel__rank">{i + 1}</span>
                <span className="season-panel__who">{shortKey(c.player)}</span>
                <span className="season-panel__px">{c.pixelsPainted}px</span>
                <span className="season-panel__pct">
                  {contribution(c.pixelsPainted)}
                </span>
              </li>
            ))}
            {!loading && (detail?.contributors?.length ?? 0) === 0 && (
              <li className="season-panel__empty">No contributors recorded.</li>
            )}
          </ol>
        </aside>
      </div>
    </div>
  );
}

export function SeasonBrowser() {
  const { seasons, loading, error, refetch } = useSeasons();

  // Player-facing view: drop straight into the active season (history is admin-only).
  const active = useMemo(
    () => (seasons ?? []).find((s) => s.status === "active") ?? null,
    [seasons]
  );

  if (error) {
    return (
      <div className="season-browser__message">
        <p>Could not load seasons: {error}</p>
        <button className="canvas-btn" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading && !seasons) {
    return (
      <div className="season-browser__message" aria-busy>
        <span className="skeleton skeleton--block" />
      </div>
    );
  }

  if (!active) {
    return <p className="bootstrap-panel__hint">No active season right now.</p>;
  }

  return <SeasonDetailView season={active} />;
}
