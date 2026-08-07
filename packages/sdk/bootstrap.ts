import type { PublicKey, TransactionInstruction } from "@solana/web3.js";

import type { PixlProgram } from "./accounts";
import {
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
} from "./pda";

export type BootstrapAccounts = {
  game: PublicKey;
  player: PublicKey;
  seasonStats: PublicKey;
  seasonProfile: PublicKey;
};

/** Pure PDA derivation for the bootstrap flow. `season` is the active Season address. */
export function resolveBootstrapAccounts(
  programId: PublicKey,
  wallet: PublicKey,
  season: PublicKey
): BootstrapAccounts {
  return {
    game: deriveGamePda(programId)[0],
    player: derivePlayerPda(programId, wallet)[0],
    seasonStats: deriveSeasonStatsPda(programId, season)[0],
    seasonProfile: deriveSeasonProfilePda(programId, season, wallet)[0],
  };
}

/** Matches the on-chain `InitPlayer` context. */
export function buildInitPlayerIx(
  program: PixlProgram,
  args: { wallet: PublicKey }
): Promise<TransactionInstruction> {
  return program.methods
    .initPlayer()
    .accounts({
      wallet: args.wallet,
    })
    .instruction();
}

export function buildInitSeasonProfileIx(
  program: PixlProgram,
  args: { wallet: PublicKey; season: PublicKey }
): Promise<TransactionInstruction> {
  return program.methods
    .initSeasonProfile()
    .accounts({
      wallet: args.wallet,
      season: args.season,
    })
    .instruction();
}

export function buildJoinSeasonIx(
  program: PixlProgram,
  args: {
    payer: PublicKey;
    wallet: PublicKey;
    season: PublicKey;
    sessionToken?: PublicKey | null;
  }
): Promise<TransactionInstruction> {
  const [player] = derivePlayerPda(program.programId, args.wallet);
  const [seasonStats] = deriveSeasonStatsPda(program.programId, args.season);
  const [seasonProfile] = deriveSeasonProfilePda(
    program.programId,
    args.season,
    args.wallet
  );
  return program.methods
    .joinSeason()
    .accountsPartial({
      payer: args.payer,
      player,
      season: args.season,
      seasonStats,
      seasonProfile,
      sessionToken: args.sessionToken ?? null,
    })
    .instruction();
}
