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
          instructions: [startSeasonIx, delegateCanvasIx, delegateStatsIx],
          signers: [canvas],
        },
      ];

  return { steps, canvas, season, seasonStats };
}

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
