// Pure, wallet-agnostic builders for the player-bootstrap flow.
//
// These build instructions only — no signing, no sending, no wallet
// dependency — so they are unit-testable and reusable across CLI/browser.

import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { SystemProgram } from "@solana/web3.js";

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
  const programId = program.programId;
  const game = deriveGamePda(programId)[0];
  const player = derivePlayerPda(programId, args.wallet)[0];
  return program.methods
    .initPlayer()
    .accounts({
      wallet: args.wallet,
      game,
      player,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Matches the on-chain `JoinSeason` context. */
export function buildJoinSeasonIx(
  program: PixlProgram,
  args: { wallet: PublicKey; season: PublicKey }
): Promise<TransactionInstruction> {
  const programId = program.programId;
  const player = derivePlayerPda(programId, args.wallet)[0];
  const seasonStats = deriveSeasonStatsPda(programId, args.season)[0];
  const seasonProfile = deriveSeasonProfilePda(programId, args.season, args.wallet)[0];
  return program.methods
    .joinSeason()
    .accounts({
      wallet: args.wallet,
      player,
      season: args.season,
      seasonStats,
      seasonProfile,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
