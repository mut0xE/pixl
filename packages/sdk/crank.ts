import type { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);

export const CRANK_PAYER_SEED = Buffer.from("crank_payer");

export function deriveCrankPayerPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([CRANK_PAYER_SEED], programId)[0];
}

export async function fundCrankPayer(
  connection: Connection,
  funder: Keypair,
  programId: PublicKey,
  lamports = 0.05 * 1e9
) {
  const crankPayer = deriveCrankPayerPda(programId);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: crankPayer,
      lamports,
    })
  );
  return connection.sendTransaction(tx, [funder]);
}

export type CanvasCommitTaskAccounts = {
  authority: PublicKey;
  game: PublicKey;
  season: PublicKey;
  seasonStats: PublicKey;
  canvas: PublicKey;
};

export async function scheduleCanvasCommit(
  erProgram: Program<any>,
  accounts: CanvasCommitTaskAccounts,
  {
    taskId,
    intervalMillis = 30_000,
    iterations = 100,
  }: { taskId: number | BN; intervalMillis?: number; iterations?: number }
): Promise<string> {
  const crankPayer = deriveCrankPayerPda(erProgram.programId);
  return (erProgram.methods as any)
    .scheduleCanvasCommit(
      new BN(taskId),
      new BN(intervalMillis),
      new BN(iterations)
    )
    .accounts({
      payer: accounts.authority,
      game: accounts.game,
      season: accounts.season,
      seasonStats: accounts.seasonStats,
      canvas: accounts.canvas,
      crankPayer,
      magicContext: MAGIC_CONTEXT_ID,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .rpc();
}

export async function cancelCanvasCommit(
  erProgram: Program<any>,
  accounts: { authority: PublicKey; game: PublicKey },
  taskId: number | BN
): Promise<string> {
  return (erProgram.methods as any)
    .cancelCanvasCommit(new BN(taskId))
    .accounts({
      authority: accounts.authority,
      game: accounts.game,
      magicContext: MAGIC_CONTEXT_ID,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .rpc();
}
