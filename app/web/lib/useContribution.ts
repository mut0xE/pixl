"use client";
import { useEffect, useState } from "react";
import type { PublicKey, Keypair } from "@solana/web3.js";
import {
  derivePlayerPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
  fetchSeasonStatsViewWithFallback,
  fetchSeasonContributorsWithFallback,
  rankOfPlayer,
} from "../../../packages/sdk";
import { usePixlProgram } from "./program";
import { useErProgram, getErConnection } from "./er";

// Community-contribution figures for the active season (ER-first, then L1).
export type Contribution = {
  communityPixels: number;
  yourPixels: number;
  rank: number | null;
  participants: number;
};

// Rank + participant count come from a leaderboard read we poll; the two headline
// numbers update live off the ER account subscriptions below.
const POLL_MS = 10_000;

export function useContribution(
  seasonAddress: PublicKey | null,
  wallet: PublicKey | null,
  sessionSecret: Keypair | null
) {
  const program = usePixlProgram();
  const erProgram = useErProgram(sessionSecret);
  const [data, setData] = useState<Contribution | null>(null);

  const seasonB58 = seasonAddress?.toBase58();
  const walletB58 = wallet?.toBase58();

  // Slow path: full leaderboard read for rank + participants, with an L1
  // fallback for ended/undelegated seasons the ER no longer clones.
  useEffect(() => {
    if (!program || !seasonAddress || !wallet) {
      setData(null);
      return;
    }
    let cancelled = false;

    async function load() {
      const er = erProgram ?? program!;
      const [stats] = deriveSeasonStatsPda(program!.programId, seasonAddress!);
      const [profilePda] = deriveSeasonProfilePda(
        program!.programId,
        seasonAddress!,
        wallet!
      );
      try {
        const [statsView, contributors, myProfile] = await Promise.all([
          fetchSeasonStatsViewWithFallback(er, program!, stats),
          fetchSeasonContributorsWithFallback(er, program!, seasonAddress!),
          // Direct PDA read: the ER doesn't serve getProgramAccounts for delegated
          // clones, so a single-account fetch gives the true "your pixels" count.
          fetchProfilePixels(er, program!, profilePda),
        ]);
        if (cancelled) return;
        // SeasonProfile.player stores the Player PDA, not the wallet pubkey.
        const me = derivePlayerPda(program!.programId, wallet!)[0].toBase58();
        const mine = contributors.find((c) => c.player === me);
        const yours = Math.max(myProfile, mine?.pixelsPainted ?? 0);
        // Merge without clobbering a fresher live figure from the subscriptions.
        setData((prev) => ({
          communityPixels: Math.max(
            prev?.communityPixels ?? 0,
            statsView?.totalPixelsPainted ?? 0
          ),
          yourPixels: Math.max(prev?.yourPixels ?? 0, yours),
          rank: rankOfPlayer(me, contributors),
          participants: statsView?.participantCount ?? contributors.length,
        }));
      } catch {
        // Leave any prior figures on screen rather than blanking the card.
      }
    }

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [program, erProgram, seasonB58, walletB58]);

  // Live path: subscribe to the two headline accounts on the ER so the counters
  // tick up the instant a paint settles. ER data is decoded with the L1 coder.
  useEffect(() => {
    if (!program || !seasonAddress || !wallet) return;
    const conn = getErConnection();
    const [statsPda] = deriveSeasonStatsPda(program.programId, seasonAddress);
    const [profilePda] = deriveSeasonProfilePda(
      program.programId,
      seasonAddress,
      wallet
    );

    const statsSub = conn.onAccountChange(
      statsPda,
      (info) => {
        let decoded: any;
        try {
          decoded = program.coder.accounts.decode("seasonStats", info.data);
        } catch {
          return;
        }
        const total = Number(decoded.totalPixelsPainted);
        const participants = Number(decoded.participantCount);
        setData((prev) => ({
          communityPixels: total,
          yourPixels: prev?.yourPixels ?? 0,
          rank: prev?.rank ?? null,
          participants,
        }));
      },
      "confirmed"
    );

    const profileSub = conn.onAccountChange(
      profilePda,
      (info) => {
        let decoded: any;
        try {
          decoded = program.coder.accounts.decode("seasonProfile", info.data);
        } catch {
          return;
        }
        const mine = Number(decoded.pixelsPainted);
        setData((prev) => ({
          communityPixels: prev?.communityPixels ?? 0,
          yourPixels: mine,
          rank: prev?.rank ?? null,
          participants: prev?.participants ?? 0,
        }));
      },
      "confirmed"
    );

    return () => {
      void conn.removeAccountChangeListener(statsSub);
      void conn.removeAccountChangeListener(profileSub);
    };
  }, [program, seasonB58, walletB58]);

  return data;
}

// Read a single SeasonProfile's pixel count, ER-first with an L1 fallback.
// Returns 0 when the profile doesn't exist on either (player hasn't joined).
async function fetchProfilePixels(
  erProgram: ReturnType<typeof usePixlProgram>,
  l1Program: ReturnType<typeof usePixlProgram>,
  profilePda: PublicKey
): Promise<number> {
  const read = async (p: NonNullable<typeof l1Program>) => {
    const acc: any = await p.account.seasonProfile.fetch(profilePda);
    return Number(acc.pixelsPainted);
  };
  try {
    if (erProgram) return await read(erProgram);
  } catch {
    // Not on the ER (undelegated / ended) — fall through to L1.
  }
  try {
    if (l1Program) return await read(l1Program);
  } catch {
    // No profile yet.
  }
  return 0;
}
