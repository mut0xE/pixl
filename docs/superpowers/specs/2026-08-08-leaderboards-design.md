# Leaderboards — Design Spec

**Date:** 2026-08-08
**Status:** Approved
**Scope:** On-chain-read leaderboards for the Pixl hackathon build. No event indexer, no
database, no blueprint/overlay code.

## Goal

Ship Current Season / Lifetime / Past Seasons leaderboards on a dedicated `/leaderboard`
page, sourced entirely from existing on-chain accounts. Rows show the player key (wallet
pubkey) and pixels painted, sorted by pixels with a deterministic wallet tiebreaker.

## Why no indexer

The on-chain program already stores every number the leaderboards need:

- `Player.lifetime_pixels` — lifetime totals (base-layer L1).
- `SeasonProfile.pixels_painted` — per-season, per-player totals.
- `SeasonStats` — season aggregate (participants, total pixels).
- `Season.completed` / `end_time` — season lifecycle for classifying past seasons.

`SeasonProfile` accounts are never closed, so ended-season rankings remain permanently
queryable via `getProgramAccounts`. This gives Past Seasons / Hall-of-Fame history for free
with zero backend. A DB indexer would add a long-running poller against two RPCs, migrations,
and idempotency handling — moving parts that can silently fall behind during a demo. Rejected
for the hackathon.

## Decisions (locked)

- **Data source:** on-chain reads only. No DB.
- **Sort:** pixels painted descending, then wallet base58 ascending (final deterministic
  tiebreaker). No "points" column (no such field exists on-chain).
- **Recent activity feed:** out of scope (the one feature that would require event ingestion).
- **Player keys:** rows display wallet pubkeys.
- **Separate page:** yes — `/leaderboard`.

## Data sources per tab

| Tab | Source accounts | RPC strategy |
|---|---|---|
| Current Season | `SeasonProfile.all()` filtered by active season | ER-first, L1 fallback (`fetchSeasonContributorsWithFallback`) |
| Lifetime | `Player.all()` → `lifetime_pixels` | ER-first, L1 fallback |
| Past Seasons | selected ended season → its `SeasonProfile.all()` | L1 (ended = undelegated) |

**Pixel totals are always read ER-first with an L1 fallback.** Player pixel counts
(`Player.lifetime_pixels`, `SeasonProfile.pixels_painted`) live on the ER while delegated, so
every totals read tries the ER clone first and falls back to L1 when the ER returns nothing
(unreachable, or account not delegated — e.g. ended seasons). This applies to the list reads
and the connected user's own row alike.

**Live-data caveat (accepted):** the Ephemeral Rollup does not serve `getProgramAccounts`
for delegated clones, so the Current Season *list* reads committed L1 counts and can lag live
paints by one commit interval. The connected user's own row can still be read live via a
direct PDA fetch (ER-first), matching the existing `useContribution` pattern.

## SDK additions — `packages/sdk/leaderboard.ts`

- `fetchLifetimeLeaders(program)` → `Player.all()`, mapped to `{ wallet, lifetimePixels }`,
  sorted `lifetimePixels` desc then wallet base58 asc.
- `fetchLifetimeLeadersWithFallback(erProgram, l1Program)` — ER-first, L1 fallback wrapper
  (mirrors `fetchSeasonContributorsWithFallback`): try the ER clone, fall back to L1 when it
  returns no rows.
- **Wallet resolution:** `SeasonProfile.player` holds the *Player PDA*, not the wallet.
  Fetch `Player.all()` once, build a `Map<playerPda, wallet>`, and resolve every per-season
  row to a wallet pubkey. Lifetime rows carry `wallet` directly.
- **Deterministic tiebreak:** update `fetchSeasonContributors`' sort to break pixel ties by
  wallet base58 ascending (currently pixels-only).
- `paginate(rows, page, pageSize)` — pure slice helper returning
  `{ rows, page, pageCount, total }`.
- `rankOfWallet(wallet, rows)` — 1-indexed rank, or `null` if absent (wallet-keyed analogue
  of existing `rankOfPlayer`).

Reuse existing: `fetchSeasonContributors`, `fetchSeasonContributorsWithFallback`,
`fetchAllSeasons`, `deriveSeasonProfilePda`, `derivePlayerPda`.

## UI

- Route: `app/web/app/leaderboard/page.tsx` + a nav link to it.
- Client hook `useLeaderboard(tab, seasonAddress?)`, mirroring `useContribution`'s ER/L1
  fallback and polling structure.
- Tabs: Current Season / Lifetime / Past Seasons.
  - Past Seasons has a dropdown of ended seasons (from `fetchAllSeasons`).
- Row: rank · player key (wallet, truncated with copy button) · pixels painted.
- **Your rank** pinned at the top when a wallet is connected (shown even when off the current
  page of results).
- Pagination: client-side slicing.
- Loading and empty states for every tab.
- Refresh: ~10s polling for Current Season only; Lifetime/Past Seasons load once per view.

## Out of scope

Points column, recent-activity feed, event indexer, database, any blueprint/overlay code.

## Testing

`packages/sdk/leaderboard.unit.test.ts`:

- Sort determinism: pixel ties broken by wallet base58 ascending.
- Pagination edges: empty list, last partial page, out-of-range page.
- PDA→wallet mapping: contributors resolve to correct wallets; unmapped PDA handled.
- `rankOfWallet`: present, absent, tie positions.
