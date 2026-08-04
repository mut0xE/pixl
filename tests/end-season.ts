import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  buildStartSeasonArgs,
  createStartSeasonTransaction,
  derivePlayerAccount,
  deriveSeasonAccounts,
  deriveSeasonProfileAccount,
  endSeason,
  ensureGameInitialized,
  expectAnchorError,
  getTestContext,
  uniqueSeasonId,
} from "./helpers";

describe("pixl end_season on solana", () => {
  const { provider, program, gamePda } = getTestContext();
  let seasonPda: anchor.web3.PublicKey;
  let seasonStatsPda: anchor.web3.PublicKey;

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

  before(async () => {
    await ensureGameInitialized();

    const currentUnixTime = Math.floor(Date.now() / 1000);
    const args = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: `End Season ${uniqueSeasonId()}`,
      startTime: new anchor.BN(currentUnixTime - 30),
      endTime: new anchor.BN(currentUnixTime + 2),
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

    try {
      const signature = await provider.sendAndConfirm(transaction, [canvas]);
      console.log("startSeason setup signature:", signature);
      seasonPda = accounts.seasonPda;
      seasonStatsPda = accounts.seasonStatsPda;
    } catch (error) {
      const game = (await program.account.game.fetch(gamePda)) as any;
      seasonPda = game.currentSeason;
      const season = (await program.account.season.fetch(seasonPda)) as any;

      if (season.endTime.toNumber() <= currentUnixTime) {
        const signature = await endSeason(program, gamePda, seasonPda);
        console.log("endSeason setup signature:", signature);
        const retrySignature = await provider.sendAndConfirm(transaction, [canvas]);
        console.log("startSeason setup signature:", retrySignature);
        seasonPda = accounts.seasonPda;
        seasonStatsPda = accounts.seasonStatsPda;
      } else {
        seasonStatsPda = accounts.seasonStatsPda;
      }
    }
  });

  it("marks the season completed and clears the active game season", async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const signature = await endSeason(program, gamePda, seasonPda);
    console.log("endSeason signature:", signature);

    const [game, season] = (await Promise.all([
      program.account.game.fetch(gamePda),
      program.account.season.fetch(seasonPda),
    ])) as any;

    expect(season.completed).to.equal(true);
    expect(game.currentSeason.toBase58()).to.equal(
      anchor.web3.PublicKey.default.toBase58()
    );
    expect(game.currentSeasonId).to.equal(0);
  });

  it("rejects join_season after end_season", async () => {
    const wallet = Keypair.generate();
    await fundWallet(wallet);
    const { playerPda } = await initPlayer(wallet);
    const { seasonProfilePda } = deriveSeasonProfileAccount(
      program.programId,
      seasonPda,
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
          season: seasonPda,
          seasonStats: seasonStatsPda,
          seasonProfile: seasonProfilePda,
        })
        .signers([wallet])
        .rpc();

      expect.fail("expected ended season join to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "SeasonAlreadyCompleted",
        "The season has already been completed."
      );
    }
  });

  it("allows starting a new season after end_season", async () => {
    const currentUnixTime = Math.floor(Date.now() / 1000);
    const args = buildStartSeasonArgs({
      seasonId: uniqueSeasonId(),
      title: `Next Season ${uniqueSeasonId()}`,
      startTime: new anchor.BN(currentUnixTime - 30),
      endTime: new anchor.BN(currentUnixTime + 30),
    });
    const nextAccounts = deriveSeasonAccounts(program.programId, args.seasonId);
    const canvas = Keypair.generate();
    const transaction = await createStartSeasonTransaction(provider, program, {
      game: gamePda,
      season: nextAccounts.seasonPda,
      seasonStats: nextAccounts.seasonStatsPda,
      canvasKeypair: canvas,
      args,
    });
    const signature = await provider.sendAndConfirm(transaction, [canvas]);
    console.log("startSeason next signature:", signature);

    const [game, season] = (await Promise.all([
      program.account.game.fetch(gamePda),
      program.account.season.fetch(nextAccounts.seasonPda),
    ])) as any;

    expect(game.currentSeason.toBase58()).to.equal(
      nextAccounts.seasonPda.toBase58()
    );
    expect(game.currentSeasonId).to.equal(args.seasonId);
    expect(season.completed).to.equal(false);
  });
});
