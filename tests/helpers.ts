import * as anchor from "@coral-xyz/anchor";
import { AnchorError } from "@coral-xyz/anchor";
import { randomInt } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import {
  PublicKey,
  Keypair,
  SendTransactionError,
  SystemProgram,
  Transaction,
  AccountInfo,
} from "@solana/web3.js";
import { config as loadEnv } from "dotenv";
import { expect } from "chai";
import type { Pixl } from "../target/types/pixl";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../packages/shared";
import {
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonProfilePda,
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
  const providerOptions = {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  } as const;
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(resolveWalletPath(), "utf8")) as number[]
    )
  );
  const connection = new anchor.web3.Connection(
    resolveProviderUrl(),
    providerOptions.commitment
  );
  const wallet = new anchor.Wallet(walletKeypair);

  return new anchor.AnchorProvider(connection, wallet, providerOptions);
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

  return {
    seasonPda,
    seasonStatsPda,
  };
}

export function deriveSeasonStatsAccount(
  programId: anchor.web3.PublicKey,
  season: anchor.web3.PublicKey
) {
  const [seasonStatsPda] = deriveSeasonStatsPda(programId, season);

  return {
    seasonStatsPda,
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

export function deriveSeasonProfileAccount(
  programId: anchor.web3.PublicKey,
  season: anchor.web3.PublicKey,
  wallet: anchor.web3.PublicKey
) {
  const [seasonProfilePda] = deriveSeasonProfilePda(programId, season, wallet);

  return {
    seasonProfilePda,
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

export async function createCanvasAccount(
  provider: anchor.AnchorProvider,
  program: anchor.Program<Pixl>,
  canvasKeypair: Keypair,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
) {
  const canvasSpace = getCanvasAccountSpace(width, height);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    canvasSpace
  );

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: canvasKeypair.publicKey,
      space: canvasSpace,
      lamports,
      programId: program.programId,
    })
  );

  await provider.sendAndConfirm(transaction, [canvasKeypair]);
}

export function getCanvasAccountSpace(width: number, height: number) {
  return 8 + 32 + 2 + 2 + 4 + width * height + 1;
}

export function decodeCanvasAccount(data: Buffer) {
  let offset = 8;

  const season = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const width = data.readUInt16LE(offset);
  offset += 2;

  const height = data.readUInt16LE(offset);
  offset += 2;

  const pixelCount = data.readUInt32LE(offset);
  offset += 4;

  const pixels = [...data.subarray(offset, offset + pixelCount)];
  offset += pixelCount;

  const frozen = data[offset] === 1;

  return {
    season,
    width,
    height,
    pixels,
    frozen,
  };
}

export async function overwriteAccountOnLocalValidator(
  connection: anchor.web3.Connection,
  address: PublicKey,
  mutate: (data: Buffer) => Buffer
) {
  const accountInfo = await connection.getAccountInfo(address);
  expect(accountInfo).to.not.equal(null);

  const updatedData = mutate(Buffer.from((accountInfo as AccountInfo<Buffer>).data));
  const response = await (
    connection as anchor.web3.Connection & {
      _rpcRequest: (method: string, args: unknown[]) => Promise<{
        error?: { message?: string };
        result?: unknown;
      }>;
    }
  )._rpcRequest("setAccount", [
    address.toBase58(),
    {
      lamports: accountInfo!.lamports,
      data: [updatedData.toString("base64"), "base64"],
      owner: accountInfo!.owner.toBase58(),
      executable: accountInfo!.executable,
      rentEpoch: accountInfo!.rentEpoch,
    },
  ]);

  if (response.error) {
    throw new Error(response.error.message ?? "setAccount RPC failed");
  }
}

export function logNamedPdas(
  label: string,
  pdas: Record<string, { publicKey: PublicKey; bump?: number }>
) {
  console.log(`\n[${label}]`);
  for (const [name, details] of Object.entries(pdas)) {
    const bumpSuffix =
      details.bump === undefined ? "" : ` (bump: ${details.bump})`;
    console.log(`  ${name}: ${details.publicKey.toBase58()}${bumpSuffix}`);
  }
}

export function logCanvasAccountDetails(
  label: string,
  canvasPublicKey: PublicKey,
  canvasAccount: ReturnType<typeof decodeCanvasAccount>
) {
  console.log(`\n[${label}]`);
  console.log(`  canvasAccount: ${canvasPublicKey.toBase58()}`);
  console.log(`  season: ${canvasAccount.season.toBase58()}`);
  console.log(`  width: ${canvasAccount.width}`);
  console.log(`  height: ${canvasAccount.height}`);
  console.log(`  pixelCount: ${canvasAccount.pixels.length}`);
  console.log(`  frozen: ${canvasAccount.frozen}`);
  console.log(`  firstPixel: ${canvasAccount.pixels[0]}`);
  console.log(
    `  lastPixel: ${canvasAccount.pixels[canvasAccount.pixels.length - 1]}`
  );
}

export async function createStartSeasonTransaction(
  provider: anchor.AnchorProvider,
  program: anchor.Program<Pixl>,
  params: {
    authority?: PublicKey;
    game: PublicKey;
    season: PublicKey;
    seasonStats: PublicKey;
    canvasKeypair: Keypair;
    args: any;
  }
) {
  const width = params.args.canvasWidth ?? CANVAS_WIDTH;
  const height = params.args.canvasHeight ?? CANVAS_HEIGHT;
  const canvasSpace = getCanvasAccountSpace(width, height);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    canvasSpace
  );
  const authority = params.authority ?? provider.wallet.publicKey;
  const [gameDerivedPda, gameBump] = deriveGamePda(program.programId);
  const [seasonDerivedPda, seasonBump] = deriveSeasonPda(
    program.programId,
    params.args.seasonId
  );
  const [seasonStatsDerivedPda, seasonStatsBump] = deriveSeasonStatsPda(
    program.programId,
    params.season
  );
  const transaction = new Transaction();

  logNamedPdas("startSeason named addresses", {
    gamePda: { publicKey: params.game, bump: gameBump },
    derivedGamePda: { publicKey: gameDerivedPda, bump: gameBump },
    seasonPda: { publicKey: params.season, bump: seasonBump },
    derivedSeasonPda: { publicKey: seasonDerivedPda, bump: seasonBump },
    seasonStatsPda: {
      publicKey: params.seasonStats,
      bump: seasonStatsBump,
    },
    derivedSeasonStatsPda: {
      publicKey: seasonStatsDerivedPda,
      bump: seasonStatsBump,
    },
    canvasAccount: { publicKey: params.canvasKeypair.publicKey },
    authority: { publicKey: authority },
  });
  console.log(
    `  canvasAccountSpace: ${canvasSpace} bytes, rentLamports: ${lamports}, dimensions: ${width}x${height}`
  );

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: params.canvasKeypair.publicKey,
      space: canvasSpace,
      lamports,
      programId: program.programId,
    })
  );

  transaction.add(
    await program.methods
      .startSeason(params.args)
      .accounts({
        authority,
        //@ts-ignore
        game: params.game,
        season: params.season,
        seasonStats: params.seasonStats,
        canvas: params.canvasKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction()
  );

  return transaction;
}

export async function endSeason(
  program: anchor.Program<Pixl>,
  game: PublicKey,
  season: PublicKey,
  canvas: PublicKey
) {
  const provider = program.provider as anchor.AnchorProvider;
  const methods = program.methods as any;

  return methods
    .endSeason()
    .accounts({
      authority: provider.wallet.publicKey,
      //@ts-ignore
      game,
      season,
      canvas,
    })
    .rpc();
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
      (error as { error?: { errorCode?: unknown; errorMessage?: unknown } })
        .error !== null &&
      "errorCode" in
        ((
          error as {
            error?: { errorCode?: unknown; errorMessage?: unknown };
          }
        ).error ?? {}) &&
      "errorMessage" in
        ((
          error as {
            error?: { errorCode?: unknown; errorMessage?: unknown };
          }
        ).error ?? {}))
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
