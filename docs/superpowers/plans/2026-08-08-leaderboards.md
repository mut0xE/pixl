# Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Current Season / Lifetime / Past Seasons leaderboards on a dedicated `/leaderboard` page, sourced entirely from existing on-chain accounts (ER-first, L1 fallback), showing player wallet keys and pixels painted.

**Architecture:** A new `packages/sdk/leaderboard.ts` module adds pure ranking/pagination helpers plus a lifetime-leaders fetcher, reusing the existing `fetchSeasonContributors*` primitives in `seasons.ts`. A client hook `useLeaderboard` wires the ER-first/L1-fallback reads (mirroring `useContribution`). A standalone `/leaderboard` Next.js route renders three tabs with pagination, your-rank, and loading/empty states.

**Tech Stack:** TypeScript, `@coral-xyz/anchor`, `@solana/web3.js`, Next.js (App Router, client components), React hooks, chai + ts-mocha for SDK unit tests.

## Global Constraints

- On-chain reads only. No database, no event indexer, no long-running poller.
- No "points" column; sort is pixels painted desc, then wallet base58 asc (final tiebreaker).
- No recent-activity feed.
- No blueprint or overlay code — do not import, extend, or reference `packages/sdk/blueprint.ts`.
- Rows display wallet pubkeys ("player keys").
- Pixel totals are read ER-first with L1 fallback (list reads and own-row alike).
- SDK unit tests run with: `yarn test:sdk` (ts-mocha, chai `expect`, files `packages/sdk/*.unit.test.ts`).
- Follow existing code style: named exports, plain-object view types (numbers not BN), base58 strings for pubkeys in view types.

---

### Task 1: SDK leaderboard core (pure helpers + lifetime fetcher)

**Files:**
- Create: `packages/sdk/leaderboard.ts`
- Test: `packages/sdk/leaderboard.unit.test.ts`
- Modify: `packages/sdk/index.ts` (add `export * from "./leaderboard";`)
- Reference (do not edit): `packages/sdk/seasons.ts:200-221` (`fetchSeasonContributors`, `SeasonContributor`), `packages/sdk/pda.ts` (`derivePlayerPda`), `packages/sdk/accounts.ts` (`PixlProgram`).

**Interfaces:**
- Consumes: `PixlProgram` from `./accounts`; `SeasonContributor` from `./seasons`; `derivePlayerPda` from `./pda`.
- Produces:
  - `type LeaderboardRow = { wallet: string; pixels: number }`
  - `type LifetimeLeader = { wallet: string; lifetimePixels: number }`
  - `sortRows(rows: LeaderboardRow[]): LeaderboardRow[]` — pixels desc, then wallet base58 asc; pure, returns a new array.
  - `paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; page: number; pageCount: number; total: number }` — 1-indexed page, clamps out-of-range.
  - `rankOfWallet(wallet: string, rows: LeaderboardRow[]): number | null` — 1-indexed, null if absent.
  - `buildPlayerWalletMap(players: { publicKey: PublicKey; wallet: PublicKey }[]): Map<string, string>` — Player-PDA base58 → wallet base58.
  - `resolveContributorWallets(contributors: SeasonContributor[], walletMap: Map<string, string>): LeaderboardRow[]` — maps each contributor's Player-PDA (`.player`) to a wallet via the map, drops unmapped, then `sortRows`.
  - `fetchLifetimeLeaders(program: PixlProgram): Promise<LifetimeLeader[]>` — `program.account.player.all()`, map to `{ wallet, lifetimePixels }`, sorted lifetimePixels desc then wallet asc.
  - `fetchLifetimeLeadersWithFallback(erProgram: PixlProgram, l1Program: PixlProgram): Promise<LifetimeLeader[]>` — try ER, fall back to L1 when ER throws or returns `[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/sdk/leaderboard.unit.test.ts`:

```ts
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import {
  sortRows,
  paginate,
  rankOfWallet,
  buildPlayerWalletMap,
  resolveContributorWallets,
  type LeaderboardRow,
} from "./leaderboard";

// Deterministic base58 pubkeys (ascending order: A < B < C by base58).
const WALLET_A = "11111111111111111111111111111111"; // system program, all-1s (smallest)
const WALLET_B = "So11111111111111111111111111111111111111112";
const WALLET_C = "Vote111111111111111111111111111111111111111";

describe("sortRows", () => {
  it("sorts by pixels desc", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_B, pixels: 5 },
      { wallet: WALLET_A, pixels: 10 },
    ];
    expect(sortRows(rows).map((r) => r.pixels)).to.deep.equal([10, 5]);
  });

  it("breaks pixel ties by wallet base58 ascending", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_C, pixels: 7 },
      { wallet: WALLET_A, pixels: 7 },
      { wallet: WALLET_B, pixels: 7 },
    ];
    expect(sortRows(rows).map((r) => r.wallet)).to.deep.equal([
      WALLET_A,
      WALLET_B,
      WALLET_C,
    ]);
  });

  it("does not mutate the input", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_A, pixels: 1 },
      { wallet: WALLET_B, pixels: 2 },
    ];
    sortRows(rows);
    expect(rows[0].pixels).to.equal(1);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  it("returns the requested page and page count", () => {
    const r = paginate(rows, 2, 10);
    expect(r.rows).to.deep.equal([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.pageCount).to.equal(3);
    expect(r.total).to.equal(25);
    expect(r.page).to.equal(2);
  });

  it("returns the last partial page", () => {
    const r = paginate(rows, 3, 10);
    expect(r.rows).to.deep.equal([20, 21, 22, 23, 24]);
  });

  it("clamps out-of-range page up to the last page", () => {
    const r = paginate(rows, 99, 10);
    expect(r.page).to.equal(3);
    expect(r.rows).to.deep.equal([20, 21, 22, 23, 24]);
  });

  it("handles an empty list", () => {
    const r = paginate([] as number[], 1, 10);
    expect(r.rows).to.deep.equal([]);
    expect(r.pageCount).to.equal(1);
    expect(r.total).to.equal(0);
    expect(r.page).to.equal(1);
  });
});

describe("rankOfWallet", () => {
  const rows: LeaderboardRow[] = [
    { wallet: WALLET_A, pixels: 10 },
    { wallet: WALLET_B, pixels: 5 },
  ];
  it("returns 1-indexed rank", () => {
    expect(rankOfWallet(WALLET_B, rows)).to.equal(2);
  });
  it("returns null when absent", () => {
    expect(rankOfWallet(WALLET_C, rows)).to.equal(null);
  });
});

describe("buildPlayerWalletMap + resolveContributorWallets", () => {
  const pdaA = new PublicKey(WALLET_C); // reuse a valid pubkey as a fake PDA
  const pdaB = new PublicKey(WALLET_B);

  it("maps Player PDA to wallet and sorts", () => {
    const map = buildPlayerWalletMap([
      { publicKey: pdaA, wallet: new PublicKey(WALLET_A) },
      { publicKey: pdaB, wallet: new PublicKey(WALLET_B) },
    ]);
    const rows = resolveContributorWallets(
      [
        { player: pdaA.toBase58(), pixelsPainted: 3, joinedAt: 1 },
        { player: pdaB.toBase58(), pixelsPainted: 9, joinedAt: 1 },
      ],
      map
    );
    expect(rows).to.deep.equal([
      { wallet: WALLET_B, pixels: 9 },
      { wallet: WALLET_A, pixels: 3 },
    ]);
  });

  it("drops contributors whose PDA is not in the map", () => {
    const map = buildPlayerWalletMap([
      { publicKey: pdaA, wallet: new PublicKey(WALLET_A) },
    ]);
    const rows = resolveContributorWallets(
      [
        { player: pdaA.toBase58(), pixelsPainted: 3, joinedAt: 1 },
        { player: pdaB.toBase58(), pixelsPainted: 9, joinedAt: 1 },
      ],
      map
    );
    expect(rows).to.deep.equal([{ wallet: WALLET_A, pixels: 3 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test:sdk`
Expected: FAIL — `Cannot find module './leaderboard'` (or missing exports).

- [ ] **Step 3: Implement `packages/sdk/leaderboard.ts`**

```ts
import type { PublicKey } from "@solana/web3.js";
import type { PixlProgram } from "./accounts";
import type { SeasonContributor } from "./seasons";

export type LeaderboardRow = { wallet: string; pixels: number };
export type LifetimeLeader = { wallet: string; lifetimePixels: number };

/** Sort a copy of `rows`: pixels desc, then wallet base58 asc (deterministic). */
export function sortRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort(
    (a, b) => b.pixels - a.pixels || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0)
  );
}

/** 1-indexed pagination with out-of-range page clamped to the last page. */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number
): { rows: T[]; page: number; pageCount: number; total: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: clamped, pageCount, total };
}

/** 1-indexed rank of `wallet` in `rows`, or null when absent. */
export function rankOfWallet(wallet: string, rows: LeaderboardRow[]): number | null {
  const i = rows.findIndex((r) => r.wallet === wallet);
  return i === -1 ? null : i + 1;
}

/** Player-PDA base58 -> wallet base58 map, built from `Player.all()` rows. */
export function buildPlayerWalletMap(
  players: { publicKey: PublicKey; wallet: PublicKey }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) map.set(p.publicKey.toBase58(), p.wallet.toBase58());
  return map;
}

/** Resolve each contributor's Player PDA to a wallet; drop unmapped; sorted. */
export function resolveContributorWallets(
  contributors: SeasonContributor[],
  walletMap: Map<string, string>
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const c of contributors) {
    const wallet = walletMap.get(c.player);
    if (wallet) rows.push({ wallet, pixels: c.pixelsPainted });
  }
  return sortRows(rows);
}

/** Lifetime leaders from `Player.all()`, sorted lifetime pixels desc then wallet asc. */
export async function fetchLifetimeLeaders(program: PixlProgram): Promise<LifetimeLeader[]> {
  const rows = await program.account.player.all();
  return rows
    .map((r) => ({
      wallet: (r.account as any).wallet.toBase58() as string,
      lifetimePixels: Number((r.account as any).lifetimePixels),
    }))
    .sort(
      (a, b) =>
        b.lifetimePixels - a.lifetimePixels ||
        (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0)
    );
}

/** Lifetime leaders read from the ER clone first, falling back to L1. */
export async function fetchLifetimeLeadersWithFallback(
  erProgram: PixlProgram,
  l1Program: PixlProgram
): Promise<LifetimeLeader[]> {
  try {
    const fromEr = await fetchLifetimeLeaders(erProgram);
    if (fromEr.length > 0) return fromEr;
  } catch {
    // ER unreachable or serves no clones — fall through to L1.
  }
  return fetchLifetimeLeaders(l1Program);
}
```

- [ ] **Step 4: Add the barrel export**

In `packages/sdk/index.ts`, add after the existing `export * from "./seasons";` line:

```ts
export * from "./leaderboard";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn test:sdk`
Expected: PASS (all new `leaderboard` describe blocks green; existing suites still pass).

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/leaderboard.ts packages/sdk/leaderboard.unit.test.ts packages/sdk/index.ts
git commit -m "feat(sdk): leaderboard ranking helpers and lifetime leaders reader"
```

---

### Task 2: Add wallet-tiebreak to per-season contributor sort

**Files:**
- Modify: `packages/sdk/seasons.ts:200-221` (`fetchSeasonContributors` sort)
- Modify: `packages/sdk/sdk.unit.test.ts` (add a tiebreak test if a `fetchSeasonContributors`/sort-level test harness exists; otherwise add a focused pure test — see step 1)

**Interfaces:**
- Consumes: existing `SeasonContributor` shape (`player`, `pixelsPainted`, `joinedAt`).
- Produces: `fetchSeasonContributors` now returns rows sorted pixels desc, then `player` base58 asc (deterministic tiebreak). No signature change.

- [ ] **Step 1: Write the failing test**

The current `.sort((a, b) => b.pixelsPainted - a.pixelsPainted)` in `fetchSeasonContributors` has no deterministic tiebreak. Add a unit test for the ordering rule. Append to `packages/sdk/sdk.unit.test.ts`:

```ts
import { expect } from "chai";
// If not already imported at top of file, add:
// (only add the import if `sortContributors` is not yet imported)
import { sortContributors } from "./seasons";

describe("sortContributors", () => {
  it("sorts by pixels desc then player base58 asc", () => {
    const out = sortContributors([
      { player: "C", pixelsPainted: 7, joinedAt: 1 },
      { player: "A", pixelsPainted: 7, joinedAt: 1 },
      { player: "B", pixelsPainted: 9, joinedAt: 1 },
    ]);
    expect(out.map((c) => c.player)).to.deep.equal(["B", "A", "C"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:sdk`
Expected: FAIL — `sortContributors is not exported` (or undefined).

- [ ] **Step 3: Extract and reuse a `sortContributors` helper**

In `packages/sdk/seasons.ts`, add an exported pure helper near `rankOfPlayer` (around line 120):

```ts
/** Sort contributors: pixels desc, then player base58 asc (deterministic). */
export function sortContributors(rows: SeasonContributor[]): SeasonContributor[] {
  return [...rows].sort(
    (a, b) =>
      b.pixelsPainted - a.pixelsPainted ||
      (a.player < b.player ? -1 : a.player > b.player ? 1 : 0)
  );
}
```

Then in `fetchSeasonContributors` (around lines 209-220), replace the trailing `.sort(...)`:

```ts
  const mapped = rows
    .map((r) => ({
      player: (r.account as any).player.toBase58(),
      pixelsPainted: Number((r.account as any).pixelsPainted),
      joinedAt: Number((r.account as any).joinedAt),
    }))
    // `joined_at == 0` = created on L1 but not yet joined via the ER; those
    // aren't counted in participant_count, so exclude them from the roster too.
    .filter((c) => c.joinedAt > 0);
  return sortContributors(mapped);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:sdk`
Expected: PASS (new `sortContributors` test green; existing suites unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/seasons.ts packages/sdk/sdk.unit.test.ts
git commit -m "feat(sdk): deterministic wallet tiebreak for season contributors"
```

---

### Task 3: Read-only L1 program hook + `useLeaderboard` hook

**Files:**
- Modify: `app/web/lib/program.ts` (add `useReadProgram`)
- Create: `app/web/lib/useLeaderboard.ts`
- Reference (do not edit): `app/web/lib/er.ts:71` (`useErReadProgram`), `app/web/lib/useContribution.ts` (ER/L1 fallback + polling pattern).

**Interfaces:**
- Consumes: `usePixlProgram`, new `useReadProgram` (L1 read-only), `useErReadProgram`; SDK `fetchSeasonContributorsWithFallback`, `fetchLifetimeLeadersWithFallback`, `resolveContributorWallets`, `buildPlayerWalletMap`, `sortRows`, `rankOfWallet`, `LeaderboardRow`.
- Produces:
  - `type LeaderboardTab = "current" | "lifetime" | "past"`
  - `type LeaderboardState = { rows: LeaderboardRow[]; loading: boolean; yourRank: number | null }`
  - `useLeaderboard(tab: LeaderboardTab, seasonAddress: PublicKey | null, wallet: PublicKey | null): LeaderboardState`

- [ ] **Step 1: Add a read-only L1 program hook**

In `app/web/lib/program.ts`, add below `usePixlProgram`:

```ts
import { Keypair } from "@solana/web3.js";

// Read-only L1 program for public reads (no wallet connection required).
export function useReadProgram(): Program<Pixl> {
  const { connection } = useConnection();
  return useMemo(() => {
    const dummy = Keypair.generate();
    const wallet: any = {
      publicKey: dummy.publicKey,
      signTransaction: async () => {
        throw new Error("read-only program cannot sign");
      },
      signAllTransactions: async () => {
        throw new Error("read-only program cannot sign");
      },
    };
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    return new Program(pixlIdl as any, provider) as Program<Pixl>;
  }, [connection]);
}
```

(If `Keypair` is already imported, do not duplicate the import.)

- [ ] **Step 2: Implement `app/web/lib/useLeaderboard.ts`**

```ts
"use client";
import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import {
  fetchSeasonContributorsWithFallback,
  fetchLifetimeLeadersWithFallback,
  buildPlayerWalletMap,
  resolveContributorWallets,
  sortRows,
  rankOfWallet,
  type LeaderboardRow,
} from "../../../packages/sdk";
import { useReadProgram } from "./program";
import { useErReadProgram } from "./er";

export type LeaderboardTab = "current" | "lifetime" | "past";
export type LeaderboardState = {
  rows: LeaderboardRow[];
  loading: boolean;
  yourRank: number | null;
};

// Poll only the live "current" tab; lifetime/past load once per view.
const POLL_MS = 10_000;

export function useLeaderboard(
  tab: LeaderboardTab,
  seasonAddress: PublicKey | null,
  wallet: PublicKey | null
): LeaderboardState {
  const l1 = useReadProgram();
  const er = useErReadProgram();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const seasonB58 = seasonAddress?.toBase58();
  const walletB58 = wallet?.toBase58() ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);

    async function load() {
      try {
        let next: LeaderboardRow[];
        if (tab === "lifetime") {
          const leaders = await fetchLifetimeLeadersWithFallback(er, l1);
          next = sortRows(
            leaders.map((l) => ({ wallet: l.wallet, pixels: l.lifetimePixels }))
          );
        } else {
          if (!seasonAddress) {
            if (!cancelled) {
              setRows([]);
              setLoading(false);
            }
            return;
          }
          // Past seasons are undelegated -> L1 only; current is ER-first.
          const [contributors, players] = await Promise.all([
            tab === "past"
              ? fetchSeasonContributorsWithFallback(l1, l1, seasonAddress)
              : fetchSeasonContributorsWithFallback(er, l1, seasonAddress),
            l1.account.player.all(),
          ]);
          const walletMap = buildPlayerWalletMap(
            players.map((p) => ({
              publicKey: p.publicKey,
              wallet: (p.account as any).wallet,
            }))
          );
          next = resolveContributorWallets(contributors, walletMap);
        }
        if (!cancelled) {
          setRows(next);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    if (tab === "current") {
      const id = setInterval(load, POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tab, seasonB58, l1, er]);

  return {
    rows,
    loading,
    yourRank: walletB58 ? rankOfWallet(walletB58, rows) : null,
  };
}
```

- [ ] **Step 3: Type-check the web app**

Run: `cd app/web && yarn tsc --noEmit`
Expected: PASS (no type errors from the new files).

- [ ] **Step 4: Commit**

```bash
git add app/web/lib/program.ts app/web/lib/useLeaderboard.ts
git commit -m "feat(web): read-only L1 program hook and useLeaderboard hook"
```

---

### Task 4: `/leaderboard` page with tabs, pagination, and states

**Files:**
- Create: `app/web/app/leaderboard/page.tsx`
- Create: `app/web/components/Leaderboard.tsx`
- Modify: `app/web/components/LandingPage.tsx` (add a link to `/leaderboard`)
- Reference (do not edit): `app/web/lib/useSeasons.ts` (season list), `app/web/lib/useLeaderboard.ts`, `packages/sdk` (`paginate`, `fetchAllSeasons`/`SeasonSummary`).

**Interfaces:**
- Consumes: `useLeaderboard`, `useSeasons` (for the ended-season dropdown), `paginate` from `packages/sdk`, `useWallet` from `@solana/wallet-adapter-react`.
- Produces: default-exported Next.js page at route `/leaderboard`; `Leaderboard` client component.

- [ ] **Step 1: Create the page route**

`app/web/app/leaderboard/page.tsx`:

```tsx
import { Leaderboard } from "../../components/Leaderboard";

export default function LeaderboardPage() {
  return (
    <main className="leaderboard-page">
      <Leaderboard />
    </main>
  );
}
```

- [ ] **Step 2: Create the `Leaderboard` component**

`app/web/components/Leaderboard.tsx`. Confirm the `useSeasons` return shape before wiring the dropdown — read `app/web/lib/useSeasons.ts` and use its exported season-summary list (each item exposes `address`, `title`, `id`, `status`). Filter to `status === "ended"` for the Past tab.

```tsx
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
  { id: "lifetime", label: "Lifetime" },
  { id: "past", label: "Past Seasons" },
];

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function Leaderboard() {
  const { publicKey } = useWallet();
  const seasons = useSeasons(); // shape confirmed in step 2 note
  const [tab, setTab] = useState<LeaderboardTab>("current");
  const [page, setPage] = useState(1);
  const [pastSeason, setPastSeason] = useState<string | null>(null);

  const activeSeason = useMemo(
    () => seasons?.find((s) => s.status === "active") ?? null,
    [seasons]
  );
  const endedSeasons = useMemo(
    () => (seasons ?? []).filter((s) => s.status === "ended"),
    [seasons]
  );

  const seasonAddress = useMemo(() => {
    if (tab === "current") return activeSeason ? new PublicKey(activeSeason.address) : null;
    if (tab === "past") return pastSeason ? new PublicKey(pastSeason) : null;
    return null;
  }, [tab, activeSeason, pastSeason]);

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
```

- [ ] **Step 3: Add a link to the leaderboard from the landing page**

In `app/web/components/LandingPage.tsx`, add a Next.js link to `/leaderboard` in the existing hero/nav area (import `Link from "next/link"` if not already present):

```tsx
<Link href="/leaderboard" className="landing__leaderboard-link">
  Leaderboard
</Link>
```

Place it near the primary call-to-action so it is reachable without playing.

- [ ] **Step 4: Type-check the web app**

Run: `cd app/web && yarn tsc --noEmit`
Expected: PASS. If `useSeasons` returns a different shape than assumed (step 2 note), adjust the `seasons` access accordingly and re-run.

- [ ] **Step 5: Build the web app**

Run: `cd app/web && yarn build`
Expected: PASS — `/leaderboard` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add app/web/app/leaderboard app/web/components/Leaderboard.tsx app/web/components/LandingPage.tsx
git commit -m "feat(web): standalone /leaderboard page with tabs, pagination, your-rank"
```

---

### Task 5: Style the leaderboard

**Files:**
- Modify: `app/web/app/globals.css` (append `.leaderboard*` styles)
- Reference (do not edit): existing CSS variables/theme in `app/web/app/globals.css`.

**Interfaces:**
- Consumes: existing CSS custom properties (colors, fonts) already defined in `globals.css`.
- Produces: styling for the class names used in `Leaderboard.tsx` (`.leaderboard`, `__tabs`, `__season`, `__you`, `__state`, `__rows`, `__key`, `__pixels`, `__pager`, `.is-active`, `.is-you`).

- [ ] **Step 1: Inspect the existing theme**

Read the top of `app/web/app/globals.css` to find the defined CSS variables (color palette, font families) so the new styles reuse them rather than hardcoding.

- [ ] **Step 2: Append leaderboard styles**

Add styles at the end of `app/web/app/globals.css` using the existing CSS variables. Requirements: tabs with a clear active state (`.is-active`), a highlighted current-user row (`.is-you`), monospace for wallet keys (`.leaderboard__key`), right-aligned pixel counts, and a centered pager. Match the existing aesthetic (fonts, colors, spacing) — do not introduce new fonts or a purple-on-white scheme. Example skeleton to adapt to the actual variable names found in step 1:

```css
.leaderboard { max-width: 640px; margin: 0 auto; padding: 2rem 1rem; }
.leaderboard__tabs { display: flex; gap: 0.5rem; margin: 1rem 0; }
.leaderboard__tabs button.is-active { /* use theme accent */ }
.leaderboard__rows { list-style: decimal inside; padding: 0; }
.leaderboard__rows li { display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; }
.leaderboard__rows li.is-you { /* highlight with theme accent */ }
.leaderboard__key { font-family: var(--font-mono, monospace); }
.leaderboard__pixels { text-align: right; font-variant-numeric: tabular-nums; }
.leaderboard__pager { display: flex; gap: 1rem; justify-content: center; align-items: center; margin-top: 1rem; }
```

- [ ] **Step 3: Verify build still passes**

Run: `cd app/web && yarn build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/web/app/globals.css
git commit -m "style(web): leaderboard page styling"
```

---

## Self-Review

**Spec coverage:**
- Three tabs (Current/Lifetime/Past) — Task 3 (hook) + Task 4 (UI). ✅
- Sort pixels desc then wallet asc, no points — Task 1 (`sortRows`) + Task 2 (contributor tiebreak). ✅
- ER-first / L1 fallback for totals — Task 1 (`fetchLifetimeLeadersWithFallback`), Task 3 (`fetchSeasonContributorsWithFallback`; past uses L1 as it is undelegated). ✅
- Player keys (wallets) shown — Task 1 (`resolveContributorWallets`, `buildPlayerWalletMap`), Task 4 (`shortKey` render). ✅
- Pagination — Task 1 (`paginate`) + Task 4 (pager). ✅
- Your rank — Task 1 (`rankOfWallet`) + Task 3/4. ✅
- Loading + empty states — Task 4. ✅
- History after season end / Hall of Fame — Task 3/4 Past tab reads persisted `SeasonProfile` accounts on L1. ✅
- Separate page — Task 4 (`/leaderboard`). ✅
- No indexer/DB/points/activity-feed/blueprint — enforced by Global Constraints; no task introduces them. ✅

**Placeholder scan:** No TBD/TODO; all code steps contain full code. The two areas flagged for verification (`useSeasons` return shape in Task 4 step 2/4; existing CSS variable names in Task 5 step 1) include explicit inspect-then-adapt instructions rather than guesses.

**Type consistency:** `LeaderboardRow` (`{wallet, pixels}`) used consistently across Tasks 1, 3, 4. `sortContributors`/`SeasonContributor` (`{player, pixelsPainted, joinedAt}`) consistent Tasks 1–2. `useLeaderboard(tab, seasonAddress, wallet)` signature matches its Task 4 call site. `LifetimeLeader.lifetimePixels` mapped to `LeaderboardRow.pixels` in Task 3.
