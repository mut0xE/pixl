# Admin Dashboard — Design

Date: 2026-08-06
Prompt: 13.1 — Build Admin Dashboard (authority-only season lifecycle console).

## Goal

An authority-gated admin console at `/admin` for the full season lifecycle:
create → delegate → run → commit final state → undelegate shared state →
end → export snapshot. Every step surfaces its transaction status and result.

## Access control

- `useAdmin()` fetches the `Game` account (`deriveGamePda`) and exposes
  `authority`, `currentSeason`, and `isAuthority` (connected wallet ===
  `game.authority`).
- The entire dashboard is gated: disconnected or non-authority wallets see an
  access-denied screen. No admin action is rendered otherwise (hide, not just
  disable).

## Panels (all actions run through the existing `TxButton`)

`TxButton` already renders building → awaiting-signature → confirming → success
(+ explorer link) → error, which satisfies "show every transaction step and
result".

1. **Create Season** (`CreateSeasonForm.tsx`)
   - Fields: title, description, palette editor (hex swatches → `u32`
     RRGGBBAA array), blueprint **URI** (string only — the program stores no
     blueprint pixels, only `Season.image_uri`), canvas width/height,
     start/end datetime (→ unix `BN`), season id.
   - Submits `buildCreateSeasonWithDelegationTx`: one transaction that
     initializes Season + Canvas + SeasonStats **and** delegates canvas +
     stats to the ER. The ephemeral canvas keypair signs in-memory then is
     discarded; the admin wallet is fee payer.

2. **Season lifecycle** (`SeasonLifecyclePanel.tsx`)
   - **Commit final state** and **Undelegate** → a single new SDK builder
     `buildCommitGameplayStateIx({ undelegate })` (ER instruction
     `commit_gameplay_state(bool)`), signed by the admin wallet via an
     AnchorProvider bound to the **ER RPC** (`useErAdminProgram`).
   - **End season** → new SDK builder `buildEndSeasonIx` (L1 instruction
     `end_season`), behind an explicit confirm dialog.
   - Note in UI: player-side accounts (Player/SeasonProfile) undelegate via
     `commit_and_undelegate_player`, signed by each *player* — outside admin
     scope. The admin panel only finalizes the shared canvas + stats.

3. **Export snapshot** (`ExportSnapshot.tsx`)
   - Reads the final canvas (`fetchCanvas`), downloads a **PNG** (palette
     colors, optional scale) and a **JSON** `{ width, height, palette,
     indices }`.

## New SDK code (`packages/sdk`)

- `buildEndSeasonIx(program, { authority, game, season, canvas })` — L1.
- `buildCommitGameplayStateIx(program, { authority, season, seasonStats,
  canvas, undelegate })` — ER; injects `magic_program` / `magic_context`.
- Pure export helpers: `canvasToSnapshotJson({ width, height, palette,
  indices })` and `paletteIndexToRgba` — unit-tested via `yarn test:sdk`.
- PNG rasterization lives in a web `lib/` helper (needs DOM canvas), not the
  SDK.

## Security

All signing goes through wallet-adapter or the in-memory ephemeral canvas
keypair. No private key is ever displayed or persisted.

## Aesthetics

Reuse the established terminal/pixel language (ink/paper/signal tokens,
silkscreen display font, `data-status` chips, `canvas-btn`), extended with an
admin-console accent so it reads as a distinct control surface.

## Verification

- `yarn test:sdk` green (new builder + export helper tests).
- `yarn --cwd app/web typecheck` clean.
- `yarn web:build` compiles.
</content>
</invoke>
