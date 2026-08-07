import type { PublicKey } from "@solana/web3.js";

type HasKey = { key: PublicKey } | PublicKey;

function toKey(value: HasKey): PublicKey {
  return "key" in value ? value.key : value;
}

function assertEquals(
  label: string,
  actual: PublicKey,
  expected: HasKey
): void {
  const expectedKey = toKey(expected);
  if (!actual.equals(expectedKey)) {
    throw new Error(
      `${label}: expected ${expectedKey.toBase58()}, got ${actual.toBase58()}`
    );
  }
}

/** Verifies `season.game == game` and `game.current_season == season`. */
export function assertSeasonBelongsToGame(
  season: { game: PublicKey },
  seasonAddress: PublicKey,
  game: { currentSeason: PublicKey },
  gameAddress: PublicKey
): void {
  assertEquals("season.game", season.game, gameAddress);
  assertEquals("game.currentSeason", game.currentSeason, seasonAddress);
}

/** Verifies `canvas.season == season`. */
export function assertCanvasBelongsToSeason(
  canvas: { season: PublicKey },
  seasonAddress: PublicKey
): void {
  assertEquals("canvas.season", canvas.season, seasonAddress);
}

/** Verifies `player.wallet == wallet`. */
export function assertPlayerOwnedBy(
  player: { wallet: PublicKey },
  wallet: PublicKey
): void {
  assertEquals("player.wallet", player.wallet, wallet);
}

/** Verifies `season_profile.season == season` and `.player == player`. */
export function assertProfileMatches(
  profile: { season: PublicKey; player: PublicKey },
  seasonAddress: PublicKey,
  playerAddress: PublicKey
): void {
  assertEquals("seasonProfile.season", profile.season, seasonAddress);
  assertEquals("seasonProfile.player", profile.player, playerAddress);
}

/** Verifies `season_stats.season == season`. */
export function assertStatsBelongToSeason(
  stats: { season: PublicKey },
  seasonAddress: PublicKey
): void {
  assertEquals("seasonStats.season", stats.season, seasonAddress);
}
