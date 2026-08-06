"use client";
import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { deriveGamePda, fetchGame } from "../../../packages/sdk";
import { usePixlProgram } from "./program";

export type AdminState = {
  /** Game PDA address, once resolved. */
  game: PublicKey | null;
  authority: PublicKey | null;
  currentSeason: PublicKey | null;
  /** True only when a wallet is connected AND equals game.authority. */
  isAuthority: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Resolves the on-chain `Game` account and decides whether the connected wallet
 * is the authority. The admin dashboard gates every action on `isAuthority`, so
 * a non-authority (or disconnected) wallet never sees a live control.
 */
export function useAdmin(): AdminState {
  const program = usePixlProgram();
  const { publicKey } = useWallet();
  const [game, setGame] = useState<PublicKey | null>(null);
  const [authority, setAuthority] = useState<PublicKey | null>(null);
  const [currentSeason, setCurrentSeason] = useState<PublicKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    setError(null);
    try {
      const [gamePda] = deriveGamePda(program.programId);
      const acct: any = await fetchGame(program, gamePda);
      setGame(gamePda);
      setAuthority(acct.authority as PublicKey);
      setCurrentSeason(acct.currentSeason as PublicKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAuthority(null);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const isAuthority = Boolean(
    publicKey && authority && publicKey.equals(authority)
  );

  return {
    game,
    authority,
    currentSeason,
    isAuthority,
    loading,
    error,
    refetch,
  };
}
