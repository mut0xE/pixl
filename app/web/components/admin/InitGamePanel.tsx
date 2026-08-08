"use client";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildInitGameIx } from "../../../../packages/sdk";
import { usePixlProgram } from "../../lib/program";
import { sendIx } from "../../lib/actions";
import { TxButton } from "../TxButton";

// Shown when the Game PDA hasn't been created yet. Only the program's current
// upgrade authority can sign this (enforced on-chain in init_game.rs).
export function InitGamePanel({
  game,
  onDone,
}: {
  game: PublicKey;
  onDone: () => void;
}) {
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();

  const init = async (setState: (s: any) => void) => {
    if (!program) throw new Error("Program not ready");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const ix = await buildInitGameIx(program, {
      admin: wallet.publicKey,
      game,
    });
    setState("awaiting_signature");
    return sendIx(connection, wallet, [ix]);
  };

  return (
    <section className="admin-card admin-gate">
      <h3 className="admin-card__heading">Game not initialized</h3>
      <p className="admin-card__note">
        No <code>Game</code> account exists yet for this program. Initialize
        it once from the program's upgrade authority wallet — that wallet
        becomes the game authority.
      </p>
      <p className="admin-card__foot">
        Connected: <code>{wallet.publicKey?.toBase58() ?? "—"}</code>
      </p>
      <TxButton label="Initialize game" onRun={init} onDone={onDone} />
    </section>
  );
}
