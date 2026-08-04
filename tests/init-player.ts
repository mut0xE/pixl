import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  DEFAULT_ENERGY_COOLDOWN_SECONDS,
  DEFAULT_MAX_ENERGY,
} from "../packages/shared";
import {
  derivePlayerAccount,
  ensureGameInitialized,
  getAnchorTestError,
  getTestContext,
} from "./helpers";

describe("pixl init_player on surfpool", () => {
  const { provider, program, gamePda } = getTestContext();
  const wallet = Keypair.generate();
  let initialRegisteredPlayers = "0";

  before(async () => {
    await ensureGameInitialized();
    const game = (await program.account.game.fetch(gamePda)) as any;
    initialRegisteredPlayers = game.totalRegisteredPlayers.toString();

    const signature = await provider.connection.requestAirdrop(
      wallet.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  });

  it("creates a player with the expected defaults", async () => {
    const { playerPda } = derivePlayerAccount(
      program.programId,
      wallet.publicKey
    );

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

    const [game, player] = (await Promise.all([
      program.account.game.fetch(gamePda),
      program.account.player.fetch(playerPda),
    ])) as any;

    expect(player.wallet.toBase58()).to.equal(wallet.publicKey.toBase58());
    expect(player.availableEnergy).to.equal(DEFAULT_MAX_ENERGY);
    expect(player.maxEnergy).to.equal(DEFAULT_MAX_ENERGY);
    expect(player.energyCooldownSeconds).to.equal(
      DEFAULT_ENERGY_COOLDOWN_SECONDS
    );
    expect(player.lastEnergyRefresh.toNumber()).to.be.greaterThan(0);
    expect(player.lifetimePixels.toString()).to.equal("0");
    expect(player.joinedAt.toNumber()).to.equal(
      player.lastEnergyRefresh.toNumber()
    );
    expect(player.lastPixelAt.toString()).to.equal("0");
    expect(game.totalRegisteredPlayers.toString()).to.equal(
      (BigInt(initialRegisteredPlayers) + BigInt(1)).toString()
    );
  });

  it("fails when creating a duplicate player", async () => {
    const { playerPda } = derivePlayerAccount(
      program.programId,
      wallet.publicKey
    );

    try {
      await program.methods
        .initPlayer()
        .accounts({
          wallet: wallet.publicKey,
          //@ts-ignore
          game: gamePda,
          player: playerPda,
        })
        .signers([wallet])
        .rpc();

      expect.fail("expected duplicate player creation to fail");
    } catch (error) {
      const parsed = await getAnchorTestError(error, provider.connection);
      expect(
        [parsed.message, ...parsed.logs].some((line) =>
          line.toLowerCase().includes("already in use")
        )
      ).to.equal(true);
    }
  });

  it("increments the game player count exactly once", async () => {
    const game = await program.account.game.fetch(gamePda);
    expect(game.totalRegisteredPlayers.toString()).to.equal(
      (BigInt(initialRegisteredPlayers) + BigInt(1)).toString()
    );
  });
});
