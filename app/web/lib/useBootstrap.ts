"use client";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  deriveBootstrapStatus,
  deriveGamePda,
  fetchGame,
  fetchSeason,
  derivePlayerPda,
  deriveSeasonProfilePda,
  type BootstrapStatus,
  type SessionMeta,
  type SeasonView,
} from "../../../packages/sdk";
import { usePixlProgram } from "./program";
import { loadSessionMeta } from "./session-store";

// Anchor throws this exact phrase only when an account is genuinely missing.
// Any other error (429, network, timeout) must NOT be treated as "absent",
// or the state machine wedges on a loading step forever.
function isAccountMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Account does not exist|could not find/i.test(msg);
}

// Retry a read a few times before giving up. Public devnet RPCs routinely
// return transient 429s; a single failure must not wedge bootstrap. A genuine
// "account missing" error is not retried — it resolves immediately to null.
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (isAccountMissing(err)) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

// undefined = still loading, null = fetched-and-absent. Retries transient RPC
// errors; only a genuine "account missing" resolves to null. Other failures
// propagate so the caller can surface them instead of hanging.
async function fetchOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await withRetry(fn);
  } catch (err) {
    if (isAccountMissing(err)) return null;
    throw err;
  }
}

export function useBootstrap() {
  const program = usePixlProgram();
  const wallet = useWallet();
  const [status, setStatus] = useState<BootstrapStatus>("disconnected");
  const [game, setGame] = useState<any>(undefined);
  const [season, setSeason] = useState<SeasonView | "zero" | null | undefined>(
    undefined
  );
  const [seasonAddress, setSeasonAddress] = useState<PublicKey | null>(null);
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [player, setPlayer] = useState<any>(undefined);
  const [profile, setProfile] = useState<any>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!program || !wallet.publicKey) return;
    const pk = wallet.publicKey;
    const conn = program.provider.connection;
    try {
      setError(null);
      const [gamePda] = deriveGamePda(program.programId);
      const g = await fetchOrNull(() => fetchGame(program, gamePda));
      setGame(g);
      if (!g) return;
      if (g.currentSeason.equals(PublicKey.default)) {
        setSeason("zero");
        return;
      }
      setSeasonAddress(g.currentSeason);
      const s = await fetchOrNull(() => fetchSeason(program, g.currentSeason));
      const sv: SeasonView | null = s
        ? {
            completed: s.completed,
            startTime: Number(s.startTime),
            endTime: Number(s.endTime),
          }
        : null;
      setSeason(sv);
      // "Player present" means the account merely exists (any owner); an undelegated
      // Player is a valid intermediate state that should advance to the "join" step.
      const [playerPda] = derivePlayerPda(program.programId, pk);
      const playerInfo = await withRetry(() =>
        conn.getAccountInfo(playerPda, "confirmed")
      );
      setPlayer(playerInfo ?? null);
      const [profilePda] = deriveSeasonProfilePda(
        program.programId,
        g.currentSeason,
        pk
      );
      // Presence, not decodability: a delegated profile is owned by the delegation
      // program on L1 and can't be typed-decoded, but existence means joined.
      const profileInfo = await withRetry(() =>
        conn.getAccountInfo(profilePda, "confirmed")
      );
      setProfile(profileInfo ?? null);
      setSession(loadSessionMeta(pk.toBase58()));
    } catch (err) {
      // Surface the failure instead of leaving the state machine wedged in a
      // loading state (undefined) with no feedback.
      setError(err instanceof Error ? err.message : "Failed to load state");
    }
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

  return {
    status,
    refetch,
    game,
    season,
    seasonAddress,
    session,
    setSession,
    error,
  };
}
