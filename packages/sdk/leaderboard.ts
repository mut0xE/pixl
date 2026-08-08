import type { PublicKey } from "@solana/web3.js";
import type { SeasonContributor } from "./seasons";

export type LeaderboardRow = { wallet: string; pixels: number };

/** Sort a copy of `rows`: pixels desc, then wallet base58 asc (deterministic). */
export function sortRows(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows].sort(
    (a, b) => b.pixels - a.pixels || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0)
  );
}

/** 1-indexed pagination with out-of-range page clamped to the last page. */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number
): { rows: T[]; page: number; pageCount: number; total: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (clamped - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: clamped, pageCount, total };
}

/** 1-indexed rank of `wallet` in `rows`, or null when absent. */
export function rankOfWallet(wallet: string, rows: LeaderboardRow[]): number | null {
  const i = rows.findIndex((r) => r.wallet === wallet);
  return i === -1 ? null : i + 1;
}

/** Player-PDA base58 -> wallet base58 map, built from `Player.all()` rows. */
export function buildPlayerWalletMap(
  players: { publicKey: PublicKey; wallet: PublicKey }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of players) map.set(p.publicKey.toBase58(), p.wallet.toBase58());
  return map;
}

/** Resolve each contributor's Player PDA to a wallet; drop unmapped; sorted. */
export function resolveContributorWallets(
  contributors: SeasonContributor[],
  walletMap: Map<string, string>
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const c of contributors) {
    const wallet = walletMap.get(c.player);
    if (wallet) rows.push({ wallet, pixels: c.pixelsPainted });
  }
  return sortRows(rows);
}
