"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { u32ToHex, type SeasonSummary } from "../../../../packages/sdk";
import { useSeasonSummary, useSeasonDetail } from "../../lib/useSeasons";
import { CopyKey } from "../CopyKey";
import { AdminShell } from "./AdminShell";
import { SeasonLifecyclePanel } from "./SeasonLifecyclePanel";
import { ExportSnapshot } from "./ExportSnapshot";

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function fmt(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Tab = "details" | "lifecycle";

// Per-season workspace: a Details tab (contributions) and a Lifecycle tab.
export function SeasonManage() {
  const params = useParams<{ address: string }>();
  const address = params?.address ?? null;

  return (
    <AdminShell
      title="MANAGE SEASON"
      back={{ href: "/admin/seasons", label: "← SEASONS" }}
    >
      {({ game }) => <Inner game={game} address={address} />}
    </AdminShell>
  );
}

function Inner({ game, address }: { game: PublicKey; address: string | null }) {
  const { season, loading, refetch } = useSeasonSummary(address);
  const [tab, setTab] = useState<Tab>("details");

  if (loading && !season) {
    return (
      <section className="admin-card" aria-busy>
        <span className="skeleton skeleton--line" style={{ width: "50%" }} />
        <span className="skeleton skeleton--block" />
      </section>
    );
  }
  if (!season) {
    return (
      <section className="admin-card">
        <h3 className="admin-card__heading">Season not found</h3>
        <p className="admin-card__note">
          It may have been removed.{" "}
          <Link href="/admin/seasons" className="header-link">
            Back to roster
          </Link>
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="season-head">
        <div className="season-head__title">
          <h2 className="season-head__name">
            {season.title || "Untitled"}
            <span className="season-head__id"> #{season.id}</span>
          </h2>
          <span className={`season-status season-status--${season.status}`}>
            {season.status}
          </span>
        </div>
        <span className="season-head__range">
          {fmt(season.startTime)} → {fmt(season.endTime)}
        </span>
      </div>

      <div className="admin-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "details"}
          className={`admin-tab${
            tab === "details" ? " admin-tab--active" : ""
          }`}
          onClick={() => setTab("details")}
        >
          Details
        </button>
        <button
          role="tab"
          aria-selected={tab === "lifecycle"}
          className={`admin-tab${
            tab === "lifecycle" ? " admin-tab--active" : ""
          }`}
          onClick={() => setTab("lifecycle")}
        >
          Lifecycle
        </button>
      </div>

      {tab === "details" && <DetailsTab season={season} />}
      {tab === "lifecycle" && (
        <>
          <SeasonLifecyclePanel
            game={game}
            season={season}
            onChanged={() => void refetch()}
          />
          <ExportSnapshot season={season} />
        </>
      )}
    </>
  );
}

function DetailsTab({ season }: { season: SeasonSummary }) {
  const { detail, loading } = useSeasonDetail(season.address);

  const pct = (pixels: number) => {
    const total = detail?.stats?.totalPixelsPainted ?? 0;
    if (!total) return "0%";
    const v = (pixels / total) * 100;
    return v < 0.1 ? "<0.1%" : `${v.toFixed(1)}%`;
  };

  return (
    <div className="season-detail__grid">
      <section className="admin-card">
        <h3 className="admin-card__heading">OVERVIEW</h3>
        {season.description && (
          <p className="admin-card__note">{season.description}</p>
        )}
        <dl className="season-facts">
          <dt>Season</dt>
          <dd>
            <CopyKey value={season.address} label="Season address" />
          </dd>
          <dt>Canvas</dt>
          <dd>
            <CopyKey value={season.canvas} label="Canvas address" />
          </dd>
          <dt>Blueprint</dt>
          <dd className="season-facts__uri">{season.imageUri || "—"}</dd>
          <dt>Start</dt>
          <dd>{fmt(season.startTime)}</dd>
          <dt>End</dt>
          <dd>{fmt(season.endTime)}</dd>
        </dl>
        {season.palette.length > 0 && (
          <>
            <h3 className="admin-card__heading">
              PALETTE — {season.palette.length}
            </h3>
            <div className="season-card__palette">
              {season.palette.map((c, i) => (
                <span
                  key={i}
                  className="season-card__swatch"
                  style={{ background: u32ToHex(c).slice(0, 7) }}
                  title={u32ToHex(c).slice(0, 7)}
                />
              ))}
            </div>
          </>
        )}
      </section>

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
              <span className="season-panel__pct">{pct(c.pixelsPainted)}</span>
            </li>
          ))}
          {loading && (
            <li className="season-panel__empty">Reading contributions…</li>
          )}
          {!loading && (detail?.contributors?.length ?? 0) === 0 && (
            <li className="season-panel__empty">No contributors recorded.</li>
          )}
        </ol>
      </aside>
    </div>
  );
}
