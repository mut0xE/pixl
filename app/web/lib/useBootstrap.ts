"use client";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  deriveBootstrapStatus,
  deriveGamePda,
  fetchGame,
  fetchSeason,
  fetchPlayer,
  fetchSeasonProfile,
  derivePlayerPda,
  deriveSeasonProfilePda,
  type BootstrapStatus,
  type SessionMeta,
  type SeasonView,
} from "../../../packages/sdk";
import { usePixlProgram } from "./program";
import { loadSessionMeta } from "./session-store";

// undefined = still loading, null = fetched-and-absent
async function fetchOrNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null; // anchor throws "Account does not exist" for missing accounts
  }
}

export function useBootstrap() {
  const program = usePixlProgram();
  const wallet = useWallet();
  const [status, setStatus] = useState<BootstrapStatus>("disconnected");
  const [game, setGame] = useState<any>(undefined);
  const [season, setSeason] = useState<SeasonView | "zero" | null | undefined>(undefined);
  const [seasonAddress, setSeasonAddress] = useState<PublicKey | null>(null);
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [player, setPlayer] = useState<any>(undefined);
  const [profile, setProfile] = useState<any>(undefined);

  const refetch = useCallback(async () => {
    if (!program || !wallet.publicKey) return;
    const pk = wallet.publicKey;
    const [gamePda] = deriveGamePda(program.programId);
    const g = await fetchOrNull(fetchGame(program, gamePda));
    setGame(g);
    if (!g) return;
    if (g.currentSeason.equals(PublicKey.default)) {
      setSeason("zero");
      return;
    }
    setSeasonAddress(g.currentSeason);
    const s = await fetchOrNull(fetchSeason(program, g.currentSeason));
    const sv: SeasonView | null = s
      ? { completed: s.completed, startTime: Number(s.startTime), endTime: Number(s.endTime) }
      : null;
    setSeason(sv);
    const [playerPda] = derivePlayerPda(program.programId, pk);
    setPlayer(await fetchOrNull(fetchPlayer(program, playerPda)));
    const [profilePda] = deriveSeasonProfilePda(program.programId, g.currentSeason, pk);
    setProfile(await fetchOrNull(fetchSeasonProfile(program, profilePda)));
    setSession(loadSessionMeta(pk.toBase58()));
  }, [program, wallet.publicKey?.toBase58()]);

  useEffect(() => {
    if (!wallet.connected) {
      setStatus("disconnected");
      return;
    }
    refetch();
  }, [wallet.connected, refetch]);

  useEffect(() => {
    setStatus(
      deriveBootstrapStatus({
        connected: wallet.connected,
        game,
        season,
        player,
        seasonProfile: profile,
        session,
        now: Math.floor(Date.now() / 1000),
      })
    );
  }, [wallet.connected, game, season, player, profile, session]);

  return { status, refetch, game, season, seasonAddress, session, setSession };
}
