# Session

Current phase: Web frontend — admin dashboard (season lifecycle console)
(program/delegation lifecycle below is complete)

---

## Admin dashboard (app/web/app/admin) — 2026-08-06

Authority-gated console at `/admin` for the full season lifecycle. Spec:
`docs/superpowers/specs/2026-08-06-admin-dashboard-design.md`.

Access control: `app/web/lib/useAdmin.ts` fetches the `Game` PDA and exposes
`isAuthority` (connected wallet === `game.authority`). `AdminDashboard` renders
an access-denied screen for disconnected / non-authority wallets — no admin
control is mounted otherwise (hide, not disable). Never touches private keys:
all signing is wallet-adapter or the in-memory ephemeral canvas keypair.

Panels (each action drives the existing `TxButton`, which shows building →
awaiting-signature → confirming → success + explorer link → error):

- **CreateSeasonForm** — title/description, hex-swatch palette editor (→ `u32`
  RRGGBBAA array), blueprint **URI** (string only; no on-chain blueprint px),
  canvas w/h (guards the 10,193-px single-tx `createAccount` cap), start/end
  datetime. Submits `buildCreateSeasonWithDelegationTx` (one tx: init Season +
  Canvas + SeasonStats **and** delegate canvas + stats to the ER).
- **SeasonLifecyclePanel** — season picker → 3 ordered steps: commit checkpoint
  and commit+undelegate via new `buildCommitGameplayStateIx(undelegate)` (ER —
  built offline, submitted over `getErConnection()` signed by the admin wallet);
  `end_season` via new `buildEndSeasonIx` (L1) behind an explicit confirm.
  Notes that Player/SeasonProfile undelegate is player-signed, out of scope.
- **ExportSnapshot** — reads final Canvas from L1, downloads an 8× PNG (DOM
  canvas rasterizer `app/web/lib/exportSnapshot.ts`) + reproducible JSON of
  `{ width, height, palette, indices }`.

New SDK: `packages/sdk/admin.ts` (`buildEndSeasonIx`,
`buildCommitGameplayStateIx`), `packages/sdk/snapshot.ts` (pure
`canvasToSnapshot` / `snapshotToRgbaBytes` / `paletteIndexToRgba`).

Aesthetics: reuses the ink/paper/signal terminal theme (silkscreen display
font, corner ticks, `canvas-btn`) with a distinct admin-console accent.

Verification: `yarn test:sdk` → **75 passing**; `yarn --cwd app/web typecheck`
clean; `yarn web:build` compiles (`/admin` route emitted, 4.32 kB). Not yet
exercised live — no active/delegated season on devnet to drive the ER steps.

---

## Web frontend (app/web) — 2026-08-06

Stack: Next.js 14 (app router) + wallet-adapter + plain `@solana/web3.js` +
Anchor client. Renderer is **Canvas2D ImageData** (no PixiJS) — chosen for a
smooth, dependency-light hackathon build; a 256×256 grid renders as one texture.

Done:

- **Player bootstrap** (earlier): `useBootstrap` status reducer
  (`packages/sdk/status.ts`) drives per-status action buttons
  (create player / join season / set up session) in `BootstrapPanel`.
- **Phase 9.1 — Canvas renderer** (read-only):
  - `packages/sdk/camera.ts` — pure, unit-tested camera math: `fitCamera`,
    `zoomAt` (zoom-to-cursor), `panBy`, `clampOffset`, `screenToCell`,
    `shouldShowGrid`. 13 tests.
  - `app/web/lib/useCanvasData.ts` — fetches layout **from chain**:
    `Season.palette` + `Canvas` (width/height/pixels/frozen) via SDK.
  - `app/web/components/PixlCanvas.tsx` — texture-backed Canvas2D, nearest-
    neighbor, wheel-zoom / drag-pan / FIT, grid above 8×, hover coord, DPR-aware,
    ResizeObserver cleanup. One-time auto-fit guarded by `fittedRef` (order-safe).
- **Season history browser**:
  - `packages/sdk/seasons.ts` — `fetchAllSeasons` (enumerates every `Season`
    account via Anchor `.all()` discriminator filter), `classifySeason`
    (active/upcoming/ended, pure), `fetchSeasonStatsView`,
    `fetchSeasonContributors` (per-player, memcmp on season). 4 tests.
  - `app/web/lib/useSeasons.ts` — `useSeasons` + `useSeasonDetail`.
  - `app/web/components/SeasonBrowser.tsx` — season card grid → detail view
    (reuses `PixlCanvas` + contributions/leaderboard panel). Mounted in the
    `no_active_season` state, replacing the old dead-end message.

On-chain reality (devnet, program `A7fb…6GyQ`): **41 Season accounts exist, all
`completed` (ended), 0 active.** `Game.current_season` is reset to default, which
is why the single-active-season gate showed "no active season". The browser reads
history directly and does not depend on that pointer. ~18 of 41 canvases are
retrievable on base layer; the rest are still delegated or were closed in tests,
so some history tiles will show "canvas unavailable".

Account layouts used (verified against `programs/pixl/src/state.rs`, NOT the
build guide): `SeasonStats { season, total_pixels_painted, participant_count,
bump }` (no blueprint fields); `SeasonProfile { season, player, pixels_painted,
joined_at, bump }` (no points/correct-pixels).

Verification: `yarn test:sdk` → 62 passing; `yarn --cwd app/web typecheck` clean;
`yarn web:build` compiles (only unrelated pino/ox node_modules warnings).

Next (frontend):

- **No season is currently active**, so bootstrap can't reach `ready` and the
  live `PixlCanvas` painting path is unexercised. To demo it, create a season:
  a `scripts/start-season.ts` using `buildCreateSeasonWithDelegationTx` signed by
  the game authority (`T3yw…96AG`) — user has that keypair.
- Phase 9.2 — interactive painting (palette select → click → `paint_pixel` via
  ER → optimistic pixel patch). Requires an active, delegated season.
- Optional: read delegated/ended canvases from the ER endpoint (router
  `getDelegationStatus` → `fqdn`) so more history tiles render.
- Wire `refetch`/polling or ER websocket subscription for live canvas updates.

---

## Program / delegation (complete)

Current phase: MagicBlock delegation + commit/undelegate lifecycle

Done:

- Base workspace scaffold
- Root scripts for format, lint, typecheck, test
- Canonical spec entry file
- Shared constants and PDA seed definitions
- Core Solana instructions: `init_game`, `init_player`, `start_season`,
  `join_season`, `paint_pixel`, `end_season` (with tests, energy unit tests)
- MagicBlock delegation: `delegate_any` (Player / SeasonProfile / SeasonStats,
  PDA-based) and `delegate_canvas` (keypair-based canvas account)
- MagicBlock commit / undelegate handlers, wired into `lib.rs` and building:
  - `commit_gameplay_state` — admin checkpoint of Canvas + SeasonStats to L1,
    stays delegated
  - `commit_and_undelegate_shared` — admin finalization of Canvas + SeasonStats
  - `commit_and_undelegate_player` — player finalization of Player + SeasonProfile
- Authorization + PDA linkage constraints on all commit contexts
- De-duplicated commit code: shared `CommitSharedState` context reused for
  checkpoint + shared-undelegate; builder plumbing behind `commit_only` /
  `commit_and_undelegate` helpers
- e2e test (`tests/e2e.ts`) covering the full delegated lifecycle:
  paint (ER) -> `commit_gameplay_state` -> `commit_and_undelegate_shared` ->
  `commit_and_undelegate_player` -> `end_season` (L1), with L1 propagation polling
- README reconciled with the actual 3 commit/undelegate instructions

Commit / undelegate model (mental map):

- Delegate = move the live copy of an account into the ER; L1 copy freezes under
  the delegation program.
- `commit` = push a snapshot of ER state back to L1, keep painting (checkpoint).
- `commit_and_undelegate` = push final snapshot AND return L1 ownership to the
  program, destroying the ER copy (finalization).
- The `MagicIntentBundleBuilder` call does the work; the account structs only
  enforce authorization. `magic_context` / `magic_program` are injected by
  `#[commit]`; undelegation is enabled by `#[ephemeral]` on the module.

Where each instruction runs:

- L1: `init_*`, `start_season`, `join_season`, `delegate_*`, `end_season`
- ER: `paint_pixel`, `commit_gameplay_state`, `commit_and_undelegate_*`

Season lifecycle:

`start_season` (L1) -> `delegate_*` (L1) -> `paint_pixel` xN (ER) ->
`commit_gameplay_state` checkpoints (ER, optional/repeatable) ->
`commit_and_undelegate_shared` (ER) -> wait for L1 propagation -> `end_season` (L1)

Next:

- Run the e2e suite against a live Surfpool + MagicBlock validator (the
  commit/undelegate tests skip when `ER_RPC_URL` is unset)
- Decide canvas sizing: keypair `createAccount` is required for a single large
  (1024x1024 = ~1MB, ~7.3 SOL rent) canvas; 512x512 (~1.8 SOL) is the MVP default
  candidate; tiled PDAs are the v2 scale path
- Canvas keypair must be retained to re-delegate after undelegation

Notes:

- Project name is Pixl.
- `docs/pixora-spec-v2.md` remains the source of truth when code and notes diverge.
- Canvas is a client-created keypair account (not a PDA) because a 1MB account
  cannot be `init`'d as a PDA in one instruction (10KB per-instruction alloc cap).
