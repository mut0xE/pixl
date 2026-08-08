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
  /** True once we know the Game PDA hasn't been created yet (init_game never ran). */
  gameMissing: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

// Resolves the `Game` account and whether the connected wallet is its authority.
export function useAdmin(): AdminState {
  const program = usePixlProgram();
  const { publicKey } = useWallet();
  const [game, setGame] = useState<PublicKey | null>(null);
  const [authority, setAuthority] = useState<PublicKey | null>(null);
  const [currentSeason, setCurrentSeason] = useState<PublicKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameMissing, setGameMissing] = useState(false);

  const refetch = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    setError(null);
    setGameMissing(false);
    const [gamePda] = deriveGamePda(program.programId);
    setGame(gamePda);
    try {
      const acct: any = await fetchGame(program, gamePda);
      setAuthority(acct.authority as PublicKey);
      setCurrentSeason(acct.currentSeason as PublicKey);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setAuthority(null);
      if (message.includes("Account does not exist")) {
        setGameMissing(true);
      } else {
        setError(message);
      }
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
    gameMissing,
    loading,
    error,
    refetch,
  };
}
