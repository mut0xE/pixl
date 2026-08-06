"use client";
import { Keypair, Transaction, PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { buildCreateSessionV2Ix, type SessionMeta } from "../../../packages/sdk";

export async function sendIx(
  connection: Connection,
  wallet: WalletContextState,
  ixs: import("@solana/web3.js").TransactionInstruction[],
  extraSigners: Keypair[] = []
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Wallet not connected");
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  if (extraSigners.length) tx.partialSign(...extraSigners);
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function setUpSession(
  connection: Connection,
  wallet: WalletContextState,
  programId: PublicKey,
  validForSeconds = 3600,
  topUpLamports = 10_000_000
): Promise<{ meta: SessionMeta; secret: Keypair; signature: string }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const secret = Keypair.generate();
  const validUntil = Math.floor(Date.now() / 1000) + validForSeconds;
  const { instruction, sessionToken } = buildCreateSessionV2Ix({
    targetProgram: programId,
    authority: wallet.publicKey,
    sessionSigner: secret.publicKey,
    validUntil,
    topUpLamports,
  });
  const signature = await sendIx(connection, wallet, [instruction], [secret]);
  return {
    meta: {
      sessionSigner: secret.publicKey.toBase58(),
      sessionToken: sessionToken.toBase58(),
      validUntil,
    },
    secret,
    signature,
  };
}
