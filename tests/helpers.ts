import * as anchor from "@coral-xyz/anchor";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import fs from "fs";
import {
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  type Commitment,
} from "@solana/web3.js";
import type { Pixl } from "../target/types/pixl";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_COLOR_INDEX,
  DEFAULT_ENERGY_COOLDOWN_SECONDS,
  DEFAULT_MAX_ENERGY,
} from "../packages/shared";
import {
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
} from "../packages/sdk";

loadEnv({ path: resolve(process.cwd(), ".env") });

const pixlIdl = require("../target/idl/pixl.json");

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
export const LOCAL_MAGICBLOCK_VALIDATOR = new PublicKey(
  "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"
);
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);
export const BUFFER_SEED = Buffer.from("buffer");
export const DELEGATION_SEED = Buffer.from("delegation");
export const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");

export type TestContext = {
  provider: anchor.AnchorProvider;
  program: anchor.Program<Pixl>;
  gamePda: PublicKey;
};

export type TestWorld = {
  admin: TestContext;
  playerWallet: Keypair;
  gamePda: PublicKey;
  seasonId: number;
  seasonPda: PublicKey;
  seasonStatsPda: PublicKey;
  canvasKeypair?: Keypair;
  playerPda: PublicKey;
  seasonProfilePda: PublicKey;
  seasonEndTime: number;
  createdFreshSeason?: boolean;
  erRpcUrl?: string;
  erValidator?: PublicKey | null;
};

export type MagicBlockConfig = {
  l1RpcUrl: string;
  routerEndpoint: string;
  erRpcUrl: string;
  validator?: PublicKey;
};

function expandHome(path: string) {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

function resolveWalletPath() {
  return expandHome(process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json");
}

function loadWallet(path = resolveWalletPath()) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function providerOptions() {
  const commitment: Commitment = "confirmed";
  return {
    commitment,
    preflightCommitment: commitment,
  };
}

function buildProvider(url: string) {
  const wallet = new anchor.Wallet(loadWallet());
  return new anchor.AnchorProvider(
    new anchor.web3.Connection(url, providerOptions().commitment),
    wallet,
    providerOptions()
  );
}

function buildProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(pixlIdl, provider) as anchor.Program<Pixl>;
}

export function getAdminContext(url = resolveBaseRpcUrl()): TestContext {
  const provider = buildProvider(url);
  const program = buildProgram(provider);
  const [gamePda] = deriveGamePda(program.programId);

  return { provider, program, gamePda };
}

export function getWalletContext(url: string, wallet: Keypair): TestContext {
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(url, providerOptions().commitment),
    new anchor.Wallet(wallet),
    providerOptions()
  );
  const program = buildProgram(provider);
  const [gamePda] = deriveGamePda(program.programId);

  return { provider, program, gamePda };
}

export function resolveBaseRpcUrl() {
  return (
    process.env.L1_RPC_URL ??
    process.env.ANCHOR_PROVIDER_URL ??
    "http://127.0.0.1:8899"
  );
}

export function getMagicBlockConfig(): MagicBlockConfig {
  const validator = process.env.MAGICBLOCK_VALIDATOR;

  return {
    l1RpcUrl: resolveBaseRpcUrl(),
    routerEndpoint:
      process.env.ROUTER_ENDPOINT ?? "https://devnet-router.magicblock.app/",
    erRpcUrl:
      process.env.ER_RPC_URL ??
      process.env.MAGICBLOCK_ER_RPC_URL ??
      process.env.EPHEMERAL_PROVIDER_ENDPOINT ??
      "",
    validator: validator ? new PublicKey(validator) : undefined,
  };
}

export function hasMagicBlockEnv() {
  return Boolean(getMagicBlockConfig().routerEndpoint);
}

export function isLocalEndpoint(url: string) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export function resolveDelegationValidator(
  config: MagicBlockConfig
): PublicKey | null {
  if (config.validator) {
    return config.validator;
  }
  return isLocalEndpoint(config.l1RpcUrl) ? LOCAL_MAGICBLOCK_VALIDATOR : null;
}

type DelegationStatus = {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: {
    authority: string;
    owner: string;
    delegationSlot: number;
    lamports: number;
  };
};

export async function getDelegationStatus(
  account: PublicKey
): Promise<DelegationStatus> {
  const response = await fetch(getMagicBlockConfig().routerEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });
  const body = (await response.json()) as any;
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.result as DelegationStatus;
}

export async function resolveErEndpoint(
  account: PublicKey,
  { timeoutMs = 30_000, intervalMs = 1_000 } = {}
): Promise<string> {
  const override = getMagicBlockConfig().erRpcUrl;
  if (override) {
    return override;
  }

  return (await resolveDelegationTarget(account, { timeoutMs, intervalMs }))
    .erRpcUrl;
}

export async function resolveDelegationTarget(
  account: PublicKey,
  { timeoutMs = 30_000, intervalMs = 1_000 } = {}
): Promise<{ erRpcUrl: string; validator: PublicKey | null }> {
  const override = getMagicBlockConfig().erRpcUrl;
  const deadline = Date.now() + timeoutMs;
  let lastError = "router did not report a delegated fqdn";
  while (Date.now() < deadline) {
    try {
      const status = await getDelegationStatus(account);
      if (status.isDelegated && status.fqdn) {
        return {
          erRpcUrl: override || status.fqdn,
          validator: status.delegationRecord
            ? new PublicKey(status.delegationRecord.authority)
            : null,
        };
      }
    } catch (error) {
      lastError = String(error);
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out resolving delegation for ${account.toBase58()}: ${lastError}`
  );
}

export function deriveSeasonAddressSet(programId: PublicKey, seasonId: number) {
  const [seasonPda] = deriveSeasonPda(programId, seasonId);
  const [seasonStatsPda] = deriveSeasonStatsPda(programId, seasonPda);

  return { seasonPda, seasonStatsPda };
}

export function derivePlayerAddress(programId: PublicKey, wallet: PublicKey) {
  const [playerPda] = derivePlayerPda(programId, wallet);
  return playerPda;
}

export function deriveSeasonProfileAddress(
  programId: PublicKey,
  season: PublicKey,
  wallet: PublicKey
) {
  const [seasonProfilePda] = deriveSeasonProfilePda(programId, season, wallet);
  return seasonProfilePda;
}

export function deriveBufferPda(programId: PublicKey, target: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [BUFFER_SEED, target.toBuffer()],
    programId
  )[0];
}

export function deriveDelegationRecordPda(target: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, target.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export function deriveDelegationMetadataPda(target: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_SEED, target.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

export function uniqueSeasonId() {
  return Math.floor(Math.random() * 0xffffffff) + 1;
}

export function canvasAccountSpace(width: number, height: number) {
  return 8 + 32 + 2 + 2 + 4 + width * height + 1;
}

export async function createCanvasAccount(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  canvasKeypair: Keypair,
  width: number,
  height: number
) {
  const space = canvasAccountSpace(width, height);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    space
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: canvasKeypair.publicKey,
      space,
      lamports,
      programId,
    })
  );

  return provider.sendAndConfirm(tx, [canvasKeypair]);
}

export async function ensureGameInitialized(ctx: TestContext) {
  const upgradeableLoaderProgramId = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [ctx.program.programId.toBuffer()],
    upgradeableLoaderProgramId
  );

  try {
    return await (ctx.program.methods as any)
      .initGame()
      .accounts({
        admin: ctx.provider.wallet.publicKey,
        game: ctx.gamePda,
        programData: programDataAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  } catch (error) {
    const message = String(error);
    if (message.includes("already in use")) {
      return "already-initialized";
    }
    throw error;
  }
}

export async function resolveActiveSeason(
  ctx: TestContext,
  gamePda: PublicKey
) {
  const game = (await ctx.program.account.game.fetch(gamePda)) as any;
  if (game.currentSeason.equals(PublicKey.default)) {
    return null;
  }

  const season = (await ctx.program.account.season.fetch(
    game.currentSeason
  )) as any;
  const { seasonStatsPda } = deriveSeasonAddressSet(
    ctx.program.programId,
    season.id
  );

  return {
    seasonPda: game.currentSeason as PublicKey,
    seasonStatsPda,
    canvas: season.canvas as PublicKey,
    seasonId: season.id as number,
    endTime: season.endTime.toNumber(),
    completed: season.completed as boolean,
  };
}

export async function ensurePlayerInitialized(
  ctx: TestContext,
  gamePda: PublicKey,
  playerPda: PublicKey,
  wallet: Keypair
) {
  const existing = await ctx.provider.connection.getAccountInfo(
    playerPda,
    "confirmed"
  );
  if (existing) {
    return "already-initialized";
  }

  return (ctx.program.methods as any)
    .initPlayer()
    .accounts({
      wallet: wallet.publicKey,
      game: gamePda,
      player: playerPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet])
    .rpc();
}

export async function ensureJoinedSeason(
  ctx: TestContext,
  wallet: Keypair,
  playerPda: PublicKey,
  seasonPda: PublicKey,
  seasonStatsPda: PublicKey,
  seasonProfilePda: PublicKey
) {
  const existing = await ctx.provider.connection.getAccountInfo(
    seasonProfilePda,
    "confirmed"
  );
  if (existing) {
    return "already-joined";
  }

  return (ctx.program.methods as any)
    .joinSeason()
    .accounts({
      wallet: wallet.publicKey,
      player: playerPda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      seasonProfile: seasonProfilePda,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet])
    .rpc();
}

export async function fundWallet(
  connection: anchor.web3.Connection,
  wallet: PublicKey,
  lamports = 2 * anchor.web3.LAMPORTS_PER_SOL
) {
  const signature = await connection.requestAirdrop(wallet, lamports);
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function fundFromAdmin(
  admin: TestContext,
  recipient: PublicKey,
  lamports = anchor.web3.LAMPORTS_PER_SOL / 5
) {
  const existing = await admin.provider.connection.getBalance(
    recipient,
    "confirmed"
  );
  if (existing >= lamports) {
    return;
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.provider.wallet.publicKey,
      toPubkey: recipient,
      lamports: lamports - existing,
    })
  );
  await admin.provider.sendAndConfirm(tx);
}

export async function createFundedPlayer(admin: TestContext) {
  const wallet = Keypair.generate();
  await fundFromAdmin(admin, wallet.publicKey);
  return wallet;
}

export function buildSeasonArgs({
  now = Math.floor(Date.now() / 1000),
  durationSeconds = 120,
}: { now?: number; durationSeconds?: number } = {}) {
  return {
    seasonId: uniqueSeasonId(),
    title: "Pixl Genesis Season",
    description: "Collaborative pixel canvas on MagicBlock",
    palette: [0x000000, 0xffffff, 0xff6b35, 0x2ec4b6],
    imageUri: "ipfs://pixl/genesis",
    canvasWidth: 4,
    canvasHeight: 4,
    startTime: new anchor.BN(now - 30),
    endTime: new anchor.BN(now + durationSeconds),
  };
}

export async function fetchCanvasAccount(
  connection: anchor.web3.Connection,
  canvas: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(canvas, "confirmed");
  if (!accountInfo) {
    throw new Error(`Canvas account ${canvas.toBase58()} was not found`);
  }

  let offset = 8;
  const season = new PublicKey(accountInfo.data.subarray(offset, offset + 32));
  offset += 32;
  const width = accountInfo.data.readUInt16LE(offset);
  offset += 2;
  const height = accountInfo.data.readUInt16LE(offset);
  offset += 2;
  const pixelCount = accountInfo.data.readUInt32LE(offset);
  offset += 4;
  const pixels = [...accountInfo.data.subarray(offset, offset + pixelCount)];
  offset += pixelCount;
  const frozen = accountInfo.data[offset] === 1;

  return { season, width, height, pixels, frozen };
}

export function logSection(title: string, details?: Record<string, unknown>) {
  console.log(`\n[${title}]`);
  if (!details) {
    return;
  }

  for (const [key, value] of Object.entries(details)) {
    console.log(`  ${key}: ${String(value)}`);
  }
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 2_000, label = "operation" } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(
          `  ${label} attempt ${attempt} failed (${String(
            error
          )}); retrying...`
        );
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

export async function waitFor(
  predicate: () => Promise<boolean>,
  { timeoutMs = 30_000, intervalMs = 1_000, label = "condition" } = {}
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`);
}

export async function waitForL1CanvasPixel(
  connection: anchor.web3.Connection,
  canvas: PublicKey,
  index: number,
  expected: number,
  label = "L1 canvas pixel"
) {
  await waitFor(
    async () => {
      const state = await fetchCanvasAccount(connection, canvas);
      return state.pixels[index] === expected;
    },
    { label }
  );
}

export async function waitForErDelegated(
  erConnection: anchor.web3.Connection,
  account: PublicKey,
  programId: PublicKey,
  label = "delegated clone on ER"
) {
  await sleep(6_000);
  await waitFor(
    async () => {
      const info = await erConnection.getAccountInfo(account, "confirmed");
      return Boolean(info && info.owner.equals(programId));
    },
    { label, timeoutMs: 45_000, intervalMs: 2_000 }
  );
}

export async function waitForAccountOwner(
  connection: anchor.web3.Connection,
  account: PublicKey,
  expectedOwner: PublicKey,
  label = "account owner"
) {
  await waitFor(
    async () => {
      const info = await connection.getAccountInfo(account, "confirmed");
      return Boolean(info && info.owner.equals(expectedOwner));
    },
    { label }
  );
}

export async function isDelegated(
  connection: anchor.web3.Connection,
  account: PublicKey
) {
  const info = await connection.getAccountInfo(account, "confirmed");
  return Boolean(info && info.owner.equals(DELEGATION_PROGRAM_ID));
}

export async function resetToCleanSlate(
  admin: TestContext,
  playerWallet: Keypair
) {
  const game = (await admin.program.account.game.fetch(admin.gamePda)) as any;
  if (game.currentSeason.equals(PublicKey.default)) {
    return;
  }

  const seasonPda = game.currentSeason as PublicKey;
  const season = (await admin.program.account.season.fetch(seasonPda)) as any;
  const playerPda = derivePlayerAddress(
    admin.program.programId,
    playerWallet.publicKey
  );
  const seasonProfilePda = deriveSeasonProfileAddress(
    admin.program.programId,
    seasonPda,
    playerWallet.publicKey
  );
  const connection = admin.provider.connection;

  logSection("reset: recovering orphaned season", {
    season: seasonPda.toBase58(),
    seasonId: season.id,
  });

  await waitUntilSeasonCanEnd({
    seasonEndTime: season.endTime.toNumber(),
  } as TestWorld);

  const playerDelegated =
    (await isDelegated(connection, playerPda)) ||
    (await isDelegated(connection, seasonProfilePda));

  if (playerDelegated) {
    const erRpcUrl = await resolveErEndpoint(playerPda);
    const erPlayer = getWalletContext(erRpcUrl, playerWallet);
    await (erPlayer.program.methods as any)
      .commitAndUndelegatePlayer()
      .accounts({
        payer: playerWallet.publicKey,
        season: seasonPda,
        player: playerPda,
        seasonProfile: seasonProfilePda,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .rpc();
    await waitForAccountOwner(connection, playerPda, admin.program.programId);
    await waitForAccountOwner(
      connection,
      seasonProfilePda,
      admin.program.programId
    );
  }

  await (admin.program.methods as any)
    .endSeason()
    .accounts({
      authority: admin.provider.wallet.publicKey,
      game: admin.gamePda,
      season: seasonPda,
      canvas: null,
    })
    .rpc();
}

export async function waitUntilSeasonCanEnd(world: TestWorld) {
  const waitMs =
    Math.max(0, world.seasonEndTime - Math.floor(Date.now() / 1000) + 1) * 1000;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export function assertDefaultPlayerState(player: any, wallet: PublicKey) {
  return {
    walletMatches: player.wallet.equals(wallet),
    energy: player.availableEnergy === DEFAULT_MAX_ENERGY,
    maxEnergy: player.maxEnergy === DEFAULT_MAX_ENERGY,
    cooldown: player.energyCooldownSeconds === DEFAULT_ENERGY_COOLDOWN_SECONDS,
  };
}

export function assertDefaultCanvasState(
  canvas: Awaited<ReturnType<typeof fetchCanvasAccount>>
) {
  return {
    widthMatches: canvas.width === CANVAS_WIDTH || canvas.width === 4,
    heightMatches: canvas.height === CANVAS_HEIGHT || canvas.height === 4,
    firstPixel: canvas.pixels[0] === DEFAULT_COLOR_INDEX,
    frozen: canvas.frozen === false,
  };
}

export async function assertSystemWallet(
  connection: anchor.web3.Connection,
  wallet: PublicKey
) {
  const accountInfo = await connection.getAccountInfo(wallet, "confirmed");
  if (!accountInfo) {
    return;
  }

  if (!accountInfo.owner.equals(SystemProgram.programId)) {
    throw new Error(
      `Wallet ${wallet.toBase58()} is owned by ${accountInfo.owner.toBase58()}, expected ${SystemProgram.programId.toBase58()}`
    );
  }

  if (accountInfo.data.length !== 0) {
    throw new Error(
      `Wallet ${wallet.toBase58()} carries ${accountInfo.data.length} bytes of data and cannot be used as a payer`
    );
  }
}

export async function getTxLogs(
  error: unknown,
  connection: anchor.web3.Connection
) {
  if (error instanceof SendTransactionError) {
    return (await error.getLogs(connection)) ?? [];
  }

  return [];
}

export function loadPlayer(filePath: string): Keypair {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}
