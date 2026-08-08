"use client";
import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import {
  fetchSeasonContributorsWithFallback,
  buildPlayerWalletMap,
  resolveContributorWallets,
  rankOfWallet,
  type LeaderboardRow,
} from "../../../packages/sdk";
import { useReadProgram } from "./program";
import { useErReadProgram } from "./er";

export type LeaderboardTab = "current" | "past";
export type LeaderboardState = {
  rows: LeaderboardRow[];
  loading: boolean;
  yourRank: number | null;
};

// Poll only the live "current" tab; lifetime/past load once per view.
const POLL_MS = 10_000;

export function useLeaderboard(
  tab: LeaderboardTab,
  seasonAddress: PublicKey | null,
  wallet: PublicKey | null
): LeaderboardState {
  const l1 = useReadProgram();
  const er = useErReadProgram();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const seasonB58 = seasonAddress?.toBase58();
  const walletB58 = wallet?.toBase58() ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRows([]);

    async function load() {
      try {
        if (!seasonAddress) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        // Past seasons are undelegated -> L1 only; current is ER-first.
        const [contributors, players] = await Promise.all([
          tab === "past"
            ? fetchSeasonContributorsWithFallback(l1, l1, seasonAddress)
            : fetchSeasonContributorsWithFallback(er, l1, seasonAddress),
          l1.account.player.all(),
        ]);
        const walletMap = buildPlayerWalletMap(
          players.map((p) => ({
            publicKey: p.publicKey,
            wallet: (p.account as any).wallet,
          }))
        );
        const next = resolveContributorWallets(contributors, walletMap);
        if (!cancelled) {
          setRows(next);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    if (tab === "current") {
      const id = setInterval(load, POLL_MS);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [tab, seasonB58, l1, er]);

  return {
    rows,
    loading,
    yourRank: walletB58 ? rankOfWallet(walletB58, rows) : null,
  };
}
