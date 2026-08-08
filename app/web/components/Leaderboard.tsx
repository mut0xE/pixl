"use client";
import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { paginate } from "../../../packages/sdk";
import { useLeaderboard, type LeaderboardTab } from "../lib/useLeaderboard";
import { useSeasons } from "../lib/useSeasons";

const PAGE_SIZE = 25;

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: "current", label: "Current Season" },
  { id: "past", label: "Past Seasons" },
];

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function Leaderboard() {
  const { publicKey } = useWallet();
  // useSeasons() returns { seasons, loading, error, refetch } — not a bare
  // array — so we destructure `seasons` (SeasonSummary[] | null) from it.
  const { seasons } = useSeasons();
  const [tab, setTab] = useState<LeaderboardTab>("current");
  const [page, setPage] = useState(1);
  const [pastSeason, setPastSeason] = useState<string | null>(null);

  // "Current Season" = the game's newest season: the active one if a season is
  // live, otherwise the most recent by id (e.g. a season that just ended, whose
  // standings players still expect to see under this tab).
  const currentSeason = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    const active = seasons.find((s) => s.status === "active");
    if (active) return active;
    return [...seasons].sort((a, b) => b.id - a.id)[0];
  }, [seasons]);
  const endedSeasons = useMemo(
    () => (seasons ?? []).filter((s) => s.status === "ended"),
    [seasons]
  );

  const seasonAddress = useMemo(() => {
    if (tab === "current")
      return currentSeason ? new PublicKey(currentSeason.address) : null;
    if (tab === "past") return pastSeason ? new PublicKey(pastSeason) : null;
    return null;
  }, [tab, currentSeason, pastSeason]);

  const { rows, loading, yourRank } = useLeaderboard(tab, seasonAddress, publicKey ?? null);
  const view = paginate(rows, page, PAGE_SIZE);
  const myKey = publicKey?.toBase58() ?? null;

  function selectTab(next: LeaderboardTab) {
    setTab(next);
    setPage(1);
  }

  return (
    <section className="leaderboard">
      <header className="leaderboard__head">
        <h1>Leaderboard</h1>
        <nav className="leaderboard__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? "is-active" : ""}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "current" && currentSeason && (
        <p className="leaderboard__season-label">
          #{currentSeason.id} — {currentSeason.title}
          {currentSeason.status === "ended" ? " (ended)" : ""}
        </p>
      )}

      {tab === "past" && (
        <select
          className="leaderboard__season"
          value={pastSeason ?? ""}
          onChange={(e) => {
            setPastSeason(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Select a past season…</option>
          {endedSeasons.map((s) => (
            <option key={s.address} value={s.address}>
              #{s.id} — {s.title}
            </option>
          ))}
        </select>
      )}

      {yourRank != null && (
        <p className="leaderboard__you">Your rank: #{yourRank}</p>
      )}

      {loading ? (
        <p className="leaderboard__state">Loading…</p>
      ) : view.total === 0 ? (
        <p className="leaderboard__state">
          {tab === "past" && !pastSeason
            ? "Pick a season to see its final standings."
            : tab === "current" && !currentSeason
              ? "No season yet."
              : "No painters yet."}
        </p>
      ) : (
        <>
          <ol className="leaderboard__rows" start={(view.page - 1) * PAGE_SIZE + 1}>
            {view.rows.map((r) => (
              <li
                key={r.wallet}
                className={r.wallet === myKey ? "is-you" : ""}
              >
                <span className="leaderboard__key" title={r.wallet}>
                  {shortKey(r.wallet)}
                </span>
                <span className="leaderboard__pixels">{r.pixels}</span>
              </li>
            ))}
          </ol>
          <div className="leaderboard__pager">
            <button disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
              Prev
            </button>
            <span>
              {view.page} / {view.pageCount}
            </span>
            <button
              disabled={view.page >= view.pageCount}
              onClick={() => setPage(view.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
