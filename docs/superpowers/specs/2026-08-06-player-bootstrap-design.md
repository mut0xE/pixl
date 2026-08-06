# Player Bootstrap — Design

Date: 2026-08-06
Status: Approved (brainstorming), pending implementation plan

## Goal

Implement wallet connection and the full player bootstrap flow for the Pixl
frontend. The flow ends when a connected wallet has an initialized `Player`, a
`SeasonProfile` for the active season, and a live MagicBlock session key.
**Painting is out of scope.**

### Hard requirements

- Clear transaction states for every on-chain action.
- Clear, verbatim-derived error messages.
- **Never initialize accounts automatically.** Every account-creating
  transaction is behind an explicit user action (button click).
- Do not implement painting.

## Stack decisions

- **Frontend:** Next.js (App Router) in `app/web/` (currently empty).
- **Wallet:** `@solana/wallet-adapter-react` (+ `-wallets`, `-react-ui`).
- **Chain libs:** reuse existing `packages/sdk` on `@coral-xyz/anchor` 0.32.1 +
  `@solana/web3.js` v1. No migration to `@solana/kit`.
- **Session key secret storage:** in React memory only (ref/state). Only
  non-secret metadata (session-signer pubkey, session-token PDA, `validUntil`)
  is persisted to `localStorage`, keyed by wallet pubkey, for status display.

Rationale for session storage: the MagicBlock session-keys security checklist
requires session secret material to live in memory or protected device storage
and never be logged or committed. The engine example persists the secret to a
`.env` file, which is a CLI convenience unsuitable for a browser. In-memory
secret + metadata-only persistence is the correct browser adaptation. On reload
the secret is gone, so the UI shows "Set Up Session" again.

## New SDK builders — `packages/sdk/bootstrap.ts`

The SDK currently has no `init_player` / `join_season` builders. Add pure,
instruction-only builders (no wallet dependency, unit-testable):

- `resolveBootstrapAccounts(programId, wallet, season)` — pure PDA derivation
  (game, player, seasonStats, seasonProfile) reusing `pda.ts`.
- `buildInitPlayerIx(program, { wallet })` — matches the on-chain `InitPlayer`
  context: `wallet` (signer, mut), `game` PDA (mut), `player` PDA (init),
  `systemProgram`.
- `buildJoinSeasonIx(program, { wallet, season })` — matches `JoinSeason`:
  `wallet` (signer, mut), `player` PDA, `season`, `seasonStats` PDA (mut),
  `seasonProfile` PDA (init), `systemProgram`.

Exported from `packages/sdk/index.ts`.

## Active season resolution

The `Game` account holds `current_season` (Pubkey) and `current_season_id`
(u32). The active season is read from `Game`, then the `Season` account is
fetched to check `start_time <= now < end_time` and `completed == false`.

Terminal info states (not errors):
- `Game.current_season` is the default/zero pubkey → "No active season yet."
- Season `completed == true`, or `now` outside `[start_time, end_time)` →
  "No active season — check back later."

## Bootstrap state machine

A framework-agnostic pure reducer plus a React hook that drives it.

Pure reducer (unit-tested):

```
deriveBootstrapStatus({ game, season, player, seasonProfile, session, now })
  -> BootstrapStatus
```

`BootstrapStatus`:

```
disconnected
connecting
loading_game
no_active_season          (terminal info)
loading_player
player_missing            (action: Create Player -> init_player, L1)
loading_profile
season_profile_missing    (action: Join Season -> join_season, L1)
session_missing           (action: Set Up Session -> create_session_v2, L1)
session_expired           (action: Renew Session)
ready
```

Rules:
- A `null` account fetch (account-not-found) is a normal state, never an error.
- No status transition triggers a transaction. Account-creating statuses render
  an action button; nothing fires without a click.
- `now` is passed in so the reducer stays pure and testable.

React hook `useBootstrap()`:
- Reads wallet from wallet-adapter.
- Fetches `Game` -> `Season` -> `Player` -> `SeasonProfile` via SDK helpers.
- Holds the in-memory session object; reads metadata from `localStorage` on
  mount to render "expired" vs "none".
- Re-fetches after each successful action.

## Transaction & error states

Each action owns a `TxState`:

```
idle | building | awaiting_signature | confirming | success | error
```

Rendered as inline status text + spinner; on `success`, an explorer link to the
signature. A `normalizeError(err)` helper unwraps Anchor
`SendTransactionError` / program error codes into readable messages
(e.g. `SeasonNotActive`, `PlayerNotInitialized`, user-rejected signature,
insufficient SOL). No silent catches; the raw message is always surfaced.

## Session key setup

Adapt the existing `session.ts` `create_session_v2` builder to a wallet-adapter
path (the current `createSessionV2` expects a raw `Signer`):

1. Generate the session `Keypair` client-side (in memory).
2. Build the `create_session_v2` instruction (target program = Pixl program id,
   authority = wallet, session signer = generated key, `validUntil`, one-time
   `topUpLamports` to fund the session signer's rent + fees).
3. Wallet signs as fee payer; session keypair partial-signs. Submit on **L1
   base layer** (matches the engine example).
4. Persist metadata (signer pubkey, token PDA, `validUntil`) to `localStorage`;
   keep the secret in memory only.
5. "Renew" repeats setup when expired.

ER visibility of the session token is a painting-time concern and is only noted
here, not implemented (painting is out of scope).

## Testing & verification

- **Unit tests** (`ts-mocha`, alongside `packages/sdk/sdk.unit.test.ts`):
  - `bootstrap.ts` builders: correct program id, account metas, signer/writable
    flags, and PDA correctness for `init_player` and `join_season`.
  - `deriveBootstrapStatus` reducer: every branch (disconnected, no season,
    missing player, missing profile, session missing/expired, ready).
- **On-chain read check**: a small script against `ANCHOR_PROVIDER_URL` that
  fetches + decodes `Game`, resolves `current_season`, and confirms the `Season`
  decodes — proves derivations match live state without a browser.
- `yarn typecheck` passes for the whole workspace including `app/web`.
- Manual dev-server smoke: `next dev` / `next build` succeeds.
- No automated browser E2E (not automatable in this environment).

## Out of scope

- Painting (`paint_pixel`) and any ER gameplay transactions.
- Delegation of player/profile accounts to the ER.
- Admin flows (season creation, commit/undelegate).
- Canvas rendering.
