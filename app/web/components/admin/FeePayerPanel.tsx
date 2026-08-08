"use client";
import { useCallback, useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildDelegateFeePayerIx,
  buildInitFeePayerIx,
  buildTopUpFeePayerIx,
  deriveGamePda,
  getFeePayerStatus,
  type FeePayerStatus,
} from "../../../../packages/sdk";
import { usePixlProgram } from "../../lib/program";
import { sendIx } from "../../lib/actions";
import { TxButton } from "../TxButton";

// One-time setup for the delegated fee payer that pays ER commit fees so commits
// are not capped at the 10 sponsored commits per delegated account.
export function FeePayerPanel() {
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [topUpSol, setTopUpSol] = useState("0.05");
  const [status, setStatus] = useState<FeePayerStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    try {
      setStatus(await getFeePayerStatus(connection, program.programId));
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [program, connection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function requireCtx() {
    if (!program) throw new Error("Connect the authority wallet");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    const [game] = deriveGamePda(program.programId);
    return { program, authority: wallet.publicKey, game };
  }

  const init = async (setState: (s: any) => void) => {
    const { program, authority, game } = requireCtx();
    const ix = await buildInitFeePayerIx(program, { authority, game });
    setState("awaiting_signature");
    return sendIx(connection, wallet, [ix]);
  };

  const delegate = async (setState: (s: any) => void) => {
    const { program, authority, game } = requireCtx();
    const ix = await buildDelegateFeePayerIx(program, {
      payer: authority,
      game,
      validator: null,
    });
    setState("awaiting_signature");
    return sendIx(connection, wallet, [ix]);
  };

  const topUp = async (setState: (s: any) => void) => {
    const { program, authority } = requireCtx();
    const sol = Number(topUpSol);
    if (!Number.isFinite(sol) || sol <= 0) {
      throw new Error("Enter a positive SOL amount");
    }
    const lamports = Math.round(sol * LAMPORTS_PER_SOL);
    const ix = buildTopUpFeePayerIx(authority, program.programId, lamports);
    setState("awaiting_signature");
    return sendIx(connection, wallet, [ix]);
  };

  const initialized = status?.initialized ?? false;
  const delegated = status?.delegated ?? false;
  const funded = (status?.escrowLamports ?? 0) > 0;
  const ready = status?.ready ?? false;
  const escrowSol = ((status?.escrowLamports ?? 0) / LAMPORTS_PER_SOL).toFixed(4);

  const DoneTag = () => <span className="admin-step__done">DONE</span>;

  return (
    <section className="admin-card">
      <h3 className="admin-card__heading">
        FEE PAYER — uncapped commits{" "}
        {status &&
          (ready ? (
            <span className="admin-card__id">READY</span>
          ) : (
            <span className="admin-card__id">SETUP NEEDED</span>
          ))}
      </h3>
      <p className="admin-card__note">
        Set up once per deployment. The delegated fee payer pays every commit
        fee, so canvases can commit past the 10 free sponsored commits. Keep it
        funded.
      </p>
      {status && (
        <p className="admin-card__foot">
          PDA: <code>{status.address.toBase58()}</code>
          <br />
          Escrow balance: <code>{escrowSol} SOL</code>
          {loading ? " (refreshing…)" : ""}
        </p>
      )}

      <ol className="admin-steps">
        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">1</span>
            <div>
              <strong>Initialize</strong>
              <span>Create the fee payer PDA (base layer, authority only).</span>
            </div>
            {initialized && <DoneTag />}
          </div>
          <TxButton
            label={initialized ? "Already initialized" : "Init fee payer"}
            onRun={init}
            onDone={refresh}
            disabled={initialized}
          />
        </li>

        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">2</span>
            <div>
              <strong>Delegate</strong>
              <span>Delegate it to the ER so it can pay commit fees.</span>
            </div>
            {delegated && <DoneTag />}
          </div>
          <TxButton
            label={delegated ? "Already delegated" : "Delegate fee payer"}
            onRun={delegate}
            onDone={refresh}
            disabled={!initialized || delegated}
          />
        </li>

        <li className="admin-step">
          <div className="admin-step__label">
            <span className="admin-step__num">3</span>
            <div>
              <strong>Fund</strong>
              <span>Top up its ephemeral balance so it keeps paying.</span>
            </div>
            {funded && <DoneTag />}
          </div>
          <div className="admin-confirm__actions">
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={topUpSol}
              onChange={(e) => setTopUpSol(e.target.value)}
              aria-label="Top up amount in SOL"
              style={{ maxWidth: 120 }}
            />
            <span style={{ alignSelf: "center" }}>SOL</span>
            <TxButton
              label="Top up"
              onRun={topUp}
              onDone={refresh}
              disabled={!initialized}
            />
          </div>
        </li>
      </ol>
    </section>
  );
}
