"use client";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildCommitGameplayStateIx,
  buildEndSeasonIx,
  deriveSeasonStatsPda,
  type SeasonSummary,
} from "../../../../packages/sdk";
import { usePixlProgram } from "../../lib/program";
import { getErConnection } from "../../lib/er";
import { sendIx } from "../../lib/actions";
import { TxButton } from "../TxButton";

export function SeasonLifecyclePanel({
  game,
  season,
  onChanged,
}: {
  game: PublicKey;
  season: SeasonSummary;
  onChanged?: () => void;
}) {
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [confirmEnd, setConfirmEnd] = useState(false);

  const seasonPk = new PublicKey(season.address);
  const canvasPk = new PublicKey(season.canvas);

  function requireCtx() {
    if (!program) throw new Error("Connect the authority wallet");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    return { program, authority: wallet.publicKey };
  }

  // commit_gameplay_state runs on the Ephemeral Rollup; build offline, submit
  // over the ER connection signed by the connected admin wallet.
  const commit =
    (undelegate: boolean) => async (setState: (s: any) => void) => {
      const { program, authority } = requireCtx();
      const [seasonStats] = deriveSeasonStatsPda(program.programId, seasonPk);
      const ix = await buildCommitGameplayStateIx(program, {
        authority,
        season: seasonPk,
        seasonStats,
        canvas: canvasPk,
        undelegate,
      });
      setState("awaiting_signature");
      return sendIx(getErConnection(), wallet, [ix]);
    };

  const end = async (setState: (s: any) => void) => {
    const { program, authority } = requireCtx();
    const ix = await buildEndSeasonIx(program, {
      authority,
      game,
      season: seasonPk,
      canvas: canvasPk,
    });
    setState("awaiting_signature");
    return sendIx(connection, wallet, [ix]);
  };

  return (
    <section className="admin-card">
      <h3 className="admin-card__heading">
        LIFECYCLE — {season.title || "Untitled"}{" "}
        <span className="admin-card__id">#{season.id}</span>
      </h3>
      <p className="admin-card__note">
        Finalize the shared season state. Run these in order on the delegated
        season.
      </p>

      <ol className="admin-steps">
        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">1</span>
            <div>
              <strong>Commit checkpoint</strong>
              <span>
                Snapshot Canvas + SeasonStats to L1, keep painting (ER).
              </span>
            </div>
          </div>
          <TxButton
            label="Commit final state"
            onRun={commit(false)}
            onDone={onChanged}
          />
        </li>

        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">2</span>
            <div>
              <strong>Commit &amp; undelegate</strong>
              <span>
                Final snapshot, return canvas + stats ownership to L1 (ER).
              </span>
            </div>
          </div>
          <TxButton
            label="Undelegate shared state"
            onRun={commit(true)}
            onDone={onChanged}
          />
        </li>

        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">3</span>
            <div>
              <strong>End season</strong>
              <span>
                Mark completed and freeze the canvas (L1). Irreversible.
              </span>
            </div>
          </div>
          {!confirmEnd ? (
            <button
              className="canvas-btn canvas-btn--danger"
              onClick={() => setConfirmEnd(true)}
            >
              End season…
            </button>
          ) : (
            <div className="admin-confirm">
              <span>
                End “{season.title || "Untitled"}”? This cannot be undone.
              </span>
              <div className="admin-confirm__actions">
                <button
                  className="canvas-btn"
                  onClick={() => setConfirmEnd(false)}
                >
                  Cancel
                </button>
                <TxButton
                  label="Confirm end season"
                  onRun={end}
                  onDone={() => {
                    setConfirmEnd(false);
                    onChanged?.();
                  }}
                />
              </div>
            </div>
          )}
        </li>
      </ol>

      <p className="admin-card__foot">
        Player accounts (Player / SeasonProfile) undelegate via{" "}
        <code>commit_and_undelegate_player</code>, signed by each player —
        outside admin scope.
      </p>
    </section>
  );
}
