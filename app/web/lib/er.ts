"use client";
import { useMemo } from "react";
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Pixl } from "../../../target/types/pixl";
import pixlIdl from "../../../target/idl/pixl.json";

// Minimal anchor Wallet backed by the in-memory session keypair. Anchor's own
// `Wallet` is the Node keypair wallet (pulls in `fs`) and isn't exported to the
// browser bundle, so we implement the interface directly.
function sessionWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    async signTransaction<T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> {
      if (tx instanceof VersionedTransaction) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> {
      for (const tx of txs) {
        if (tx instanceof VersionedTransaction) tx.sign([keypair]);
        else tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

// Ephemeral Rollup endpoint. Paint transactions and authoritative account
// subscriptions live here (the delegated Canvas/Player clones). The L1 RPC in
// providers.tsx is only used for the pre-delegation snapshot and settlement.
const ER_RPC =
  process.env.NEXT_PUBLIC_ER_RPC ?? "https://devnet.magicblock.app";

let erConnection: Connection | null = null;

/** Module-singleton ER connection (created lazily, browser-only). */
export function getErConnection(): Connection {
  if (!erConnection) erConnection = new Connection(ER_RPC, "confirmed");
  return erConnection;
}

/**
 * Anchor program bound to the ER connection and signed by the in-memory session
 * keypair — the same shape the e2e tests build via `getWalletContext`. Returns
 * null until a session secret is available, so callers can gate painting.
 */
export function useErProgram(
  sessionSecret: Keypair | null
): Program<Pixl> | null {
  return useMemo(() => {
    if (!sessionSecret) return null;
    const provider = new AnchorProvider(
      getErConnection(),
      sessionWallet(sessionSecret),
      { commitment: "confirmed", skipPreflight: true }
    );
    return new Program(pixlIdl as any, provider) as Program<Pixl>;
  }, [sessionSecret?.publicKey.toBase58()]);
}
