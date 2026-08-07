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
import { sendIx, sendErIxSigned, ensureSessionSigner } from "../../lib/actions";
import { getErConnection } from "../../lib/er";
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

  // A completed season is already committed/undelegated/ended; show steps as done.
  const ended = season.completed || season.status === "ended";

  const DoneTag = () => <span className="admin-step__done">DONE</span>;

  function requireCtx() {
    if (!program) throw new Error("Connect the authority wallet");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    return { program, authority: wallet.publicKey };
  }

  // commit_gameplay_state runs on the ER, so it's signed by a funded session key
  // (the wallet rejects the ER blockhash) set as the commit payer.
  const commit =
    (undelegate: boolean) => async (setState: (s: any) => void) => {
      const { program, authority } = requireCtx();
      const [seasonStats] = deriveSeasonStatsPda(program.programId, seasonPk);

      // Preferred path: sign the ER commit with a session key (commit accepts any
      // signer as `payer`), so the wallet never sees the ER blockhash.
      try {
        const signer = await ensureSessionSigner(
          connection,
          wallet,
          program.programId,
          () => setState("awaiting_signature")
        );
        const ix = await buildCommitGameplayStateIx(program, {
          authority: signer.publicKey,
          season: seasonPk,
          seasonStats,
          canvas: canvasPk,
          undelegate,
        });
        setState("confirming");
        // Skip preflight: ER commit intents CPI into the magic program, which
        // base-layer simulation doesn't model (same as the paint path).
        return await sendErIxSigned(signer, [ix], { skipPreflight: true });
      } catch (err) {
        // A reverted ER tx carries a signature — that's a real program error, not
        // a session problem, so surface it instead of re-signing via the fallback.
        if ((err as { signature?: string })?.signature) throw err;
        // Fallback: no usable session — sign the ER commit with the wallet
        // directly (works on-chain, but the wallet warns about a network mismatch).
        console.warn("Session commit failed, falling back to wallet ER sign", err);
        const ix = await buildCommitGameplayStateIx(program, {
          authority,
          season: seasonPk,
          seasonStats,
          canvas: canvasPk,
          undelegate,
        });
        setState("awaiting_signature");
        return sendIx(getErConnection(), wallet, [ix], [], {
          skipPreflight: true,
          cluster: "er",
        });
      }
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
        {ended
          ? "This season is ended — committed, undelegated and frozen. Steps are shown for reference."
          : "Finalize the shared season state. Run these in order on the delegated season."}
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
            {ended && <DoneTag />}
          </div>
          <TxButton
            label="Commit final state"
            onRun={commit(false)}
            onDone={onChanged}
            disabled={ended}
            explorer="er"
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
            {ended && <DoneTag />}
          </div>
          <TxButton
            label="Undelegate shared state"
            onRun={commit(true)}
            onDone={onChanged}
            disabled={ended}
            explorer="er"
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
            {ended && <DoneTag />}
          </div>
          {ended ? (
            <button className="canvas-btn" disabled>
              Season ended
            </button>
          ) : !confirmEnd ? (
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
