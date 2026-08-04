import * as anchor from "@coral-xyz/anchor";
import { AnchorError } from "@coral-xyz/anchor";
import { randomInt } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { PublicKey, Keypair, SendTransactionError } from "@solana/web3.js";
import { config as loadEnv } from "dotenv";
import { expect } from "chai";
import type { Pixl } from "../target/types/pixl";
import {
  deriveCanvasPda,
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonPda,
  deriveSeasonStatsPda,
} from "../packages/sdk";

const pixlIdl = require("../target/idl/pixl.json");

loadEnv({ path: resolve(process.cwd(), ".env") });

function expandHome(path: string) {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function resolveProviderUrl() {
  if (process.env.ANCHOR_PROVIDER_URL) {
    return process.env.ANCHOR_PROVIDER_URL;
  }

  return "http://127.0.0.1:8899";
}

function resolveWalletPath() {
  if (process.env.ANCHOR_WALLET) {
    return expandHome(process.env.ANCHOR_WALLET);
  }

  return resolve(homedir(), ".config/solana/id.json");
}

function buildProvider() {
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(resolveWalletPath(), "utf8")) as number[]
    )
  );
  const connection = new anchor.web3.Connection(
    resolveProviderUrl(),
    anchor.AnchorProvider.defaultOptions().commitment
  );
  const wallet = new anchor.Wallet(walletKeypair);

  return new anchor.AnchorProvider(
    connection,
    wallet,
    anchor.AnchorProvider.defaultOptions()
  );
}

export function getTestContext() {
  const provider = buildProvider();
  anchor.setProvider(provider);
  // Prefer Anchor's auto-loaded workspace client, but fall back to the built IDL
  // so tests can still construct the program client when `anchor test` is unavailable.
  const program =
    (anchor.workspace.pixl as anchor.Program<Pixl> | undefined) ??
    (new anchor.Program(pixlIdl, provider) as anchor.Program<Pixl>);

  const [gamePda] = deriveGamePda(program.programId);

  return {
    provider,
    program,
    gamePda,
  };
}

export function deriveSeasonAccounts(
  programId: anchor.web3.PublicKey,
  seasonId: number
) {
  const [seasonPda] = deriveSeasonPda(programId, seasonId);
  const [seasonStatsPda] = deriveSeasonStatsPda(programId, seasonPda);
  const [canvasPda] = deriveCanvasPda(programId, seasonPda);

  return {
    seasonPda,
    seasonStatsPda,
    canvasPda,
  };
}

export function uniqueSeasonId() {
  const maxU32 = 0xffffffff;
  return randomInt(1, maxU32);
}

export function derivePlayerAccount(
  programId: anchor.web3.PublicKey,
  wallet: anchor.web3.PublicKey
) {
  const [playerPda] = derivePlayerPda(programId, wallet);

  return {
    playerPda,
  };
}

export function buildStartSeasonArgs(overrides: Partial<any> = {}) {
  return {
    seasonId: uniqueSeasonId(),
    title: "Genesis",
    description: "The first collaborative canvas",
    palette: [0x000000, 0xffffff, 0xff0000],
    imageUri: "ipfs://pixl/genesis",
    canvasWidth: null,
    canvasHeight: null,
    startTime: new anchor.BN(1_700_000_000),
    endTime: new anchor.BN(1_700_000_600),
    ...overrides,
  };
}

export async function ensureGameInitialized() {
  const { provider, program } = getTestContext();
  const upgradeableLoaderProgramId = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    upgradeableLoaderProgramId
  );

  try {
    const signature = await program.methods
      .initGame()
      .accounts({
        admin: provider.wallet.publicKey,
        programData: programDataAddress,
      })
      .rpc();
    console.log("initGame signature:", signature);
  } catch (error) {
    const message = `${error}`;
    if (!message.includes("already in use")) {
      throw error;
    }
  }
}

export async function getAnchorTestError(
  error: unknown,
  connection: anchor.web3.Connection
) {
  const message = `${error}`;
  const logs =
    error instanceof SendTransactionError
      ? (await error.getLogs(connection)) ?? []
      : [];
  const directAnchorError =
    error instanceof AnchorError ||
    (typeof error === "object" &&
      error !== null &&
      "error" in error &&
      typeof (error as { error?: unknown }).error === "object" &&
      (error as { error?: { errorCode?: unknown; errorMessage?: unknown } }).error !==
        null &&
      "errorCode" in
        ((error as {
          error?: { errorCode?: unknown; errorMessage?: unknown };
        }).error ?? {}) &&
      "errorMessage" in
        ((error as {
          error?: { errorCode?: unknown; errorMessage?: unknown };
        }).error ?? {}))
      ? (error as AnchorError)
      : null;
  const anchorError = directAnchorError ?? AnchorError.parse(logs);

  return {
    message,
    logs,
    anchorError,
  };
}

export async function expectAnchorError(
  error: unknown,
  connection: anchor.web3.Connection,
  code: string,
  message: string
) {
  const parsed = await getAnchorTestError(error, connection);

  if (parsed.anchorError) {
    expect(parsed.anchorError.error.errorCode.code).to.equal(code);
    expect(parsed.anchorError.error.errorMessage).to.equal(message);
    return parsed;
  }

  expect(parsed.message.length > 0 || parsed.logs.length > 0).to.equal(true);
  expect(
    [parsed.message, ...parsed.logs].some(
      (line) =>
        line.includes(code) ||
        line.includes(message) ||
        line.includes("custom program error")
    )
  ).to.equal(true);

  return parsed;
}
