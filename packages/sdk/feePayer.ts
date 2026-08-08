import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
  getDelegationRecord,
  magicFeeVaultPdaFromValidator,
  DelegationStatus,
  DELEGATION_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";

/** Must match `FEE_PAYER_SEED` in the on-chain program (`b"fee_payer"`). */
export const FEE_PAYER_SEED = Buffer.from("fee_payer");

/**
 * The program-owned delegated fee payer PDA. It pays commit fees so commits are
 * not limited to the 10 sponsored commits per delegated account.
 */
export function deriveFeePayerPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([FEE_PAYER_SEED], programId)[0];
}

export type FeePayerStatus = {
  address: PublicKey;
  /** The escrow that funds commit fees. */
  escrow: PublicKey;
  /** Account exists on L1 (init_fee_payer has run). */
  initialized: boolean;
  /** L1 ownership moved to the delegation program (delegate step done). */
  delegated: boolean;
  /** Lamports available in the ephemeral balance escrow. */
  escrowLamports: number;
  /** Convenience: initialized && delegated && escrowLamports > 0. */
  ready: boolean;
};

/**
 * Reads the current setup state of the fee payer so the UI (and commit
 * preflight) can tell whether Init / Delegate / Fund still need running.
 * Query with the base-layer connection.
 */
export async function getFeePayerStatus(
  connection: Connection,
  programId: PublicKey
): Promise<FeePayerStatus> {
  const address = deriveFeePayerPda(programId);
  const escrow = escrowPdaFromEscrowAuthority(address);
  const [info, escrowLamports] = await Promise.all([
    connection.getAccountInfo(address),
    connection.getBalance(escrow),
  ]);
  const initialized = info !== null;
  const delegated = info?.owner.equals(DELEGATION_PROGRAM_ID) ?? false;
  return {
    address,
    escrow,
    initialized,
    delegated,
    escrowLamports,
    ready: initialized && delegated && escrowLamports > 0,
  };
}

/**
 * Throws a clear, actionable error if the fee payer is not ready to pay commits.
 * Call this before building a commit so a missing setup step surfaces as guidance
 * instead of a cryptic on-chain failure.
 */
export async function assertFeePayerReady(
  connection: Connection,
  programId: PublicKey
): Promise<void> {
  const s = await getFeePayerStatus(connection, programId);
  if (!s.initialized) {
    throw new Error(
      "Fee payer not initialized. Open Admin → Fee Payer and run step 1 (Init)."
    );
  }
  if (!s.delegated) {
    throw new Error(
      "Fee payer not delegated. Open Admin → Fee Payer and run step 2 (Delegate)."
    );
  }
  if (s.escrowLamports <= 0) {
    throw new Error(
      "Fee payer has no funds. Open Admin → Fee Payer and run step 3 (Fund)."
    );
  }
}

/**
 * Resolves the validator-scoped `magic_fee_vault` for the ER that a delegated
 * account is running on. The vault is credited with each paid commit fee.
 *
 * Reads the delegation record of an already-delegated account (e.g. the canvas
 * or season stats) to learn the validator, then derives the vault PDA. Both
 * derivations live in `@magicblock-labs/ephemeral-rollups-sdk` and use the
 * delegation program ID under the hood.
 *
 * @throws if the reference account is not currently delegated.
 */
export async function resolveMagicFeeVault(
  connection: Connection,
  delegatedReferenceAccount: PublicKey
): Promise<PublicKey> {
  const record = await getDelegationRecord(
    connection,
    delegatedReferenceAccount
  );
  if (record.status !== DelegationStatus.Delegated) {
    throw new Error(
      `Cannot resolve magic_fee_vault: reference account ` +
        `${delegatedReferenceAccount.toBase58()} is not delegated.`
    );
  }
  return magicFeeVaultPdaFromValidator(record.validator);
}

/**
 * Funds the fee payer's ephemeral balance escrow on the base layer so it can
 * keep paying commit fees. The escrow is keyed to the fee payer PDA as its own
 * escrow authority; the funder wallet signs and pays.
 *
 * Submit the returned instruction on the **base layer**, not the ER.
 *
 * @param funder wallet that supplies the lamports and signs the base-layer tx
 * @param amountLamports lamports to deposit (must be > 0)
 */
export function buildTopUpFeePayerIx(
  funder: PublicKey,
  programId: PublicKey,
  amountLamports: number
): TransactionInstruction {
  if (!Number.isFinite(amountLamports) || amountLamports <= 0) {
    throw new RangeError("amountLamports must be a positive number");
  }
  const feePayer = deriveFeePayerPda(programId);
  const escrow = escrowPdaFromEscrowAuthority(feePayer);
  return createTopUpEscrowInstruction(escrow, feePayer, funder, amountLamports);
}
