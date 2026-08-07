// Admin-side transaction builders.
//
// The Canvas account uses Anchor's `#[account(zero)]` constraint, meaning the
// program does not allocate it — the client must pre-create it (owned by the
// program, rent-exempt, zeroed) in the same transaction as `start_season`.
//
// The canvas keypair is ephemeral BUT it is needed twice within this flow: once
// to authorize `createAccount`, and again for `delegate_canvas` (a keypair
// account has no PDA seeds, so it must sign its own delegation — see
// `DelegateCanvas` in `delegate_gameplay.rs`). Because the canvas stays
// delegated for the whole season (commit-without-undelegate), it is delegated
// exactly once. Doing create + delegate in a single transaction lets the
// keypair live only in memory for that one signature, then be discarded.

import type { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Pixl } from "../../target/types/pixl";
import {
  MAX_PERMITTED_DATA_LENGTH,
  canvasAccountSpace,
  canvasFitsSingleTx,
} from "./canvas";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "./crank";
import {
  derivePlayerPda,
  deriveSeasonPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
} from "./pda";

type PixlProgram = Program<Pixl>;

// MagicBlock delegation program + the PDA seeds it uses for the per-account
// buffer / record / metadata accounts.
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const BUFFER_SEED = Buffer.from("buffer");
const DELEGATION_RECORD_SEED = Buffer.from("delegation");
const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");

export function deriveDelegationBufferPda(
  ownerProgram: PublicKey,
  target: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [BUFFER_SEED, target.toBuffer()],
    ownerProgram
  )[0];
}

export function deriveDelegationRecordPda(target: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_RECORD_SEED, target.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export function deriveDelegationMetadataPda(target: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_SEED, target.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export type CreateCanvasAccountIx = {
  /** Ephemeral keypair for the canvas account; must sign the transaction. */
  canvas: Keypair;
  /** The `SystemProgram.createAccount` instruction. */
  instruction: TransactionInstruction;
  /** Account size in bytes. */
  space: number;
};

/**
 * Builds the instruction that pre-creates the canvas account client-side.
 * `canvas` MUST sign the transaction (via `tx.partialSign(canvas)`).
 */
export async function buildCreateCanvasAccountIx(
  connection: Connection,
  programId: PublicKey,
  payer: PublicKey,
  width: number,
  height: number,
  canvas: Keypair = Keypair.generate()
): Promise<CreateCanvasAccountIx> {
  const space = canvasAccountSpace(width, height);
  if (space > MAX_PERMITTED_DATA_LENGTH) {
    throw new RangeError(
      `Canvas of ${width}x${height} needs ${space} bytes, but a single ` +
        `account is capped at ${MAX_PERMITTED_DATA_LENGTH} bytes (10 MiB). ` +
        `Reduce the canvas size.`
    );
  }

  const lamports = await connection.getMinimumBalanceForRentExemption(space);
  const instruction = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: canvas.publicKey,
    space,
    lamports,
    programId,
  });

  return { canvas, instruction, space };
}

type DelegateCommon = {
  payer: PublicKey;
  season: PublicKey;
  game: PublicKey;
  /** ER validator, or `null` to let the router assign one. */
  validator?: PublicKey | null;
};

/**
 * `delegate_canvas` instruction. The canvas keypair must be added as a signer of
 * the transaction that carries this instruction.
 */
export function buildDelegateCanvasIx(
  program: PixlProgram,
  params: DelegateCommon & { canvas: PublicKey }
): Promise<TransactionInstruction> {
  const { payer, canvas, season, game, validator = null } = params;
  return (program.methods as any)
    .delegateCanvas()
    .accounts({
      payer,
      bufferCanvas: deriveDelegationBufferPda(program.programId, canvas),
      delegationRecordCanvas: deriveDelegationRecordPda(canvas),
      delegationMetadataCanvas: deriveDelegationMetadataPda(canvas),
      canvas,
      season,
      game,
      validator,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

// Shared `delegate_any` builder. The program validates the target account
// against the `AccountType` variant and signs for it via its PDA seeds, so the
// only transaction signer required is `payer`.
function buildDelegateAnyIx(
  program: PixlProgram,
  accountType: unknown,
  target: PublicKey,
  common: DelegateCommon
): Promise<TransactionInstruction> {
  const { payer, season, game, validator = null } = common;
  return (program.methods as any)
    .delegateAny(accountType)
    .accounts({
      payer,
      bufferTargetAccount: deriveDelegationBufferPda(program.programId, target),
      delegationRecordTargetAccount: deriveDelegationRecordPda(target),
      delegationMetadataTargetAccount: deriveDelegationMetadataPda(target),
      targetAccount: target,
      season,
      game,
      validator,
      ownerProgram: program.programId,
      delegationProgram: DELEGATION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * `delegate_any` for the season-stats PDA. Admin-owned: the on-chain check
 * requires `game.authority == payer`. Signed by the admin only.
 */
export function buildDelegateSeasonStatsIx(
  program: PixlProgram,
  params: DelegateCommon & { seasonStats: PublicKey }
): Promise<TransactionInstruction> {
  return buildDelegateAnyIx(
    program,
    { seasonStats: { season: params.season } },
    params.seasonStats,
    params
  );
}

/**
 * `delegate_any` for a player's own Player PDA. The on-chain check requires
 * `wallet == payer`, so the player signs for themselves.
 */
export function buildDelegatePlayerIx(
  program: PixlProgram,
  params: DelegateCommon & { wallet: PublicKey }
): Promise<TransactionInstruction> {
  const [player] = derivePlayerPda(program.programId, params.wallet);
  return buildDelegateAnyIx(
    program,
    { player: { wallet: params.wallet } },
    player,
    params
  );
}

/**
 * `delegate_any` for a player's SeasonProfile PDA. The on-chain check requires
 * `wallet == payer`, so the player signs for themselves.
 */
export function buildDelegateSeasonProfileIx(
  program: PixlProgram,
  params: DelegateCommon & { wallet: PublicKey }
): Promise<TransactionInstruction> {
  const [profile] = deriveSeasonProfilePda(
    program.programId,
    params.season,
    params.wallet
  );
  return buildDelegateAnyIx(
    program,
    { seasonProfile: { season: params.season, wallet: params.wallet } },
    profile,
    params
  );
}

export type StartSeasonArgs = {
  seasonId: number;
  title: string;
  description: string;
  palette: number[];
  imageUri: string;
  canvasWidth: number | null;
  canvasHeight: number | null;
  startTime: BN;
  endTime: BN;
};

export type CreateSeasonWithDelegationResult = {
  /** Single transaction: createAccount + start_season + both delegations. */
  transaction: Transaction;
  /** The instructions, exposed so callers can build a v0 tx + lookup table. */
  instructions: TransactionInstruction[];
  /** Ephemeral canvas keypair — must sign before the admin wallet. */
  canvas: Keypair;
  season: PublicKey;
  seasonStats: PublicKey;
};

/** One transaction in a season-creation plan, with the signers it requires. */
export type SeasonCreateStep = {
  /** Human label for progress UI, e.g. "Allocate canvas". */
  label: string;
  instructions: TransactionInstruction[];
  /** Extra signers beyond the fee payer — the canvas keypair when needed. */
  signers: Keypair[];
};

export type SeasonCreatePlan = {
  /** Transactions to send in order. 1 step for small canvases, 2 for large. */
  steps: SeasonCreateStep[];
  /** Ephemeral canvas keypair — signs the allocate + delegate steps. */
  canvas: Keypair;
  season: PublicKey;
  seasonStats: PublicKey;
};

/**
 * Builds the transaction plan to create the canvas account, start the season,
 * and delegate the canvas + season-stats PDA to the ER.
 *
 * Small canvases (`canvasFitsSingleTx`) collapse to a SINGLE transaction
 * carrying createAccount + start_season + both delegations — the account grows
 * 0 → full size within the 10 KiB per-tx limit.
 *
 * Larger canvases exceed that limit, so allocation must happen in its own
 * transaction (a standalone top-level `SystemProgram.createAccount`, capped only
 * by the 10 MiB account size). `start_season` then only writes into the
 * already-sized account, so a second transaction carries start_season + both
 * delegations. The canvas keypair signs both steps.
 */
export async function buildCreateSeasonPlan(
  connection: Connection,
  program: PixlProgram,
  params: {
    authority: PublicKey;
    game: PublicKey;
    args: StartSeasonArgs;
    validator?: PublicKey | null;
    canvas?: Keypair;
  }
): Promise<SeasonCreatePlan> {
  const { authority, game, args, validator = null } = params;
  const width = args.canvasWidth ?? 512;
  const height = args.canvasHeight ?? 512;

  const [season] = deriveSeasonPda(program.programId, args.seasonId);
  const [seasonStats] = deriveSeasonStatsPda(program.programId, season);

  const { canvas, instruction: createCanvasIx } =
    await buildCreateCanvasAccountIx(
      connection,
      program.programId,
      authority,
      width,
      height,
      params.canvas
    );

  const startSeasonIx: TransactionInstruction = await (program.methods as any)
    .startSeason(args)
    .accounts({
      authority,
      game,
      season,
      seasonStats,
      canvas: canvas.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const delegateCanvasIx = await buildDelegateCanvasIx(program, {
    payer: authority,
    canvas: canvas.publicKey,
    season,
    game,
    validator,
  });

  const delegateStatsIx = await buildDelegateSeasonStatsIx(program, {
    payer: authority,
    seasonStats,
    season,
    game,
    validator,
  });

  const steps: SeasonCreateStep[] = canvasFitsSingleTx(width, height)
    ? [
        {
          label: "Create & delegate season",
          instructions: [
            createCanvasIx,
            startSeasonIx,
            delegateCanvasIx,
            delegateStatsIx,
          ],
          signers: [canvas],
        },
      ]
    : [
        {
          label: "Allocate canvas",
          instructions: [createCanvasIx],
          signers: [canvas],
        },
        {
          label: "Start & delegate season",
          // delegate_canvas requires the canvas keypair to sign for itself.
          instructions: [startSeasonIx, delegateCanvasIx, delegateStatsIx],
          signers: [canvas],
        },
      ];

  return { steps, canvas, season, seasonStats };
}

/**
 * Backwards-compatible single-transaction builder. Only valid for canvases that
 * fit in one transaction (`canvasFitsSingleTx`); throws otherwise, directing
 * callers to `buildCreateSeasonPlan`.
 *
 * Signing: `tx.partialSign(result.canvas)` first, then the admin wallet signs as
 * fee payer. The canvas keypair is only ever in memory for this single tx.
 */
export async function buildCreateSeasonWithDelegationTx(
  connection: Connection,
  program: PixlProgram,
  params: {
    authority: PublicKey;
    game: PublicKey;
    args: StartSeasonArgs;
    validator?: PublicKey | null;
    canvas?: Keypair;
  }
): Promise<CreateSeasonWithDelegationResult> {
  const plan = await buildCreateSeasonPlan(connection, program, params);
  if (plan.steps.length !== 1) {
    throw new RangeError(
      "Canvas is too large for a single transaction — use " +
        "buildCreateSeasonPlan and send each step in order."
    );
  }
  const instructions = plan.steps[0].instructions;
  const transaction = new Transaction().add(...instructions);
  return {
    transaction,
    instructions,
    canvas: plan.canvas,
    season: plan.season,
    seasonStats: plan.seasonStats,
  };
}

/**
 * `end_season` — L1 instruction that marks the season completed and freezes the
 * canvas. Signed by the game authority. Runs AFTER the shared state has been
 * committed + undelegated back to L1.
 */
export function buildEndSeasonIx(
  program: PixlProgram,
  params: {
    authority: PublicKey;
    game: PublicKey;
    season: PublicKey;
    canvas: PublicKey;
  }
): Promise<TransactionInstruction> {
  return (program.methods as any)
    .endSeason()
    .accounts({
      authority: params.authority,
      game: params.game,
      season: params.season,
      canvas: params.canvas,
    })
    .instruction();
}

/**
 * `commit_gameplay_state(undelegate)` — ER instruction. With `undelegate=false`
 * it checkpoints Canvas + SeasonStats to L1 (keeps painting); with
 * `undelegate=true` it pushes the FINAL snapshot and returns L1 ownership,
 * destroying the ER copies. The admin (`payer == game.authority`) signs it on
 * the ER connection. `magic_program` / `magic_context` are injected by the
 * `#[commit]` macro and supplied here.
 */
export function buildCommitGameplayStateIx(
  program: PixlProgram,
  params: {
    authority: PublicKey;
    season: PublicKey;
    seasonStats: PublicKey;
    canvas: PublicKey;
    undelegate: boolean;
  }
): Promise<TransactionInstruction> {
  return (program.methods as any)
    .commitGameplayState(params.undelegate)
    .accounts({
      payer: params.authority,
      season: params.season,
      seasonStats: params.seasonStats,
      canvas: params.canvas,
      magicProgram: MAGIC_PROGRAM_ID,
      magicContext: MAGIC_CONTEXT_ID,
    })
    .instruction();
}
