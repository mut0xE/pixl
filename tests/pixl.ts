import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { deriveGamePda } from "../packages/sdk";
import { Pixl } from "../target/types/pixl";

describe("pixl", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pixl as Program<Pixl>;
  const [gamePda] = deriveGamePda(program.programId);
  const upgradeableLoaderProgramId = new PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    upgradeableLoaderProgramId
  );

  it("rejects a non-upgrade-authority caller for init_game", async () => {
    const attacker = Keypair.generate();
    const signature = await provider.connection.requestAirdrop(
      attacker.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature, "confirmed");

    try {
      await program.methods
        .initGame()
        .accounts({
          admin: attacker.publicKey,
          programData: programDataAddress,
        })
        .signers([attacker])
        .rpc();

      expect.fail("expected unauthorized initGame call to fail");
    } catch (error) {
      const message = `${error}`;
      expect(message).to.include("Unauthorized");
    }
  });

  it("initializes the singleton game for the upgrade authority", async () => {
    await program.methods
      .initGame()
      .accounts({
        admin: provider.wallet.publicKey,
        programData: programDataAddress,
      })
      .rpc();

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
