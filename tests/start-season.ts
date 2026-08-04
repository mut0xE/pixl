import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  CANVAS_HEIGHT,
  CANVAS_PIXELS,
  CANVAS_WIDTH,
  DEFAULT_COLOR_INDEX,
} from "../packages/shared";
import {
  buildStartSeasonArgs,
  deriveSeasonAccounts,
  ensureGameInitialized,
  expectAnchorError,
  getTestContext,
  uniqueSeasonId,
} from "./helpers";

describe("pixl start_season on solana", () => {
  const { provider, program, gamePda } = getTestContext();

  before(async () => {
    await ensureGameInitialized();
  });

  it("rejects start_season when season id is zero", async () => {
    const args = buildStartSeasonArgs({ seasonId: 0 });
    const { seasonPda, seasonStatsPda, canvasPda } = deriveSeasonAccounts(
      program.programId,
      0
    );

    try {
      await program.methods
        .startSeason(args)
        .accounts({
          authority: provider.wallet.publicKey,
          game: gamePda,
          season: seasonPda,
          seasonStats: seasonStatsPda,
          canvas: canvasPda,
        })
        .rpc();

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
    const { seasonPda, seasonStatsPda, canvasPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );

    try {
      await program.methods
        .startSeason(args)
        .accounts({
          authority: unauthorizedAuthority.publicKey,
          game: gamePda,
          season: seasonPda,
          seasonStats: seasonStatsPda,
          canvas: canvasPda,
        })
        .signers([unauthorizedAuthority])
        .rpc();

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
    const { seasonPda, seasonStatsPda, canvasPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );

    const signature = await program.methods
      .startSeason(args)
      .accounts({
        authority: provider.wallet.publicKey,
        game: gamePda,
        season: seasonPda,
        seasonStats: seasonStatsPda,
        canvas: canvasPda,
      })
      .rpc();
    console.log("startSeason default signature:", signature);

    const [game, season, seasonStats, canvas] = (await Promise.all([
      program.account.game.fetch(gamePda),
      program.account.season.fetch(seasonPda),
      program.account.seasonStats.fetch(seasonStatsPda),
      program.account.canvas.fetch(canvasPda),
    ])) as any;

    expect(game.currentSeason.toBase58()).to.equal(seasonPda.toBase58());
    expect(game.currentSeasonId).to.equal(args.seasonId);
    expect(season.imageUri).to.equal(args.imageUri);
    expect(seasonStats.totalPixelsPainted.toString()).to.equal("0");
    expect(seasonStats.participantCount.toString()).to.equal("0");
    expect(canvas.width).to.equal(CANVAS_WIDTH);
    expect(canvas.height).to.equal(CANVAS_HEIGHT);
    expect(canvas.pixels.length).to.equal(CANVAS_PIXELS);
    expect(canvas.pixels[0]).to.equal(DEFAULT_COLOR_INDEX);
    expect(canvas.pixels[CANVAS_PIXELS - 1]).to.equal(DEFAULT_COLOR_INDEX);
  });

  it("rejects invalid custom canvas dimensions", async () => {
    const args = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: "Oversized Canvas",
      imageUri: "ipfs://pixl/custom-canvas",
      canvasWidth: 300,
      canvasHeight: 300,
    });
    const { seasonPda, seasonStatsPda, canvasPda } = deriveSeasonAccounts(
      program.programId,
      args.seasonId
    );

    try {
      await program.methods
        .startSeason(args)
        .accounts({
          authority: provider.wallet.publicKey,
          game: gamePda,
          season: seasonPda,
          seasonStats: seasonStatsPda,
          canvas: canvasPda,
        })
        .rpc();

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
    const secondAccounts = deriveSeasonAccounts(program.programId, secondArgs.seasonId);

    try {
      await program.methods
        .startSeason(secondArgs)
        .accounts({
          authority: provider.wallet.publicKey,
          game: gamePda,
          season: secondAccounts.seasonPda,
          seasonStats: secondAccounts.seasonStatsPda,
          canvas: secondAccounts.canvasPda,
        })
        .rpc();

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
