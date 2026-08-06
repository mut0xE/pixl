"use client";
import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Pixl } from "../../../target/types/pixl";
import pixlIdl from "../../../target/idl/pixl.json";

export function usePixlProgram(): Program<Pixl> | null {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
    return new Program(pixlIdl as any, provider) as Program<Pixl>;
  }, [connection, wallet.publicKey?.toBase58()]);
}
