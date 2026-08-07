"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { SeasonSummary } from "../../../../packages/sdk";
import { useSeasons } from "../../lib/useSeasons";
import { AdminShell } from "./AdminShell";
import { SeasonCard } from "./SeasonCard";

type Tab = "active" | "ended";

// The season roster, split across Active/upcoming and Ended tabs.
export function SeasonsList() {
  const { seasons } = useSeasons();
  const [tab, setTab] = useState<Tab>("active");

  const { active, ended } = useMemo(() => {
    const active: SeasonSummary[] = [];
    const ended: SeasonSummary[] = [];
    for (const s of seasons ?? [])
      (s.status === "ended" ? ended : active).push(s);
    return { active, ended };
  }, [seasons]);

  const current = tab === "active" ? active : ended;

  return (
    <AdminShell title="SEASONS" back={{ href: "/admin", label: "← ADMIN" }}>
      {() => (
        <>
          {!seasons ? (
            <SeasonGridSkeleton />
          ) : seasons.length === 0 ? (
            <section className="admin-card">
              <h3 className="admin-card__heading">No seasons yet</h3>
              <p className="admin-card__note">
                Nothing has been created. Start the first one from the console.
              </p>
              <Link href="/admin/seasons/new" className="canvas-btn">
                Create a season
              </Link>
            </section>
          ) : (
            <>
              <div className="admin-tabs" role="tablist">
                <TabButton
                  active={tab === "active"}
                  count={active.length}
                  onClick={() => setTab("active")}
                >
                  Active &amp; upcoming
                </TabButton>
                <TabButton
                  active={tab === "ended"}
                  count={ended.length}
                  onClick={() => setTab("ended")}
                >
                  Ended
                </TabButton>
              </div>

              {current.length === 0 ? (
                <p className="admin-card__note">
                  {tab === "active"
                    ? "No live or upcoming seasons."
                    : "No ended seasons yet."}
                </p>
              ) : (
                <div className="admin-season-grid">
                  {current.map((s) => (
                    <SeasonCard key={s.address} season={s} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`admin-tab${active ? " admin-tab--active" : ""}`}
      onClick={onClick}
    >
      {children}
      <span className="admin-tab__count">{count}</span>
    </button>
  );
}

function SeasonGridSkeleton() {
  return (
    <div className="admin-season-grid" aria-busy>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="season-card season-card--skeleton">
          <span className="skeleton skeleton--line" style={{ width: "60%" }} />
          <span className="skeleton skeleton--line" style={{ width: "40%" }} />
          <span className="skeleton skeleton--block" />
        </div>
      ))}
    </div>
  );
}
