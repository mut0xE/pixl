"use client";
import Link from "next/link";
import { u32ToHex, type SeasonSummary } from "../../../../packages/sdk";

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

// One clickable season summary in the roster; opens the per-season page.
export function SeasonCard({ season }: { season: SeasonSummary }) {
  return (
    <Link href={`/admin/seasons/${season.address}`} className="season-card">
      <div className="season-card__top">
        <span className="season-card__title">
          {season.title || "Untitled"}
          <span className="season-card__id"> #{season.id}</span>
        </span>
        <span className={`season-status season-status--${season.status}`}>
          {season.status}
        </span>
      </div>

      {season.description && (
        <p className="season-card__desc">{season.description}</p>
      )}

      <dl className="season-card__meta">
        <dt>Start</dt>
        <dd>{fmt(season.startTime)}</dd>
        <dt>End</dt>
        <dd>{fmt(season.endTime)}</dd>
        <dt>Canvas</dt>
        <dd>
          <code>{shortKey(season.canvas)}</code>
        </dd>
      </dl>

      {season.palette.length > 0 && (
        <div
          className="season-card__palette"
          title={`${season.palette.length} colors`}
        >
          {season.palette.slice(0, 16).map((c, i) => (
            <span
              key={i}
              className="season-card__swatch"
              style={{ background: u32ToHex(c).slice(0, 7) }}
            />
          ))}
        </div>
      )}
    </Link>
  );
}
