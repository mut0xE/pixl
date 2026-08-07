"use client";
import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { u32ToHex, type SeasonSummary } from "../../../packages/sdk";
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

function SeasonCard({
  season,
  onOpen,
  index = 0,
}: {
  season: SeasonSummary;
  onOpen: () => void;
  index?: number;
}) {
  return (
    <button
      className="season-card reveal"
      data-status={season.status}
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="season-card__top">
        <span className="season-card__status" data-status={season.status}>
          {STATUS_LABEL[season.status]}
        </span>
        <span className="season-card__id">#{season.id}</span>
      </div>
      <h3 className="season-card__title">{season.title || "Untitled"}</h3>
      <div className="season-card__palette">
        {season.palette.slice(0, 12).map((c, i) => (
          <span
            key={i}
            className="season-card__swatch"
            style={{ background: u32ToHex(c).slice(0, 7) }}
          />
        ))}
      </div>
      <div className="season-card__meta">
        <span>{fmtDate(season.startTime)}</span>
        <span className="season-card__arrow">→</span>
      </div>
    </button>
  );
}

function SeasonDetailView({
  season,
  onBack,
}: {
  season: SeasonSummary;
  onBack: () => void;
}) {
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
        <button className="canvas-btn" onClick={onBack}>
          ← BACK
        </button>
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
        <PixlCanvas seasonAddress={seasonPk} />

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

type Tab = SeasonSummary["status"];

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: "active", label: "Active", empty: "No live seasons right now." },
  { id: "upcoming", label: "Upcoming", empty: "No upcoming seasons scheduled." },
  { id: "ended", label: "Ended", empty: "No seasons have ended yet." },
];

export function SeasonBrowser() {
  const { seasons, loading, error, refetch } = useSeasons();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const grouped = useMemo(() => {
    const g: Record<Tab, SeasonSummary[]> = {
      active: [],
      upcoming: [],
      ended: [],
    };
    for (const s of seasons ?? []) g[s.status].push(s);
    return g;
  }, [seasons]);

  // Default to Active, but fall back to the first tab that actually has
  // seasons so the view never opens on a blank list. Resolved lazily (once
  // seasons load) and only while the user hasn't picked a tab themselves.
  const activeTab: Tab =
    tab ?? TABS.find((t) => grouped[t.id].length > 0)?.id ?? "active";

  const current = seasons?.find((s) => s.address === selected) ?? null;

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

  if (current) {
    return (
      <SeasonDetailView season={current} onBack={() => setSelected(null)} />
    );
  }

  const rows = grouped[activeTab];

  return (
    <div className="season-browser">
      <div className="season-browser__bar">
        <span className="season-browser__heading">SEASONS</span>
      </div>

      {loading && !seasons ? (
        <SeasonGridSkeleton />
      ) : seasons && seasons.length === 0 ? (
        <p className="bootstrap-panel__hint">No seasons created yet.</p>
      ) : (
        <>
          <div className="admin-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`admin-tab${
                  activeTab === t.id ? " admin-tab--active" : ""
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className="admin-tab__count">
                  {grouped[t.id].length}
                </span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="bootstrap-panel__hint">
              {TABS.find((t) => t.id === activeTab)?.empty}
            </p>
          ) : (
            <div className="season-grid">
              {rows.map((s, i) => (
                <SeasonCard
                  key={s.address}
                  season={s}
                  index={i}
                  onOpen={() => setSelected(s.address)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SeasonGridSkeleton() {
  return (
    <div className="season-grid" aria-busy>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="season-card season-card--skeleton">
          <span className="skeleton skeleton--line" style={{ width: "40%" }} />
          <span className="skeleton skeleton--line" style={{ width: "70%" }} />
          <span className="skeleton skeleton--block" />
        </div>
      ))}
    </div>
  );
}
