import { expect } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  ensureGameInitialized,
  expectAnchorError,
  getTestContext,
} from "./helpers";

describe("pixl init_game", () => {
  const { provider, program, gamePda } = getTestContext();
  const upgradeableLoaderProgramId = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    upgradeableLoaderProgramId
  );

  before(async () => {
    await ensureGameInitialized();
  });

  it("rejects a non-upgrade-authority caller for init_game", async () => {
    const unauthorizedAdmin = Keypair.generate();
    const airdropSignature = await provider.connection.requestAirdrop(
      unauthorizedAdmin.publicKey,
      LAMPORTS_PER_SOL
    );
    console.log("unauthorized admin airdrop signature:", airdropSignature);
    await provider.connection.confirmTransaction(airdropSignature, "confirmed");

    try {
      await program.methods
        .initGame()
        .accounts({
          admin: unauthorizedAdmin.publicKey,
          programData: programDataAddress,
        })
        .signers([unauthorizedAdmin])
        .rpc();

      expect.fail("expected unauthorized initGame call to fail");
    } catch (error) {
      await expectAnchorError(
        error,
        provider.connection,
        "Unauthorized",
        "Unauthorized action for the provided authority."
      );
    }
  });

  it("stores the singleton game for the upgrade authority", async () => {
    const game = await program.account.game.fetch(gamePda);

    expect(game.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
    expect(game.currentSeason.toBase58()).to.equal(
      PublicKey.default.toBase58()
    );
    expect(game.currentSeasonId).to.equal(0);
    expect(game.totalRegisteredPlayers.toString()).to.equal("0");
  });
});
