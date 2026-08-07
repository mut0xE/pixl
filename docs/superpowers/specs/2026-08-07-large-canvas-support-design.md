# Large Canvas Support + Copyable Pubkeys

Date: 2026-08-07
Status: Approved

## Problem

The admin "Create Season" form rejects any canvas over ~10,193 px
("Canvas exceeds the 10,193 px single-tx creation limit"), so 256×256,
512×512, etc. cannot be created. The on-chain program already supports up to
`MAX_CANVAS_PIXELS = 1024 * 1024` — the limitation is entirely client-side.

## Root Cause

The canvas account is `#[account(zero)]`: the client pre-creates it with
`SystemProgram.createAccount` and the program only writes into it. Two Solana
size limits are relevant, and they live in different places:

- `MAX_PERMITTED_DATA_LENGTH = 10 MiB` (system-interface) — the cap on a single
  top-level `SystemProgram.createAccount`. A standalone createAccount can
  allocate up to 10 MiB.
- `MAX_PERMITTED_DATA_INCREASE = 10 KiB` (account-info/entrypoint) — the cap on
  how much an account may grow **while owned by an executing BPF program**,
  measured against its data length at the **start of the transaction**.

Today `buildCreateSeasonWithDelegationTx` bundles `createAccount` **and**
`start_season` (a pixl BPF instruction) into one transaction. Within that tx the
canvas jumps 0 → full size, and because pixl touches the account in the same tx,
the 10 KiB per-transaction growth limit applies → anything larger fails. The SDK
encodes this as an artificial `CANVAS_CREATE_MAX_BYTES = 10_240` guard and the
form as `capacity > 10_193`.

**No on-chain change is required.** `start_season` already accepts arbitrary
`canvas_width`/`canvas_height` (validated against `MAX_CANVAS_PIXELS`) and only
requires the account already be large enough (`data_len >=
canvas_account_space_for(total_pixels)`).

## Design

### Fix: split the transaction by size

The canvas account must be allocated at full size in a transaction that no BPF
program touches, so only the 10 MiB System cap applies.

- **Small canvas** (`canvasAccountSpace(w,h) <= 10_240`, i.e. ≤ ~10,191 px):
  keep the current single transaction — createAccount + start_season +
  delegate_canvas + delegate_stats. Unchanged fast path.
- **Large canvas**: two transactions.
  - **Tx 1** — standalone `SystemProgram.createAccount` at full size (canvas
    keypair signs). Top-level System, so the 10 MiB cap applies, not 10 KiB.
  - **Tx 2** — start_season + delegate_canvas + delegate_stats (canvas keypair
    co-signs delegate_canvas). start_season only *writes into* the already-sized
    account; it does not grow it, so the increase limit is not triggered.

The canvas keypair now signs two sequential transactions instead of one. It
stays in memory across both signatures, then is discarded — the "ephemeral,
never persisted" property is preserved.

### SDK changes

`packages/sdk/canvas.ts`
- Remove `CANVAS_CREATE_MAX_BYTES` and the `RangeError` it drove in
  `buildCreateCanvasAccountIx`.
- Add `SINGLE_TX_CANVAS_MAX_BYTES = 10_240` (the small/large threshold) and a
  helper `canvasFitsSingleTx(width, height): boolean`.
- Keep `canvasAccountSpace`. Validate `width*height <= MAX_CANVAS_PIXELS`
  (mirrored from `packages/shared`) and `space <= MAX_PERMITTED_DATA_LENGTH`.

`packages/sdk/admin.ts`
- Introduce a step-oriented result type:

  ```ts
  export type SeasonCreateStep = {
    label: string;                 // e.g. "Allocate canvas", "Start & delegate"
    instructions: TransactionInstruction[];
    signers: Keypair[];            // canvas keypair when the step needs it
  };
  export type SeasonCreatePlan = {
    steps: SeasonCreateStep[];
    canvas: Keypair;
    season: PublicKey;
    seasonStats: PublicKey;
  };
  ```

- Add `buildCreateSeasonPlan(connection, program, params): Promise<SeasonCreatePlan>`:
  - Small canvas → a single step containing all four instructions (identical to
    today).
  - Large canvas → step 1 = `[createCanvasIx]` (signer: canvas); step 2 =
    `[startSeasonIx, delegateCanvasIx, delegateStatsIx]` (signer: canvas).
- Keep `buildCreateSeasonWithDelegationTx` as a thin wrapper over the small-canvas
  path for existing tests/callers, or update its unit test to the plan shape.

### Frontend changes (`app/web/components/admin/CreateSeasonForm.tsx`)

- Replace `overCap = capacity > 10_193` with `capacity > MAX_CANVAS_PIXELS`
  (imported from `packages/shared`). Keep a sane UI cap of 512×512.
- Show the rent cost of the chosen size (a 512×512 canvas is ~1.8 SOL
  rent-exempt) via `connection.getMinimumBalanceForRentExemption(space)` so the
  admin sees the cost before submitting.
- Replace the single `sendIx` call in `run()` with a sequential loop over
  `plan.steps`, sending each with its own signers via `sendIx`, and surfacing
  progress (e.g. "Allocating canvas…", "Starting & delegating…"). Reuse the
  existing `TxButton` state callback for the status text.

### Part 2 — copyable pubkeys

- New `app/web/components/CopyKey.tsx`: renders a truncated key, copies the full
  base58 to the clipboard on click via `navigator.clipboard.writeText`, and
  confirms with the existing `Toast`.
- Use it for the **Season** and **Canvas** rows in `DetailsTab`
  (`app/web/components/admin/SeasonManage.tsx`), replacing the bare
  `<code>{shortKey(...)}</code>`.

## Testing

- `packages/sdk/sdk.unit.test.ts`: `buildCreateSeasonPlan` returns 1 step for a
  small canvas (64×64), 2 steps for 256×256 and 512×512; the large plan's step 1
  is a lone System createAccount and step 2 carries start_season + both
  delegations; sizes over `MAX_CANVAS_PIXELS` throw.
- Manual/devnet: create a 256×256 season end-to-end and confirm painting +
  delegation still work.
- `CopyKey` is trivial; verified manually.

## Out of Scope

- No on-chain program changes, no `grow_canvas`, no `ready` flag, no redeploy.
- No change to `MAX_CANVAS_PIXELS`.
