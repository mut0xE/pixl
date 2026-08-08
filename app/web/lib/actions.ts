"use client";
import { Keypair, Transaction, PublicKey } from "@solana/web3.js";
import type { Connection, TransactionInstruction } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import {
  buildCreateSessionV2Ix,
  buildRevokeSessionV2Ix,
  buildDelegatePlayerIx,
  buildDelegateSeasonProfileIx,
  buildInitPlayerIx,
  buildInitSeasonProfileIx,
  buildJoinSeasonIx,
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
  deriveSessionKeypair,
  deriveSessionTokenV2Pda,
  DELEGATION_PROGRAM_ID,
  type SessionMeta,
} from "../../../packages/sdk";

// Gum caps validity at 7 days. Leave headroom for client/RPC clock drift so
// wallets do not reject the setup simulation with `ValidityTooLong`.
export const SESSION_VALID_SECONDS = 60 * 60 * 24 * 6;
const ACTION_LOG = "[pixl:actions]";

function shortKey(key: PublicKey): string {
  const text = key.toBase58();
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

// Revoke instruction for the wallet's stored session (to reclaim its top-up +
// rent), or null if there is nothing on-chain to revoke.
async function buildRevokeStaleSessionIx(
  connection: Connection,
  authority: PublicKey,
  programId: PublicKey
): Promise<TransactionInstruction | null> {
  const stale = loadSessionMeta(authority.toBase58());
  if (!stale) return null;
  const info = await connection.getAccountInfo(
    new PublicKey(stale.sessionToken),
    "confirmed"
  );
  if (!info) return null; // already gone — nothing to reclaim
  return buildRevokeSessionV2Ix({
    targetProgram: programId,
    authority,
    sessionSigner: new PublicKey(stale.sessionSigner),
  });
}
import type { Pixl } from "../../../target/types/pixl";
import { pixlError, pixlLog } from "./debug";
import { getErConnection } from "./er";
import {
  loadSessionMeta,
  saveSessionMeta,
  nextSessionNonce,
} from "./session-store";

// Which chain a signature settled on, for building the right Explorer link.
export type TxCluster = "l1" | "er";

// A transaction that landed on-chain but failed there; carries signature + logs.
export interface FailedTxError extends Error {
  signature: string;
  txCluster: TxCluster;
  logs?: string[];
}

function logTransactionError(
  label: string,
  err: unknown,
  context: Record<string, unknown> = {}
): void {
  const anyErr = err as {
    logs?: unknown;
    signature?: unknown;
    txCluster?: unknown;
    transactionMessage?: unknown;
  };
  console.groupCollapsed(`${ACTION_LOG} ${label} failed`);
  pixlError(ACTION_LOG, `${label} raw error`, err, context);
  pixlLog(ACTION_LOG, `${label} context`, context);
  if (anyErr?.signature) pixlLog(ACTION_LOG, "signature", anyErr.signature);
  if (anyErr?.txCluster) pixlLog(ACTION_LOG, "cluster", anyErr.txCluster);
  if (anyErr?.transactionMessage) {
    pixlLog(ACTION_LOG, "transaction message", anyErr.transactionMessage);
  }
  if (Array.isArray(anyErr?.logs)) {
    console.groupCollapsed(`${ACTION_LOG} program logs`);
    pixlLog(ACTION_LOG, "program logs", anyErr.logs);
    anyErr.logs.forEach((line, i) => console.log(`${i}: ${line}`));
    console.groupEnd();
  }
  console.groupEnd();
}

// confirmTransaction resolves even when the program reverted (failure lives in
// `value.err`); turn that into a rich, linkable error with fetched tx logs.
async function confirmOrThrow(
  connection: Connection,
  signature: string,
  cluster: TxCluster
): Promise<string> {
  const res = await connection.confirmTransaction(signature, "confirmed");
  if (res.value.err) {
    const tx = await connection
      .getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
      .catch(() => null);
    const logs = tx?.meta?.logMessages ?? undefined;
    const err = new Error(
      `Transaction failed on-chain: ${JSON.stringify(res.value.err)}`
    ) as FailedTxError;
    err.signature = signature;
    err.txCluster = cluster;
    err.logs = logs;
    logTransactionError("confirmed transaction", err, {
      cluster,
      explorerSignature: signature,
      chainErr: res.value.err,
    });
    throw err;
  }
  return signature;
}

export async function sendIx(
  connection: Connection,
  wallet: WalletContextState,
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = [],
  opts: { skipPreflight?: boolean; cluster?: TxCluster } = {}
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction)
    throw new Error("Wallet not connected");
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  if (extraSigners.length) tx.partialSign(...extraSigners);
  pixlLog(ACTION_LOG, "sendIx prepared", {
    cluster: opts.cluster ?? "l1",
    feePayer: wallet.publicKey.toBase58(),
    instructionCount: ixs.length,
    extraSigners: extraSigners.map((s) => s.publicKey.toBase58()),
    programIds: ixs.map((ix) => ix.programId.toBase58()),
    skipPreflight: opts.skipPreflight ?? false,
  });
  const signed = await wallet.signTransaction(tx);
  let sig: string;
  try {
    sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: opts.skipPreflight ?? false,
    });
  } catch (err) {
    logTransactionError("sendRawTransaction", err, {
      cluster: opts.cluster ?? "l1",
      feePayer: wallet.publicKey.toBase58(),
      instructionCount: ixs.length,
      programIds: ixs.map((ix) => ix.programId.toBase58()),
      skipPreflight: opts.skipPreflight ?? false,
    });
    throw err;
  }
  pixlLog(ACTION_LOG, "sendIx submitted", {
    cluster: opts.cluster ?? "l1",
    signature: sig,
  });
  return confirmOrThrow(connection, sig, opts.cluster ?? "l1");
}

// Signs and submits an ER transaction with an in-memory session keypair instead
// of the wallet adapter, which rejects the ER validator blockhash.
export async function sendErIxSigned(
  signer: Keypair,
  ixs: TransactionInstruction[],
  opts: { skipPreflight?: boolean } = {}
): Promise<string> {
  const er = getErConnection();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  pixlLog(ACTION_LOG, "sendErIxSigned prepared", {
    cluster: "er",
    feePayer: signer.publicKey.toBase58(),
    instructionCount: ixs.length,
    programIds: ixs.map((ix) => ix.programId.toBase58()),
    skipPreflight: opts.skipPreflight ?? true,
  });
  let sig: string;
  try {
    sig = await er.sendRawTransaction(tx.serialize(), {
      skipPreflight: opts.skipPreflight ?? true,
    });
  } catch (err) {
    logTransactionError("sendRawTransaction ER", err, {
      cluster: "er",
      feePayer: signer.publicKey.toBase58(),
      instructionCount: ixs.length,
      programIds: ixs.map((ix) => ix.programId.toBase58()),
      skipPreflight: opts.skipPreflight ?? true,
    });
    throw err;
  }
  pixlLog(ACTION_LOG, "sendErIxSigned submitted", {
    cluster: "er",
    signature: sig,
  });
  return confirmOrThrow(er, sig, "er");
}

// Returns a funded session keypair for the connected wallet, minting one on the
// base layer if none is stored or the stored one has expired.
export async function ensureSessionSigner(
  connection: Connection,
  wallet: WalletContextState,
  programId: PublicKey,
  onStep?: (label: string) => void
): Promise<Keypair> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const walletStr = wallet.publicKey.toBase58();
  const now = Math.floor(Date.now() / 1000);
  const existing = loadSessionMeta(walletStr);

  // Reuse a live session (with a 60s safety margin); otherwise mint a new one.
  if (existing && existing.validUntil > now + 60) {
    return deriveSessionKeypair(wallet.publicKey, existing.nonce);
  }

  onStep?.("creating session");
  const nonce = nextSessionNonce(walletStr);
  const { meta, secret } = await setUpSession(
    connection,
    wallet,
    programId,
    nonce
  );
  saveSessionMeta(walletStr, meta);
  return secret;
}

// Polls the ER until the delegated clone of `account` is program-owned there;
// L1 delegation propagates asynchronously, so acting immediately would race.
async function waitForErClone(
  account: PublicKey,
  programId: PublicKey,
  timeoutMs = 20_000,
  label = "season profile"
): Promise<void> {
  const er = getErConnection();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await er.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(programId)) return;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Timed out waiting for the ${label} to reach the ER`);
}

// Create the Player PDA on L1 (delegation happens later in `joinActiveSeason`).
// Idempotent: a no-op if the Player already exists in any ownership.
export async function createPlayer(
  program: Program<Pixl>,
  wallet: WalletContextState,
  baseConnection: Connection,
  onStep?: (label: string) => void
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const walletPk = wallet.publicKey;
  const [playerPda] = derivePlayerPda(program.programId, walletPk);

  const info = await baseConnection.getAccountInfo(playerPda, "confirmed");
  if (info) {
    console.log(
      "[createPlayer] player already exists, owner:",
      info.owner.toBase58()
    );
    return "";
  }

  onStep?.("creating player");
  const ix = await buildInitPlayerIx(program, { wallet: walletPk });
  return sendIx(baseConnection, wallet, [ix]);
}

// Join across both layers: base creates + delegates the profile (one wallet
// signature), wait for the ER clone, then ER `join_season`. Idempotent, and
// requires `season_stats` to already be delegated by the admin.
export async function joinActiveSeason(
  program: Program<Pixl>,
  wallet: WalletContextState,
  baseConnection: Connection,
  season: PublicKey,
  onStep?: (label: string) => void
): Promise<string> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  const walletPk = wallet.publicKey;
  const programId = program.programId;
  const [game] = deriveGamePda(programId);
  const [profilePda] = deriveSeasonProfilePda(programId, season, walletPk);
  const [playerPda] = derivePlayerPda(programId, walletPk);
  const [statsPda] = deriveSeasonStatsPda(programId, season);
  const er = getErConnection();

  console.groupCollapsed("[join] joinActiveSeason");
  console.log("[join] wallet ", walletPk.toBase58());
  console.log("[join] season ", season.toBase58());
  console.log("[join] program", programId.toBase58());
  console.log("[join] delegation program", DELEGATION_PROGRAM_ID.toBase58());
  // Snapshot owners on both layers up front to pinpoint any 3007 owner mismatch.
  await logOwners("before base tx", baseConnection, er, {
    player: playerPda,
    profile: profilePda,
    season_stats: statsPda,
    season,
  });

  const info = await baseConnection.getAccountInfo(profilePda, "confirmed");
  const alreadyDelegated = info?.owner.equals(DELEGATION_PROGRAM_ID) ?? false;

  const baseIxs: TransactionInstruction[] = [];
  const baseIxNames: string[] = [];

  // The shared Player is delegated exactly once, then reused across seasons.
  const playerInfo = await baseConnection.getAccountInfo(
    playerPda,
    "confirmed"
  );
  const playerDelegated =
    playerInfo?.owner.equals(DELEGATION_PROGRAM_ID) ?? false;

  if (!info) {
    baseIxs.push(
      await buildInitSeasonProfileIx(program, { wallet: walletPk, season })
    );
    baseIxNames.push("init_season_profile");
  }
  // Delegate the Player once (covers all seasons); ordered after init_season_profile.
  if (!playerDelegated) {
    baseIxs.push(
      await buildDelegatePlayerIx(program, {
        payer: walletPk,
        wallet: walletPk,
        season,
        game,
        validator: null,
      })
    );
    baseIxNames.push("delegate_player");
  }
  if (!alreadyDelegated) {
    baseIxs.push(
      await buildDelegateSeasonProfileIx(program, {
        payer: walletPk,
        wallet: walletPk,
        season,
        game,
        validator: null,
      })
    );
    baseIxNames.push("delegate_season_profile");
  }

  // Batch a fresh create-session ix (if needed) into the same base tx, so the
  // wallet signs one L1 blockhash; the ER `join_season` below uses the session key.
  const walletStr = walletPk.toBase58();
  const now = Math.floor(Date.now() / 1000);
  const existing = loadSessionMeta(walletStr);

  let sessionSigner: Keypair;
  const extraSigners: Keypair[] = [];
  let freshSession: SessionMeta | null = null;

  if (existing && existing.validUntil > now + 60) {
    // Reuse a live session (60s safety margin) — nothing to add to the base tx.
    sessionSigner = deriveSessionKeypair(walletPk, existing.nonce);
  } else {
    // Reclaim the expired session's top-up + rent in this same wallet signature.
    const revokeIx = await buildRevokeStaleSessionIx(
      baseConnection,
      walletPk,
      programId
    );
    if (revokeIx) {
      baseIxs.push(revokeIx);
      baseIxNames.push("revoke_session_v2");
    }
    const nonce = nextSessionNonce(walletStr);
    sessionSigner = deriveSessionKeypair(walletPk, nonce);
    const validUntil = now + SESSION_VALID_SECONDS;
    const { instruction, sessionToken: token } = buildCreateSessionV2Ix({
      targetProgram: programId,
      authority: walletPk,
      sessionSigner: sessionSigner.publicKey,
      validUntil,
      topUpLamports: 10_000_000,
    });
    baseIxs.push(instruction);
    baseIxNames.push("create_session_v2");
    extraSigners.push(sessionSigner); // co-signs create_session_v2
    freshSession = {
      sessionSigner: sessionSigner.publicKey.toBase58(),
      sessionToken: token.toBase58(),
      validUntil,
      nonce,
    };
  }

  if (baseIxs.length) {
    onStep?.("creating profile");
    console.log("[join] base tx instructions:", baseIxNames.join(" + "));
    try {
      const sig = await sendIx(baseConnection, wallet, baseIxs, extraSigners);
      console.log("[join] base tx confirmed:", sig);
    } catch (err) {
      console.error("[join] base tx FAILED:", err);
      console.error(
        "[join] base tx contained:",
        baseIxNames.join(" + "),
        "— a 3007 here means one of these accounts had an unexpected owner (see the owner table above)"
      );
      console.groupEnd();
      throw err;
    }
    // Persist the new session only after the base tx confirms.
    if (freshSession) saveSessionMeta(walletStr, freshSession);
  } else {
    console.log("[join] no base ixs needed (profile + session already ready)");
  }

  const [sessionToken] = deriveSessionTokenV2Pda(
    programId,
    sessionSigner.publicKey,
    walletPk
  );

  onStep?.("syncing to rollup");
  console.log("[join] waiting for player clone on ER…");
  await waitForErClone(playerPda, programId, 20_000, "player");
  console.log("[join] player is live on ER");
  console.log("[join] waiting for profile clone on ER…");
  await waitForErClone(profilePda, programId);
  console.log("[join] profile is live on ER");
  // join_season writes season_stats; gate on it being ER-active so a not-yet-
  // delegated season fails with a clear message instead of a cryptic 3007.
  try {
    console.log("[join] waiting for season_stats clone on ER…");
    await waitForErClone(statsPda, programId, 20_000, "season stats");
    console.log("[join] season_stats is live on ER");
  } catch {
    console.groupEnd();
    throw new Error(
      "This season isn't live on the rollup yet. Ask the organizer to delegate it, then try again."
    );
  }

  await logOwners("before ER join", baseConnection, er, {
    player: playerPda,
    profile: profilePda,
    season_stats: statsPda,
    season,
  });

  onStep?.("joining");
  const joinIx = await buildJoinSeasonIx(program, {
    payer: sessionSigner.publicKey,
    wallet: walletPk,
    season,
    sessionToken,
  });
  try {
    const sig = await sendErIxSigned(sessionSigner, [joinIx], {
      skipPreflight: true,
    });
    console.log("[join] ER join_season confirmed:", sig);
    console.groupEnd();
    return sig;
  } catch (err) {
    console.error("[join] ER join_season FAILED:", err);
    console.groupEnd();
    throw err;
  }
}

// Logs each account's owner on base + ER side by side, to spot 3007 culprits.
async function logOwners(
  phase: string,
  base: Connection,
  er: Connection,
  accounts: Record<string, PublicKey>
): Promise<void> {
  const rows: Record<string, { base: string; er: string }> = {};
  for (const [name, pk] of Object.entries(accounts)) {
    const [b, e] = await Promise.all([
      base.getAccountInfo(pk, "confirmed").catch(() => null),
      er.getAccountInfo(pk, "confirmed").catch(() => null),
    ]);
    rows[name] = {
      base: b?.owner.toBase58() ?? "MISSING",
      er: e?.owner.toBase58() ?? "MISSING",
    };
  }
  console.log(`[join] owners @ ${phase}`);
  console.table(rows);
}

export async function setUpSession(
  connection: Connection,
  wallet: WalletContextState,
  programId: PublicKey,
  nonce: number,
  validForSeconds = SESSION_VALID_SECONDS,
  topUpLamports = 10_000_000
): Promise<{ meta: SessionMeta; secret: Keypair; signature: string }> {
  if (!wallet.publicKey) throw new Error("Wallet not connected");
  console.groupCollapsed(
    `${ACTION_LOG} setup session ${shortKey(wallet.publicKey)}`
  );
  // A wallet that used the app before (e.g. on another browser/device) may
  // already have a session token PDA on-chain for this nonce that our local
  // storage doesn't know about. Reusing that nonce makes create_session_v2
  // try to init an account that already exists -> "Custom error 0". Walk
  // forward to a nonce whose PDA is actually free.
  let secret = deriveSessionKeypair(wallet.publicKey, nonce);
  let built = buildCreateSessionV2Ix({
    targetProgram: programId,
    authority: wallet.publicKey,
    sessionSigner: secret.publicKey,
    validUntil: Math.floor(Date.now() / 1000) + validForSeconds,
    topUpLamports,
  });
  let guard = 0;
  while (
    (await connection.getAccountInfo(built.sessionToken, "confirmed")) !==
      null &&
    guard++ < 20
  ) {
    pixlLog(ACTION_LOG, "session token PDA already exists, bumping nonce", {
      nonce,
      sessionToken: built.sessionToken.toBase58(),
    });
    nonce += 1;
    secret = deriveSessionKeypair(wallet.publicKey, nonce);
    built = buildCreateSessionV2Ix({
      targetProgram: programId,
      authority: wallet.publicKey,
      sessionSigner: secret.publicKey,
      validUntil: Math.floor(Date.now() / 1000) + validForSeconds,
      topUpLamports,
    });
  }
  const validUntil = Math.floor(Date.now() / 1000) + validForSeconds;
  const { instruction, sessionToken } = built;
  pixlLog(ACTION_LOG, "session params", {
    wallet: wallet.publicKey.toBase58(),
    programId: programId.toBase58(),
    sessionSigner: secret.publicKey.toBase58(),
    sessionToken: sessionToken.toBase58(),
    nonce,
    validUntil: new Date(validUntil * 1000).toISOString(),
    validForSeconds,
    topUpLamports,
  });
  // Close the previous session in the same signature to reclaim its top-up + rent.
  const revokeIx = await buildRevokeStaleSessionIx(
    connection,
    wallet.publicKey,
    programId
  );
  const ixs = revokeIx ? [revokeIx, instruction] : [instruction];
  pixlLog(ACTION_LOG, "session tx", {
    instructionCount: ixs.length,
    includesRevoke: Boolean(revokeIx),
  });
  try {
    const signature = await sendIx(connection, wallet, ixs, [secret]);
    pixlLog(ACTION_LOG, "session confirmed", { signature });
    return {
      meta: {
        sessionSigner: secret.publicKey.toBase58(),
        sessionToken: sessionToken.toBase58(),
        validUntil,
        nonce,
      },
      secret,
      signature,
    };
  } catch (err) {
    pixlError(ACTION_LOG, "session setup failed", err);
    throw err;
  } finally {
    console.groupEnd();
  }
}
