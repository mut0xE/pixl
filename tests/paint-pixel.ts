import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  buildStartSeasonArgs,
  createStartSeasonTransaction,
  decodeCanvasAccount,
  derivePlayerAccount,
  deriveSeasonAccounts,
  deriveSeasonProfileAccount,
  endSeason,
  ensureGameInitialized,
  expectAnchorError,
  getTestContext,
  uniqueSeasonId,
} from "./helpers";

describe("pixl paint_pixel on solana", () => {
  const { provider, program, gamePda } = getTestContext();
  let currentSeasonPda: PublicKey | null = null;
  let currentCanvas: PublicKey | null = null;
  let currentSeasonEndTime = 0;

  async function fundWallet(wallet: Keypair) {
    const signature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  async function ensureNoBlockingActiveSeason() {
    const game = (await program.account.game.fetch(gamePda)) as any;
    if (game.currentSeason.equals(PublicKey.default)) {
      return;
    }

    const activeSeasonPda = game.currentSeason as PublicKey;
    const activeSeason = (await program.account.season.fetch(
      activeSeasonPda
    )) as any;
    const activeCanvasInfo = await provider.connection.getAccountInfo(
      activeSeason.canvas
    );
    const now = Math.floor(Date.now() / 1000);

    if (!activeCanvasInfo) {
      throw new Error(
        `Active season ${activeSeasonPda.toBase58()} points to missing canvas ${activeSeason.canvas.toBase58()}. Reset the local validator, then rerun the test.`
      );
    }

    const activeCanvas = decodeCanvasAccount(activeCanvasInfo.data);
    if (activeCanvas.season.toBase58() !== activeSeasonPda.toBase58()) {
      throw new Error(
        `Active season ${activeSeasonPda.toBase58()} is linked to stale canvas ${activeSeason.canvas.toBase58()} whose stored season is ${activeCanvas.season.toBase58()}. Reset the local validator, then rerun the test.`
      );
    }

    if (activeSeason.endTime.toNumber() > now) {
      throw new Error(
        `Active season ${activeSeasonPda.toBase58()} is still running until ${activeSeason.endTime.toNumber()}. End it first or reset the local validator.`
      );
    }

    await endSeason(program, gamePda, activeSeasonPda, activeSeason.canvas);
  }

  async function createSeason(overrides: Partial<any> = {}) {
    await ensureGameInitialized();
    await ensureNoBlockingActiveSeason();

    const now = Math.floor(Date.now() / 1000);
    const seasonId = uniqueSeasonId();
    const args = buildStartSeasonArgs({
      seasonId,
      title: `Paint ${seasonId}`,
      startTime: new anchor.BN(now - 30),
      endTime: new anchor.BN(now + 5),
      canvasWidth: 4,
      canvasHeight: 4,
      ...overrides,
    });
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
    const signature = await provider.sendAndConfirm(transaction, [canvas]);
    console.log("startSeason signature:", signature);

    const season = (await program.account.season.fetch(seasonPda)) as any;
    const canvasInfo = await provider.connection.getAccountInfo(canvas.publicKey);
    expect(canvasInfo).to.not.equal(null);

    const canvasAccount = decodeCanvasAccount(canvasInfo!.data);
    expect(season.canvas.toBase58()).to.equal(canvas.publicKey.toBase58());
    expect(canvasAccount.season.toBase58()).to.equal(seasonPda.toBase58());
    expect(canvasAccount.width).to.equal(args.canvasWidth ?? 4);
    expect(canvasAccount.height).to.equal(args.canvasHeight ?? 4);
    expect(canvasAccount.frozen).to.equal(false);

    currentSeasonPda = seasonPda;
    currentCanvas = canvas.publicKey;
    currentSeasonEndTime = args.endTime.toNumber();

    return { args, seasonPda, seasonStatsPda, canvas };
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
      const signature = await endSeason(
        program,
        gamePda,
        currentSeasonPda,
        currentCanvas
      );
      console.log("cleanup endSeason signature:", signature);
    }

    currentSeasonPda = null;
    currentCanvas = null;
    currentSeasonEndTime = 0;
  }

  async function createJoinedPlayer(
    seasonPda: PublicKey,
    seasonStatsPda: PublicKey
  ) {
    const wallet = Keypair.generate();
    await fundWallet(wallet);

    const { playerPda } = derivePlayerAccount(
      program.programId,
      wallet.publicKey
    );
    const initPlayerSignature = await program.methods
      .initPlayer()
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        game: gamePda,
        player: playerPda,
      })
      .signers([wallet])
      .rpc();
    console.log("initPlayer signature:", initPlayerSignature);

    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      seasonPda,
      wallet.publicKey
    );
    const joinSeasonSignature = await program.methods
      .joinSeason()
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        player: playerPda,
        season: seasonPda,
        seasonStats: seasonStatsPda,
        seasonProfile: seasonProfilePda,
      })
      .signers([wallet])
      .rpc();
    console.log("joinSeason signature:", joinSeasonSignature);

    return { wallet, playerPda, seasonProfilePda };
  }

  async function paint(params: {
    wallet: Keypair;
    seasonPda: PublicKey;
    canvas: PublicKey;
    playerPda: PublicKey;
    seasonProfilePda: PublicKey;
    seasonStatsPda: PublicKey;
    x: number;
    y: number;
    colorIndex: number;
  }) {
    const signature = await program.methods
      .paintPixel(params.x, params.y, params.colorIndex)
      .accounts({
        wallet: params.wallet.publicKey,
        //@ts-ignore
        game: gamePda,
        season: params.seasonPda,
        canvas: params.canvas,
        player: params.playerPda,
        seasonProfile: params.seasonProfilePda,
        seasonStats: params.seasonStatsPda,
      })
      .signers([params.wallet])
      .rpc();
    console.log("paintPixel signature:", signature);
    return signature;
  }

  afterEach(async () => {
    await cleanupCurrentSeason();
  });

  it("paints a valid pixel", async () => {
    const paintX = 1;
    const paintY = 1;
    const colorIndex = 1;
    const { args, seasonPda, seasonStatsPda, canvas } = await createSeason();
    const { wallet, playerPda, seasonProfilePda } = await createJoinedPlayer(
      seasonPda,
      seasonStatsPda
    );

    const paletteIndexDetails = args.palette.map((color, index) => ({
      index,
      colorHex: `0x${color.toString(16).padStart(6, "0")}`,
    }));
    const paintedPixelIndex = paintY * 4 + paintX;
    console.log("palette indexes:", paletteIndexDetails);
    console.log("paint target:", {
      x: paintX,
      y: paintY,
      pixelIndex: paintedPixelIndex,
      colorIndex,
      colorHex: paletteIndexDetails[colorIndex].colorHex,
      painterWallet: wallet.publicKey.toBase58(),
    });

    const paintSignature = await paint({
      wallet,
      seasonPda,
      canvas: canvas.publicKey,
      playerPda,
      seasonProfilePda,
      seasonStatsPda,
      x: paintX,
      y: paintY,
      colorIndex,
    });

    const [player, seasonProfile, seasonStats, canvasInfo] = (await Promise.all(
      [
        program.account.player.fetch(playerPda),
        program.account.seasonProfile.fetch(seasonProfilePda),
        program.account.seasonStats.fetch(seasonStatsPda),
        provider.connection.getAccountInfo(canvas.publicKey),
      ]
    )) as any;
    expect(canvasInfo).to.not.equal(null);

    const canvasAccount = decodeCanvasAccount(canvasInfo!.data);
    expect(paintSignature).to.be.a("string");
    expect(canvasAccount.pixels[paintedPixelIndex]).to.equal(colorIndex);
    expect(player.availableEnergy).to.equal(5);
    expect(player.lifetimePixels.toString()).to.equal("1");
    expect(player.lastPixelAt.toNumber()).to.be.greaterThan(0);
    expect(seasonProfile.pixelsPainted.toString()).to.equal("1");
    expect(seasonStats.totalPixelsPainted.toString()).to.equal("1");
  });

  it("rejects coordinates outside the canvas bounds", async () => {
    const { seasonPda, seasonStatsPda, canvas } = await createSeason();
    const { wallet, playerPda, seasonProfilePda } = await createJoinedPlayer(
      seasonPda,
      seasonStatsPda
    );

    try {
      await paint({
        wallet,
        seasonPda,
        canvas: canvas.publicKey,
        playerPda,
        seasonProfilePda,
        seasonStatsPda,
        x: 4,
        y: 1,
        colorIndex: 1,
      });
      expect.fail("expected out-of-bounds paint to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "InvalidCoordinate",
        "The provided coordinate is outside the canvas bounds."
      );
    }
  });

  it("rejects a palette index that does not exist", async () => {
    const { seasonPda, seasonStatsPda, canvas } = await createSeason();
    const { wallet, playerPda, seasonProfilePda } = await createJoinedPlayer(
      seasonPda,
      seasonStatsPda
    );

    try {
      await paint({
        wallet,
        seasonPda,
        canvas: canvas.publicKey,
        playerPda,
        seasonProfilePda,
        seasonStatsPda,
        x: 1,
        y: 1,
        colorIndex: 3,
      });
      expect.fail("expected invalid palette index to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "InvalidColor",
        "The provided color index is invalid."
      );
    }
  });

  it("rejects repainting a pixel with the same color", async () => {
    const { seasonPda, seasonStatsPda, canvas } = await createSeason();
    const { wallet, playerPda, seasonProfilePda } = await createJoinedPlayer(
      seasonPda,
      seasonStatsPda
    );

    await paint({
      wallet,
      seasonPda,
      canvas: canvas.publicKey,
      playerPda,
      seasonProfilePda,
      seasonStatsPda,
      x: 1,
      y: 1,
      colorIndex: 1,
    });

    try {
      await paint({
        wallet,
        seasonPda,
        canvas: canvas.publicKey,
        playerPda,
        seasonProfilePda,
        seasonStatsPda,
        x: 1,
        y: 1,
        colorIndex: 1,
      });
      expect.fail("expected same-color repaint to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "InvalidAccountState",
        "The account state is invalid for this operation."
      );
    }
  });

  it("rejects painting after the season has been ended", async () => {
    const { seasonPda, seasonStatsPda, canvas } = await createSeason({
      endTime: new anchor.BN(Math.floor(Date.now() / 1000) + 2),
    });
    const { wallet, playerPda, seasonProfilePda } = await createJoinedPlayer(
      seasonPda,
      seasonStatsPda
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const endSeasonSignature = await endSeason(
      program,
      gamePda,
      seasonPda,
      canvas.publicKey
    );
    console.log("endSeason signature:", endSeasonSignature);

    try {
      await paint({
        wallet,
        seasonPda,
        canvas: canvas.publicKey,
        playerPda,
        seasonProfilePda,
        seasonStatsPda,
        x: 1,
        y: 1,
        colorIndex: 1,
      });
      expect.fail("expected ended-season paint to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "WrongSeason",
        "The provided season account does not match the expected season."
      );
    }
  });
});
