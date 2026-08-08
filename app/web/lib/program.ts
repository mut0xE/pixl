"use client";
import { useMemo } from "react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
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

// Read-only L1 program for public reads (no wallet connection required).
export function useReadProgram(): Program<Pixl> {
  const { connection } = useConnection();
  return useMemo(() => {
    const dummy = Keypair.generate();
    const wallet: any = {
      publicKey: dummy.publicKey,
      signTransaction: async () => {
        throw new Error("read-only program cannot sign");
      },
      signAllTransactions: async () => {
        throw new Error("read-only program cannot sign");
      },
    };
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    return new Program(pixlIdl as any, provider) as Program<Pixl>;
  }, [connection]);
}
