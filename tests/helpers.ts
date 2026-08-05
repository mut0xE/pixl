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
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
export const LOCAL_MAGICBLOCK_VALIDATOR = new PublicKey(
  "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
);

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

function resolveRouterEndpoint() {
  return process.env.ROUTER_ENDPOINT ?? "";
}

function resolveEphemeralProviderUrl() {
  return process.env.EPHEMERAL_PROVIDER_ENDPOINT ?? "";
}

function resolveWalletPath() {
  if (process.env.ANCHOR_WALLET) {
    return expandHome(process.env.ANCHOR_WALLET);
  }

  return resolve(homedir(), ".config/solana/id.json");
}

function resolvePlayerOneWalletPath() {
  if (process.env.PLAYER_ONE_WALLET) {
    return expandHome(process.env.PLAYER_ONE_WALLET);
  }

  return resolveWalletPath();
}

function resolvePlayerTwoWalletPath() {
  if (process.env.PLAYER_TWO_WALLET) {
    return expandHome(process.env.PLAYER_TWO_WALLET);
  }

  return resolveWalletPath();
}

function providerOptions() {
  return {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  } as const;
}

function loadWalletFromPath(path: string) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function loadWallet() {
  return loadWalletFromPath(resolveWalletPath());
}

export function loadPlayerOneWallet() {
  return loadWalletFromPath(resolvePlayerOneWalletPath());
}

export function loadPlayerTwoWallet() {
  return loadWalletFromPath(resolvePlayerTwoWalletPath());
}

function buildProvider(url = resolveProviderUrl()) {
  const opts = providerOptions();
  const walletKeypair = loadWallet();
  const connection = new anchor.web3.Connection(url, opts.commitment);
  const wallet = new anchor.Wallet(walletKeypair);

  return new anchor.AnchorProvider(connection, wallet, opts);
}

export function buildBaseProvider() {
  return buildProvider(resolveProviderUrl());
}

export function buildEphemeralProvider(erUrl: string) {
  return buildProvider(erUrl);
}

export async function buildEphemeralProviderForAccount(account: PublicKey) {
  const config = requireMagicBlockConfig();
  const status = await getDelegationStatus(account, config.routerEndpoint);
  if (!status.fqdn) {
    throw new Error(
      `Router returned no ER endpoint for delegated account ${account.toBase58()}.`
    );
  }

  return buildEphemeralProvider(status.fqdn);
}

function buildTestContext(provider: anchor.AnchorProvider) {
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

export function getTestContext() {
  return buildTestContext(buildBaseProvider());
}

export function getEphemeralTestContext(erUrl: string) {
  return buildTestContext(buildEphemeralProvider(erUrl));
}

export function getMagicBlockConfig() {
  const baseUrl = resolveProviderUrl();
  const routerEndpoint = resolveRouterEndpoint();
  const erUrl = resolveEphemeralProviderUrl();
  const isLocalBase =
    baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");

  return {
    baseUrl,
    routerEndpoint,
    erUrl,
    isLocalBase,
    validator:
      process.env.MAGICBLOCK_VALIDATOR ??
      (isLocalBase ? LOCAL_MAGICBLOCK_VALIDATOR.toBase58() : ""),
  };
}

export function requireMagicBlockConfig() {
  const config = getMagicBlockConfig();
  if (!config.routerEndpoint) {
    throw new Error(
      "ROUTER_ENDPOINT is required for MagicBlock delegation tests."
    );
  }
  return config;
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

  const updatedData = mutate(
    Buffer.from((accountInfo as AccountInfo<Buffer>).data)
  );
  const response = await (
    connection as anchor.web3.Connection & {
      _rpcRequest: (
        method: string,
        args: unknown[]
      ) => Promise<{
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

export type DelegationStatus = {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: {
    authority?: string;
    owner?: string;
    delegationSlot?: number;
    lamports?: number;
  };
};

export async function getDelegationStatus(
  account: PublicKey,
  routerEndpoint: string
): Promise<DelegationStatus> {
  const response = await fetch(routerEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: DelegationStatus;
  };

  if (body.error) {
    throw new Error(body.error.message ?? "getDelegationStatus failed");
  }
  if (!body.result) {
    throw new Error("Router returned no delegation status result");
  }

  return body.result;
}

export async function waitForDelegation(
  connection: anchor.web3.Connection,
  routerEndpoint: string,
  account: PublicKey,
  maxAttempts = 20
) {
  let lastStatus: DelegationStatus | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [baseInfo, status] = await Promise.all([
      connection.getAccountInfo(account, "confirmed"),
      getDelegationStatus(account, routerEndpoint),
    ]);
    lastStatus = status;

    if (
      baseInfo &&
      baseInfo.owner.equals(DELEGATION_PROGRAM_ID) &&
      status.isDelegated
    ) {
      return {
        baseInfo,
        status,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Account ${account.toBase58()} did not become delegated. Last router status: ${JSON.stringify(
      lastStatus
    )}`
  );
}

export async function createJoinedPlayerForSeason(
  program: anchor.Program<Pixl>,
  seasonPda: PublicKey,
  seasonStatsPda: PublicKey,
  wallet: Keypair
) {
  const { playerPda } = derivePlayerAccount(
    program.programId,
    wallet.publicKey
  );
  let initPlayerSignature: string | null = null;

  try {
    initPlayerSignature = await program.methods
      .initPlayer()
      .accounts({
        wallet: wallet.publicKey,
        // @ts-ignore
        game: deriveGamePda(program.programId)[0],
        player: playerPda,
      })
      .signers([wallet])
      .rpc();
    console.log("initPlayer signature:", initPlayerSignature);
  } catch (error) {
    const parsed = await getAnchorTestError(
      error,
      (program.provider as anchor.AnchorProvider).connection
    );
    const alreadyExists = [parsed.message, ...parsed.logs].some((line) =>
      line.toLowerCase().includes("already in use")
    );

    if (!alreadyExists) {
      throw error;
    }

    console.log(
      `initPlayer skipped for ${wallet.publicKey.toBase58()}: player ${playerPda.toBase58()} already exists`
    );
  }

  const { seasonProfilePda } = deriveSeasonProfileAccount(
    program.programId,
    seasonPda,
    wallet.publicKey
  );
  const joinSeasonSignature = await program.methods
    .joinSeason()
    .accounts({
      wallet: wallet.publicKey,
      // @ts-ignore
      player: playerPda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      seasonProfile: seasonProfilePda,
    })
    .signers([wallet])
    .rpc();
  console.log("joinSeason signature:", joinSeasonSignature);

  return {
    wallet,
    playerPda,
    seasonProfilePda,
    initPlayerSignature,
    joinSeasonSignature,
  };
}

export type DelegateAnyAccountType =
  | { player: { wallet: PublicKey } }
  | { seasonProfile: { season: PublicKey; wallet: PublicKey } }
  | { seasonStats: { season: PublicKey } };

export async function delegateAny(
  program: anchor.Program<Pixl>,
  params: {
    payer?: Keypair;
    targetAccount: PublicKey;
    season: PublicKey;
    game: PublicKey;
    accountType: DelegateAnyAccountType;
    validator?: PublicKey;
  }
) {
  const provider = program.provider as anchor.AnchorProvider;
  const payer = params.payer ?? provider.wallet.payer;
  const payerPublicKey =
    "publicKey" in payer ? payer.publicKey : provider.wallet.publicKey;

  const methodBuilder = (program.methods as any).delegateAny(
    params.accountType
  );

  return methodBuilder
    .accounts({
      payer: payerPublicKey,
      targetAccount: params.targetAccount,
      season: params.season,
      game: params.game,
      validator: params.validator ?? null,
    })
    .signers([
      ...(params.payer ? [params.payer] : []),
    ])
    .rpc();
}

export async function delegateCanvas(
  program: anchor.Program<Pixl>,
  params: {
    payer?: Keypair;
    canvas: Keypair;
    season: PublicKey;
    game: PublicKey;
    validator?: PublicKey;
  }
) {
  const provider = program.provider as anchor.AnchorProvider;
  const payer = params.payer ?? provider.wallet.payer;
  const payerPublicKey =
    "publicKey" in payer ? payer.publicKey : provider.wallet.publicKey;

  return (program.methods as any)
    .delegateCanvas()
    .accounts({
      payer: payerPublicKey,
      canvas: params.canvas.publicKey,
      season: params.season,
      game: params.game,
      validator: params.validator ?? null,
    })
    .signers([...(params.payer ? [params.payer] : []), params.canvas])
    .rpc();
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
