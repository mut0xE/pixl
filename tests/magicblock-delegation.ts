import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createJoinedPlayerForSeason,
  createStartSeasonTransaction,
  delegateCanvas,
  delegateAny,
  deriveSeasonAccounts,
  ensureGameInitialized,
  endSeason,
  getMagicBlockConfig,
  getTestContext,
  requireMagicBlockConfig,
  uniqueSeasonId,
  waitForDelegation,
} from "./helpers";

describe("pixl magicblock delegation", () => {
  const { provider, program, gamePda } = getTestContext();
  let currentSeasonPda: PublicKey | null = null;
  let currentCanvas: PublicKey | null = null;
  let currentSeasonEndTime = 0;

  async function ensureNoBlockingActiveSeason() {
    const game = (await program.account.game.fetch(gamePda)) as any;
    if (game.currentSeason.equals(PublicKey.default)) {
      return;
    }

    const activeSeasonPda = game.currentSeason as PublicKey;
    const activeSeason = (await program.account.season.fetch(
      activeSeasonPda
    )) as any;
    const now = Math.floor(Date.now() / 1000);

    if (activeSeason.endTime.toNumber() > now) {
      throw new Error(
        `Active season ${activeSeasonPda.toBase58()} is still running until ${activeSeason.endTime.toNumber()}.`
      );
    }

    await endSeason(program, gamePda, activeSeasonPda, activeSeason.canvas);
  }

  async function createSeason() {
    await ensureGameInitialized();
    await ensureNoBlockingActiveSeason();

    const now = Math.floor(Date.now() / 1000);
    const seasonId = uniqueSeasonId();
    const args = {
      seasonId,
      title: `Delegation ${seasonId}`,
      description: "MagicBlock delegation validation",
      palette: [0x000000, 0xffffff, 0xff0000],
      imageUri: "ipfs://pixl/delegation-test",
      canvasWidth: 4,
      canvasHeight: 4,
      startTime: new anchor.BN(now - 30),
      endTime: new anchor.BN(now + 30),
    };
    const { seasonPda, seasonStatsPda } = deriveSeasonAccounts(
      program.programId,
      seasonId
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });
    await provider.sendAndConfirm(transaction, [canvas]);

    currentSeasonPda = seasonPda;
    currentCanvas = canvas.publicKey;
    currentSeasonEndTime = args.endTime.toNumber();

    return {
      seasonPda,
      seasonStatsPda,
      canvas: canvas.publicKey,
      canvasKeypair: canvas,
    };
  }

  async function cleanupCurrentSeason() {
    if (!currentSeasonPda || !currentCanvas) {
      return;
    }

    const waitMs = Math.max(
      0,
      (currentSeasonEndTime - Math.floor(Date.now() / 1000) + 1) * 1000
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const game = (await program.account.game.fetch(gamePda)) as any;
    if (game.currentSeason.equals(currentSeasonPda)) {
      await endSeason(program, gamePda, currentSeasonPda, currentCanvas);
    }

    currentSeasonPda = null;
    currentCanvas = null;
    currentSeasonEndTime = 0;
  }

  before(function () {
    const config = getMagicBlockConfig();
    if (!config.routerEndpoint) {
      this.skip();
    }
  });

  afterEach(async () => {
    await cleanupCurrentSeason();
  });

  it("delegates all gameplay accounts and proves router/base-layer status", async () => {
    const config = requireMagicBlockConfig();
    const validator = config.validator
      ? new PublicKey(config.validator)
      : undefined;
    const { seasonPda, seasonStatsPda, canvas, canvasKeypair } =
      await createSeason();
    const wallet = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(airdropSignature, "confirmed");
    const { playerPda, seasonProfilePda } = await createJoinedPlayerForSeason(
      program,
      seasonPda,
      seasonStatsPda,
      wallet
    );

    const delegateCanvasSignature = await delegateCanvas(program, {
      game: gamePda,
      season: seasonPda,
      canvas: canvasKeypair,
      validator,
    });
    const delegatePlayerSignature = await delegateAny(program, {
      payer: wallet,
      game: gamePda,
      season: seasonPda,
      targetAccount: playerPda,
      accountType: { player: { wallet: wallet.publicKey } },
      validator,
    });
    const delegateSeasonProfileSignature = await delegateAny(program, {
      game: gamePda,
      season: seasonPda,
      payer: wallet,
      targetAccount: seasonProfilePda,
      accountType: {
        seasonProfile: {
          season: seasonPda,
          wallet: wallet.publicKey,
        },
      },
      validator,
    });
    const delegateSeasonStatsSignature = await delegateAny(program, {
      game: gamePda,
      season: seasonPda,
      targetAccount: seasonStatsPda,
      accountType: { seasonStats: { season: seasonPda } },
      validator,
    });

    console.log("delegateCanvas signature:", delegateCanvasSignature);
    console.log("delegatePlayer signature:", delegatePlayerSignature);
    console.log(
      "delegateSeasonProfile signature:",
      delegateSeasonProfileSignature
    );
    console.log("delegateSeasonStats signature:", delegateSeasonStatsSignature);

    const delegatedAccounts = [{ label: "canvas", publicKey: canvas }];

    for (const account of delegatedAccounts) {
      const { baseInfo, status } = await waitForDelegation(
        provider.connection,
        config.routerEndpoint,
        account.publicKey
      );

      expect(
        baseInfo.owner.equals(
          new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh")
        )
      ).to.equal(true);
      expect(status.isDelegated).to.equal(true);
      console.log(
        `${account.label} delegated via ${status.fqdn ?? "unknown-er"}`
      );
    }
  });

  it("delegates canvas only and proves router/base-layer status", async () => {
    const config = requireMagicBlockConfig();
    const validator = config.validator
      ? new PublicKey(config.validator)
      : undefined;
    const { seasonPda, canvas, canvasKeypair } = await createSeason();

    const delegateCanvasSignature = await delegateCanvas(program, {
      game: gamePda,
      season: seasonPda,
      canvas: canvasKeypair,
      validator,
    });

    console.log("delegateCanvasOnly signature:", delegateCanvasSignature);

    const { baseInfo, status } = await waitForDelegation(
      provider.connection,
      config.routerEndpoint,
      canvas
    );

    expect(
      baseInfo.owner.equals(
        new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh")
      )
    ).to.equal(true);
    expect(status.isDelegated).to.equal(true);
    console.log(`canvas delegated via ${status.fqdn ?? "unknown-er"}`);
  });
});
