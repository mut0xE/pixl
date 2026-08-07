import type { PublicKey } from "@solana/web3.js";
import type { PixlProgram } from "./accounts";

export type SeasonStatus = "active" | "upcoming" | "ended";

export type SeasonSummary = {
  address: string;
  id: number;
  title: string;
  description: string;
  palette: number[];
  imageUri: string;
  canvas: string;
  startTime: number;
  endTime: number;
  completed: boolean;
  status: SeasonStatus;
};

export type SeasonStatsView = {
  totalPixelsPainted: number;
  participantCount: number;
};

export type SeasonContributor = {
  player: string;
  pixelsPainted: number;
  joinedAt: number;
};

export function classifySeason(
  season: { completed: boolean; startTime: number; endTime: number },
  now: number
): SeasonStatus {
  if (season.completed) return "ended";
  if (now < season.startTime) return "upcoming";
  if (now < season.endTime) return "active";
  return "ended";
}

/** Coerce an anchor-decoded season account (BN timings) into a plain summary. */
export function toSeasonSummary(
  address: PublicKey,
  account: any,
  now: number
): SeasonSummary {
  const startTime = Number(account.startTime);
  const endTime = Number(account.endTime);
  const completed = Boolean(account.completed);
  return {
    address: address.toBase58(),
    id: Number(account.id),
    title: account.title,
    description: account.description,
    palette: (account.palette ?? []).map((c: number) => Number(c)),
    imageUri: account.imageUri,
    canvas: account.canvas.toBase58(),
    startTime,
    endTime,
    completed,
    status: classifySeason({ completed, startTime, endTime }, now),
  };
}

// Active first, then upcoming, then ended; within a group, newest start first.
export function sortSeasonsForDisplay(
  seasons: SeasonSummary[]
): SeasonSummary[] {
  const rank: Record<SeasonStatus, number> = {
    active: 0,
    upcoming: 1,
    ended: 2,
  };
  return [...seasons].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.startTime - a.startTime
  );
}

export function summarizeSeasonCounts(
  seasons: SeasonSummary[]
): Record<SeasonStatus, number> {
  return seasons.reduce(
    (acc, s) => {
      acc[s.status] += 1;
      return acc;
    },
    { active: 0, upcoming: 0, ended: 0 } as Record<SeasonStatus, number>
  );
}

// A player's pixels as a percentage of the community total; 0 when total is 0.
export function computeContributionPct(
  yourPixels: number,
  communityPixels: number
): number {
  if (communityPixels <= 0) return 0;
  return (yourPixels / communityPixels) * 100;
}

// Fraction of the `[startTime, endTime)` window elapsed, clamped to 0–100.
export function computeSeasonProgressPct(
  startTime: number,
  endTime: number,
  now: number
): number {
  if (endTime <= startTime) return now >= endTime ? 100 : 0;
  const pct = ((now - startTime) / (endTime - startTime)) * 100;
  return Math.max(0, Math.min(100, pct));
}

// Renders a percentage; true 0 → "0%", positive but tiny → "<0.1%".
export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

// 1-indexed rank of a player in an already-sorted leaderboard, or null.
export function rankOfPlayer(
  player: string,
  contributors: SeasonContributor[]
): number | null {
  const i = contributors.findIndex((c) => c.player === player);
  return i === -1 ? null : i + 1;
}

/** Fetch and classify every Season account the program owns, display-sorted. */
export async function fetchAllSeasons(
  program: PixlProgram,
  now: number = Math.floor(Date.now() / 1000)
): Promise<SeasonSummary[]> {
  const rows = await program.account.season.all();
  const summaries = rows.map((r) =>
    toSeasonSummary(r.publicKey, r.account, now)
  );
  return sortSeasonsForDisplay(summaries);
}

// Fetch and classify a single Season by address, or null if it doesn't exist.
export async function fetchSeasonSummary(
  program: PixlProgram,
  address: PublicKey,
  now: number = Math.floor(Date.now() / 1000)
): Promise<SeasonSummary | null> {
  try {
    const account = await program.account.season.fetch(address);
    return toSeasonSummary(address, account, now);
  } catch {
    return null;
  }
}

/** Season contribution totals, or null if the SeasonStats account is absent. */
export async function fetchSeasonStatsView(
  program: PixlProgram,
  seasonStats: PublicKey
): Promise<SeasonStatsView | null> {
  try {
    const s: any = await program.account.seasonStats.fetch(seasonStats);
    return {
      totalPixelsPainted: Number(s.totalPixelsPainted),
      participantCount: Number(s.participantCount),
    };
  } catch {
    return null;
  }
}

// Read season stats from the ER clone first, falling back to L1.
export async function fetchSeasonStatsViewWithFallback(
  erProgram: PixlProgram,
  l1Program: PixlProgram,
  seasonStats: PublicKey
): Promise<SeasonStatsView | null> {
  try {
    const fromEr = await fetchSeasonStatsView(erProgram, seasonStats);
    if (fromEr) return fromEr;
  } catch {
    // ER unreachable — fall through to L1.
  }
  return fetchSeasonStatsView(l1Program, seasonStats);
}

// Per-player contributions, read from the ER clone first with an L1 fallback.
export async function fetchSeasonContributorsWithFallback(
  erProgram: PixlProgram,
  l1Program: PixlProgram,
  season: PublicKey
): Promise<SeasonContributor[]> {
  try {
    const fromEr = await fetchSeasonContributors(erProgram, season);
    if (fromEr.length > 0) return fromEr;
  } catch {
    // ER unreachable or returned no clones — fall through to L1.
  }
  return fetchSeasonContributors(l1Program, season);
}

/** Per-player contributions for one season, highest pixel count first. */
export async function fetchSeasonContributors(
  program: PixlProgram,
  season: PublicKey
): Promise<SeasonContributor[]> {
  // SeasonProfile layout: discriminator(8) + season(32) at offset 8.
  const rows = await program.account.seasonProfile.all([
    { memcmp: { offset: 8, bytes: season.toBase58() } },
  ]);
  return rows
    .map((r) => ({
      player: (r.account as any).player.toBase58(),
      pixelsPainted: Number((r.account as any).pixelsPainted),
      joinedAt: Number((r.account as any).joinedAt),
    }))
    // `joined_at == 0` = created on L1 but not yet joined via the ER; those
    // aren't counted in participant_count, so exclude them from the roster too.
    .filter((c) => c.joinedAt > 0)
    .sort((a, b) => b.pixelsPainted - a.pixelsPainted);
}
