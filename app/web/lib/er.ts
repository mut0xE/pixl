"use client";
import { useMemo } from "react";
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Pixl } from "../../../packages/sdk/idl/pixl";
import pixlIdl from "../../../packages/sdk/idl/pixl.json";

// Minimal anchor Wallet backed by the in-memory session keypair (anchor's own
// Node wallet pulls in `fs` and isn't browser-safe).
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

// Ephemeral Rollup endpoint: paints and delegated Canvas/Player clones live here.
const ER_RPC =
  process.env.NEXT_PUBLIC_ER_RPC ?? "https://devnet.magicblock.app";

let erConnection: Connection | null = null;

/** Module-singleton ER connection (created lazily, browser-only). */
export function getErConnection(): Connection {
  if (!erConnection) erConnection = new Connection(ER_RPC, "confirmed");
  return erConnection;
}

// Explorer URL for an ER transaction (a custom cluster via `customUrl`).
export function erExplorerTxUrl(signature: string): string {
  const cluster = encodeURIComponent(ER_RPC);
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${cluster}`;
}

// Read-only wallet for ER account fetches; throws if anything tries to sign.
function readOnlyWallet(): Wallet {
  const dummy = Keypair.generate();
  const reject = () => {
    throw new Error("read-only ER program cannot sign transactions");
  };
  return {
    publicKey: dummy.publicKey,
    payer: dummy,
    signTransaction: reject as Wallet["signTransaction"],
    signAllTransactions: reject as Wallet["signAllTransactions"],
  };
}

// Anchor program bound to the ER connection for read-only account fetches.
export function useErReadProgram(): Program<Pixl> {
  return useMemo(() => {
    const provider = new AnchorProvider(getErConnection(), readOnlyWallet(), {
      commitment: "confirmed",
    });
    return new Program(pixlIdl as any, provider) as Program<Pixl>;
  }, []);
}

// ER-bound anchor program signed by the session keypair; null until one exists.
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
