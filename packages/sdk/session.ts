import { createHash } from "crypto";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Connection,
  type Signer,
} from "@solana/web3.js";
import BN from "bn.js";

export const GUM_SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

const SESSION_TOKEN_V2_SEED = "session_token_v2";

const MAX_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export function deriveSessionTokenV2Pda(
  targetProgram: PublicKey,
  sessionSigner: PublicKey,
  authority: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(SESSION_TOKEN_V2_SEED),
      targetProgram.toBytes(),
      sessionSigner.toBytes(),
      authority.toBytes(),
    ],
    GUM_SESSION_PROGRAM_ID
  );
}

// Deterministically derive the session-signer keypair from the wallet authority
// and a nonce, so the secret key is never persisted (recomputed on demand from
// the wallet pubkey + public nonce). Bumping the nonce rotates to a fresh key.
export function deriveSessionKeypair(
  authority: PublicKey,
  nonce: string | number
): Keypair {
  // Hash so every byte of the seed depends on the nonce, instead of XOR-ing
  // a short repeating pattern over 32 bytes (which silently dropped the
  // nonce whenever "authority:nonce" was longer than 32 chars, since the
  // XOR loop never wrapped around to read it).
  const seedBytes = new Uint8Array(
    createHash("sha256")
      .update(authority.toBase58() + ":" + String(nonce))
      .digest()
  );
  return Keypair.fromSeed(seedBytes);
}

function anchorDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeOption(value: Buffer | null): Buffer {
  return value === null
    ? Buffer.from([0])
    : Buffer.concat([Buffer.from([1]), value]);
}

function encodeI64(value: BN): Buffer {
  return value.toTwos(64).toArrayLike(Buffer, "le", 8);
}

function encodeU64(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

export type CreateSessionV2Params = {
  targetProgram: PublicKey;
  authority: PublicKey;
  sessionSigner: PublicKey;
  feePayer?: PublicKey;
  validUntil?: number;
  topUpLamports?: number;
};

export function buildCreateSessionV2Ix(params: CreateSessionV2Params): {
  instruction: TransactionInstruction;
  sessionToken: PublicKey;
} {
  const feePayer = params.feePayer ?? params.authority;
  const [sessionToken] = deriveSessionTokenV2Pda(
    params.targetProgram,
    params.sessionSigner,
    params.authority
  );

  const topUp = params.topUpLamports !== undefined;
  const data = Buffer.concat([
    anchorDiscriminator("create_session_v2"),
    encodeOption(Buffer.from([topUp ? 1 : 0])), // top_up: Option<bool>
    encodeOption(
      params.validUntil !== undefined
        ? encodeI64(new BN(params.validUntil))
        : null
    ), // valid_until: Option<i64>
    encodeOption(topUp ? encodeU64(new BN(params.topUpLamports!)) : null), // lamports: Option<u64>
  ]);

  const instruction = new TransactionInstruction({
    programId: GUM_SESSION_PROGRAM_ID,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: params.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: feePayer, isSigner: true, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: params.targetProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { instruction, sessionToken };
}

export type CreateSessionResult = {
  sessionKeypair: Keypair;
  sessionToken: PublicKey;
  signature: string;
  validUntil: number;
};

export async function createSessionV2(
  connection: Connection,
  {
    programId,
    authoritySigner,
    validForSeconds = 60 * 60,
    topUpLamports = 10_000_000, // 0.01 SOL — plenty for many ER paints
  }: {
    programId: PublicKey;
    authoritySigner: Signer;
    validForSeconds?: number;
    topUpLamports?: number;
  }
): Promise<CreateSessionResult> {
  if (validForSeconds > MAX_SESSION_DURATION_SECONDS) {
    throw new RangeError(
      `Session validity capped at 7 days (${MAX_SESSION_DURATION_SECONDS}s)`
    );
  }

  const sessionKeypair = Keypair.generate();
  const validUntil = Math.floor(Date.now() / 1000) + validForSeconds;

  const { instruction, sessionToken } = buildCreateSessionV2Ix({
    targetProgram: programId,
    authority: authoritySigner.publicKey,
    sessionSigner: sessionKeypair.publicKey,
    validUntil,
    topUpLamports,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = authoritySigner.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(authoritySigner, sessionKeypair);

  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return { sessionKeypair, sessionToken, signature, validUntil };
}

export function buildRevokeSessionV2Ix(params: {
  targetProgram: PublicKey;
  authority: PublicKey;
  sessionSigner: PublicKey;
  feePayer?: PublicKey;
}): TransactionInstruction {
  const feePayer = params.feePayer ?? params.authority;
  const [sessionToken] = deriveSessionTokenV2Pda(
    params.targetProgram,
    params.sessionSigner,
    params.authority
  );

  return new TransactionInstruction({
    programId: GUM_SESSION_PROGRAM_ID,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: feePayer, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("revoke_session_v2"),
  });
}
