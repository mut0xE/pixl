import { PublicKey } from "@solana/web3.js";
import {
  CANVAS_SEED,
  GAME_SEED,
  PLAYER_SEED,
  SEASON_PROFILE_SEED,
  SEASON_SEED,
  SEASON_STATS_SEED,
} from "../shared";

function seedBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function u32SeedBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(
      `Season id must fit in an unsigned 32-bit integer: ${value}`
    );
  }

  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

export function deriveGamePda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seedBytes(GAME_SEED)], programId);
}

export function deriveSeasonPda(
  programId: PublicKey,
  seasonId: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes(SEASON_SEED), u32SeedBytes(seasonId)],
    programId
  );
}

export function deriveCanvasPda(
  programId: PublicKey,
  season: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes(CANVAS_SEED), season.toBytes()],
    programId
  );
}

export function deriveSeasonStatsPda(
  programId: PublicKey,
  season: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes(SEASON_STATS_SEED), season.toBytes()],
    programId
  );
}

export function derivePlayerPda(
  programId: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes(PLAYER_SEED), wallet.toBytes()],
    programId
  );
}

export function deriveSeasonProfilePda(
  programId: PublicKey,
  season: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seedBytes(SEASON_PROFILE_SEED), season.toBytes(), wallet.toBytes()],
    programId
  );
}
