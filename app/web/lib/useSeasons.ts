"use client";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  fetchAllSeasons,
  fetchSeasonSummary,
  fetchSeasonStatsViewWithFallback,
  fetchSeasonContributorsWithFallback,
  deriveSeasonStatsPda,
  type SeasonSummary,
  type SeasonStatsView,
  type SeasonContributor,
} from "../../../packages/sdk";
import { usePixlProgram } from "./program";
import { useErReadProgram } from "./er";

// Enumerate every Season account on-chain (history + any active/upcoming).
export function useSeasons() {
  const program = usePixlProgram();
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    setError(null);
    try {
      setSeasons(await fetchAllSeasons(program));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { seasons, loading, error, refetch };
}

// One Season by address, fetched directly (single account read) so the
// per-season admin view doesn't wait on the whole roster to load on reload.
export function useSeasonSummary(address: string | null) {
  const program = usePixlProgram();
  const [season, setSeason] = useState<SeasonSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!program || !address) {
      setSeason(null);
      return;
    }
    setLoading(true);
    try {
      setSeason(await fetchSeasonSummary(program, new PublicKey(address)));
    } finally {
      setLoading(false);
    }
  }, [program, address]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { season, loading, refetch };
}

export type SeasonDetail = {
  stats: SeasonStatsView | null;
  contributors: SeasonContributor[];
};

// Contribution totals + per-player breakdown for one season.
export function useSeasonDetail(seasonAddress: string | null) {
  const program = usePixlProgram();
  const erProgram = useErReadProgram();
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!program || !seasonAddress) {
        setDetail(null);
        return;
      }
      setLoading(true);
      try {
        const season = new PublicKey(seasonAddress);
        const [statsPda] = deriveSeasonStatsPda(program.programId, season);
        // ER-first, L1-fallback: delegated seasons carry fresher totals on the
        // ER; settled ones read authoritatively from L1.
        const [stats, contributors] = await Promise.all([
          fetchSeasonStatsViewWithFallback(erProgram, program, statsPda),
          fetchSeasonContributorsWithFallback(erProgram, program, season),
        ]);
        if (!cancelled) setDetail({ stats, contributors });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [program, erProgram, seasonAddress]);

  return { detail, loading };
}
