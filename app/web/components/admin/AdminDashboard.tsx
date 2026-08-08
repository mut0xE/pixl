"use client";
import { useMemo } from "react";
import Link from "next/link";
import { summarizeSeasonCounts } from "../../../../packages/sdk";
import { useSeasons } from "../../lib/useSeasons";
import { AdminShell } from "./AdminShell";

// Admin landing: a fork between creating a new season and managing the roster.
export function AdminDashboard() {
  const { seasons } = useSeasons();
  const counts = useMemo(
    () => (seasons ? summarizeSeasonCounts(seasons) : null),
    [seasons]
  );

  return (
    <AdminShell title="ADMIN CONSOLE" back={{ href: "/", label: "PLAY" }}>
      {() => (
        <div className="admin-actions">
          <Link href="/admin/seasons/new" className="admin-action">
            <span className="admin-action__index">01</span>
            <span className="admin-action__glyph" aria-hidden>
              ＋
            </span>
            <span className="admin-action__title">Create season</span>
            <span className="admin-action__note">
              Init Season + Canvas + SeasonStats and delegate to the Ephemeral
              Rollup — one transaction.
            </span>
            <span className="admin-action__go">Open form →</span>
          </Link>

          <Link href="/admin/seasons" className="admin-action">
            <span className="admin-action__index">02</span>
            <span className="admin-action__glyph" aria-hidden>
              ▦
            </span>
            <span className="admin-action__title">Manage seasons</span>
            <span className="admin-action__note">
              Browse the roster, inspect contributions, and run each season’s
              commit / undelegate / end lifecycle.
            </span>
            <span className="admin-action__stats">
              {counts ? (
                <>
                  <b>{counts.active}</b> active&nbsp;·&nbsp;
                  <b>{counts.upcoming}</b> upcoming&nbsp;·&nbsp;
                  <b>{counts.ended}</b> ended
                </>
              ) : (
                <span
                  className="skeleton skeleton--line"
                  style={{ width: 160 }}
                />
              )}
            </span>
            <span className="admin-action__go">Open roster →</span>
          </Link>

          <Link href="/admin/converter" className="admin-action">
            <span className="admin-action__index">03</span>
            <span className="admin-action__glyph" aria-hidden>
              ◧
            </span>
            <span className="admin-action__title">Image converter</span>
            <span className="admin-action__note">
              Turn a PNG / JPG into an Artwork mapped onto a season’s canvas and
              palette, then export the blueprint JSON.
            </span>
            <span className="admin-action__go">Open converter →</span>
          </Link>
        </div>
      )}
    </AdminShell>
  );
}
