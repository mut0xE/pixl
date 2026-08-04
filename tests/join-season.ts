import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  buildStartSeasonArgs,
  createStartSeasonTransaction,
  endSeason,
  derivePlayerAccount,
  deriveSeasonAccounts,
  deriveSeasonStatsAccount,
  deriveSeasonProfileAccount,
  ensureGameInitialized,
  expectAnchorError,
  getAnchorTestError,
  getTestContext,
  uniqueSeasonId,
} from "./helpers";

describe("pixl join_season on solana", () => {
  const { provider, program, gamePda } = getTestContext();
  let activeSeasonPda: anchor.web3.PublicKey;
  let activeSeasonStatsPda: anchor.web3.PublicKey;
  let activeSeasonEndTime = 0;

  async function fundWallet(wallet: Keypair) {
    const signature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  async function initPlayer(wallet: Keypair) {
    const { playerPda } = derivePlayerAccount(program.programId, wallet.publicKey);

    const signature = await program.methods
      .initPlayer()
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        game: gamePda,
        player: playerPda,
      })
      .signers([wallet])
      .rpc();
    console.log("initPlayer signature:", signature);

    return { playerPda };
  }

  async function startSeason(overrides: Partial<any> = {}) {
    const currentUnixTime = Math.floor(Date.now() / 1000);
    const args = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: `Season ${uniqueSeasonId()}`,
      startTime: new anchor.BN(currentUnixTime - 30),
      endTime: new anchor.BN(currentUnixTime + 12),
      ...overrides,
    });
    const accounts = deriveSeasonAccounts(program.programId, args.seasonId);
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: accounts.seasonPda,
      seasonStats: accounts.seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });
    const signature = await provider.sendAndConfirm(transaction, [canvas]);
    console.log("startSeason setup signature:", signature);

    activeSeasonEndTime = args.endTime.toNumber();

    return { args, ...accounts, canvas };
  }
  async function waitForSeasonToEnd() {
    const waitMs = Math.max(0, (activeSeasonEndTime - Math.floor(Date.now() / 1000) + 1) * 1000);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  before(async () => {
    await ensureGameInitialized();
    const game = (await program.account.game.fetch(gamePda)) as any;
    const now = Math.floor(Date.now() / 1000);

    if (
      game.currentSeason.toBase58() === anchor.web3.PublicKey.default.toBase58()
    ) {
      const { seasonPda, seasonStatsPda } = await startSeason();
      activeSeasonPda = seasonPda;
      activeSeasonStatsPda = seasonStatsPda;
      return;
    }

    activeSeasonPda = game.currentSeason;
    const activeSeason = (await program.account.season.fetch(
      activeSeasonPda
    )) as any;

    if (activeSeason.endTime.toNumber() <= now) {
      const endSeasonSignature = await endSeason(
        program,
        gamePda,
        activeSeasonPda
      );
      console.log("endSeason setup signature:", endSeasonSignature);

      const { seasonPda, seasonStatsPda } = await startSeason();
      activeSeasonPda = seasonPda;
      activeSeasonStatsPda = seasonStatsPda;
      return;
    }

    const { seasonStatsPda } = deriveSeasonStatsAccount(program.programId, activeSeasonPda);
    activeSeasonStatsPda = seasonStatsPda;
    activeSeasonEndTime = activeSeason.endTime.toNumber();
    console.log(
      "reusing active season:",
      activeSeasonPda.toBase58(),
      "seasonStats:",
      activeSeasonStatsPda.toBase58()
    );
  });

  it("successful join", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      activeSeasonPda,
      wallet.publicKey
    );
    const beforeStats = (await program.account.seasonStats.fetch(
      activeSeasonStatsPda
    )) as any;

    const signature = await program.methods
      .joinSeason()
      //@ts-ignore
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        player: playerPda,
        season: activeSeasonPda,
        seasonStats: activeSeasonStatsPda,
        seasonProfile: seasonProfilePda,
      })
      .signers([wallet])
      .rpc();
    console.log("joinSeason signature:", signature);

    const [seasonProfile, seasonStats] = (await Promise.all([
      program.account.seasonProfile.fetch(seasonProfilePda),
      program.account.seasonStats.fetch(activeSeasonStatsPda),
    ])) as any;

    expect(seasonProfile.season.toBase58()).to.equal(activeSeasonPda.toBase58());
    expect(seasonProfile.player.toBase58()).to.equal(playerPda.toBase58());
    expect(seasonProfile.pixelsPainted.toString()).to.equal("0");
    expect(seasonProfile.joinedAt.toNumber()).to.be.greaterThan(0);
    expect(seasonStats.participantCount.toString()).to.equal(
      (BigInt(beforeStats.participantCount.toString()) + BigInt(1)).toString()
    );
  });

  it("duplicate join fails", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      activeSeasonPda,
      wallet.publicKey
    );

    await program.methods
      .joinSeason()
      //@ts-ignore
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        player: playerPda,
        season: activeSeasonPda,
        seasonStats: activeSeasonStatsPda,
        seasonProfile: seasonProfilePda,
      })
      .signers([wallet])
      .rpc();

    try {
      await program.methods
        .joinSeason()
        //@ts-ignore
        .accounts({
          wallet: wallet.publicKey,
          //@ts-ignore
          player: playerPda,
          season: activeSeasonPda,
          seasonStats: activeSeasonStatsPda,
          seasonProfile: seasonProfilePda,
        })
        .signers([wallet])
        .rpc();

      expect.fail("expected duplicate join to fail");
    } catch (error) {
      const parsed = await getAnchorTestError(error, provider.connection);
      expect(
        [parsed.message, ...parsed.logs].some((line) =>
          line.toLowerCase().includes("already in use")
        )
      ).to.equal(true);
    }
  });

  it("participant count increments once", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      activeSeasonPda,
      wallet.publicKey
    );
    const beforeStats = (await program.account.seasonStats.fetch(
      activeSeasonStatsPda
    )) as any;

    await program.methods
      .joinSeason()
      //@ts-ignore
      .accounts({
        wallet: wallet.publicKey,
        //@ts-ignore
        player: playerPda,
        season: activeSeasonPda,
        seasonStats: activeSeasonStatsPda,
        seasonProfile: seasonProfilePda,
      })
      .signers([wallet])
      .rpc();

    const seasonStats = (await program.account.seasonStats.fetch(
      activeSeasonStatsPda
    )) as any;
    expect(seasonStats.participantCount.toString()).to.equal(
      (BigInt(beforeStats.participantCount.toString()) + BigInt(1)).toString()
    );
  });

  it("wrong player or season relationship fails", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    const wrongWallet = Keypair.generate();
    await fundWallet(wrongWallet);
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      activeSeasonPda,
      wrongWallet.publicKey
    );

    try {
      await program.methods
        .joinSeason()
        //@ts-ignore
        .accounts({
          wallet: wrongWallet.publicKey,
          //@ts-ignore
          player: playerPda,
          season: activeSeasonPda,
          seasonStats: activeSeasonStatsPda,
          seasonProfile: seasonProfilePda,
        })
        .signers([wrongWallet])
        .rpc();

      expect.fail("expected mismatched player relationship to fail");
    } catch (error) {
      const parsed = await getAnchorTestError(error, provider.connection);
      expect(
        [parsed.message, ...parsed.logs].some(
          (line) =>
            line.includes("PlayerNotInitialized") ||
            line.includes("ConstraintSeeds") ||
            line.includes("seeds constraint was violated")
        )
      ).to.equal(true);
    }
  });

  it("cannot join completed season", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    await waitForSeasonToEnd();
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      activeSeasonPda,
      wallet.publicKey
    );

    try {
      await program.methods
        .joinSeason()
        //@ts-ignore
        .accounts({
          wallet: wallet.publicKey,
          //@ts-ignore
          player: playerPda,
          season: activeSeasonPda,
          seasonStats: activeSeasonStatsPda,
          seasonProfile: seasonProfilePda,
        })
        .signers([wallet])
        .rpc();

      expect.fail("expected completed season join to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "SeasonNotActive",
        "The season is not active."
      );
    }
  });
});
