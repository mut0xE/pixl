import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_COLOR_INDEX,
  MAX_CANVAS_PIXELS,
} from "../packages/shared";
import {
  buildStartSeasonArgs,
  createStartSeasonTransaction,
  decodeCanvasAccount,
  deriveSeasonAccounts,
  ensureGameInitialized,
  expectAnchorError,
  getTestContext,
  logCanvasAccountDetails,
  uniqueSeasonId,
} from "./helpers";

describe("pixl start_season on solana", () => {
  const { provider, program, gamePda } = getTestContext();

  before(async () => {
    await ensureGameInitialized();
  });

  it("rejects start_season when season id is zero", async () => {
    const args = buildStartSeasonArgs({ seasonId: 0 });
    const { seasonPda, seasonStatsPda } = deriveSeasonAccounts(
      program.programId,
      0
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });

    try {
      await provider.sendAndConfirm(transaction, [canvas]);

      expect.fail("expected zero season id to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "InvalidSeasonId",
        "The provided season id is invalid."
      );
    }
  });

  it("rejects start_season for a non-admin signer", async () => {
    const unauthorizedAuthority = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      unauthorizedAuthority.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature, "confirmed");

    const args = buildStartSeasonArgs({ seasonId: uniqueSeasonId() });
    const { seasonPda, seasonStatsPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      authority: unauthorizedAuthority.publicKey,
      game: gamePda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });

    try {
      await provider.sendAndConfirm(transaction, [unauthorizedAuthority, canvas]);

      expect.fail("expected unauthorized startSeason call to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "Unauthorized",
        "Unauthorized action for the provided authority."
      );
    }
  });

  it("uses default canvas dimensions when not provided", async () => {
    const args = buildStartSeasonArgs();
    const { seasonPda, seasonStatsPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });
    const signature = await provider.sendAndConfirm(transaction, [canvas]);
    console.log("startSeason default signature:", signature);

    const canvasInfoPromise = provider.connection.getAccountInfo(
      canvas.publicKey
    );
    const [game, season, seasonStats, canvasInfo] = (await Promise.all([
      program.account.game.fetch(gamePda),
      program.account.season.fetch(seasonPda),
      program.account.seasonStats.fetch(seasonStatsPda),
      canvasInfoPromise,
    ])) as any;
    expect(canvasInfo).to.not.equal(null);
    const canvasAccount = decodeCanvasAccount(canvasInfo.data);
    logCanvasAccountDetails(
      "startSeason canvas account",
      canvas.publicKey,
      canvasAccount
    );

    expect(game.currentSeason.toBase58()).to.equal(seasonPda.toBase58());
    expect(game.currentSeasonId).to.equal(args.seasonId);
    expect(season.imageUri).to.equal(args.imageUri);
    expect(seasonStats.totalPixelsPainted.toString()).to.equal("0");
    expect(seasonStats.participantCount.toString()).to.equal("0");
    expect(canvasAccount.season.toBase58()).to.equal(seasonPda.toBase58());
    expect(canvasAccount.width).to.equal(CANVAS_WIDTH);
    expect(canvasAccount.height).to.equal(CANVAS_HEIGHT);
    expect(canvasAccount.pixels.length).to.equal(CANVAS_WIDTH * CANVAS_HEIGHT);
    expect(canvasAccount.pixels[0]).to.equal(DEFAULT_COLOR_INDEX);
    expect(canvasAccount.pixels[canvasAccount.pixels.length - 1]).to.equal(
      DEFAULT_COLOR_INDEX
    );
    expect(canvasAccount.frozen).to.equal(false);
  });

  it("rejects invalid custom canvas dimensions", async () => {
    const args = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: "Oversized Canvas",
      imageUri: "ipfs://pixl/custom-canvas",
      canvasWidth: 1025,
      canvasHeight: 1025,
    });
    const { seasonPda, seasonStatsPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: seasonPda,
      seasonStats: seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });

    try {
      await provider.sendAndConfirm(transaction, [canvas]);

      expect.fail("expected oversized canvas to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "InvalidCanvasDimensions",
        "The provided canvas dimensions are invalid."
      );
    }
  });

  it("rejects starting a second season while one is active", async () => {
    const game = (await program.account.game.fetch(gamePda)) as any;
    expect(game.currentSeasonId).to.not.equal(0);

    const secondArgs = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: "Second Season",
    });
    const secondAccounts = deriveSeasonAccounts(
      program.programId,
      secondArgs.seasonId
    );
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: secondAccounts.seasonPda,
      seasonStats: secondAccounts.seasonStatsPda,
      canvasKeypair: canvas,
      args: secondArgs,
    });

    try {
      await provider.sendAndConfirm(transaction, [canvas]);

      expect.fail("expected second active season to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "SeasonAlreadyActive",
        "A season is already active."
      );
    }
  });
});
