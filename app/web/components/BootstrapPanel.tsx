"use client";
import { useRef } from "react";
import type { Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { buildInitPlayerIx, buildJoinSeasonIx } from "../../../packages/sdk";
import { usePixlProgram } from "../lib/program";
import { useBootstrap } from "../lib/useBootstrap";
import { sendIx, setUpSession } from "../lib/actions";
import { saveSessionMeta } from "../lib/session-store";
import { TxButton } from "./TxButton";

export function BootstrapPanel() {
  const { status, refetch, seasonAddress, session, setSession } = useBootstrap();
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  // Session secret lives in memory only for this render tree — never persisted,
  // never logged. Only its public metadata goes to localStorage.
  const sessionSecretRef = useRef<Keypair | null>(null);

  return (
    <section className="bootstrap-panel" data-status={status}>
      <header className="bootstrap-panel__header reveal" style={{ animationDelay: "40ms" }}>
        <h1>Pixl</h1>
        <WalletMultiButton />
      </header>

      <p className="bootstrap-panel__status reveal" style={{ animationDelay: "120ms" }}>
        <span className="bootstrap-panel__status-dot" data-status={status} aria-hidden />
        {status.replace(/_/g, " ")}
      </p>

      <div className="bootstrap-panel__body reveal" style={{ animationDelay: "180ms" }}>
        {status === "disconnected" && (
          <p className="bootstrap-panel__hint">Connect a wallet to begin.</p>
        )}

        {(status === "connecting" ||
          status === "loading_game" ||
          status === "loading_player" ||
          status === "loading_profile") && (
          <p className="bootstrap-panel__hint">
            <span className="spinner" aria-hidden /> Loading…
          </p>
        )}

        {status === "no_active_season" && (
          <p className="bootstrap-panel__hint">
            No active season yet. Check back later.
          </p>
        )}

        {status === "player_missing" && program && wallet.publicKey && (
          <TxButton
            label="Create Player"
            onRun={async (setState) => {
              setState("building");
              const ix = await buildInitPlayerIx(program, { wallet: wallet.publicKey! });
              setState("awaiting_signature");
              const sig = await sendIx(connection, wallet, [ix]);
              setState("confirming");
              return sig;
            }}
            onDone={refetch}
          />
        )}

        {status === "season_profile_missing" && program && wallet.publicKey && seasonAddress && (
          <TxButton
            label="Join Season"
            onRun={async (setState) => {
              setState("building");
              const ix = await buildJoinSeasonIx(program, {
                wallet: wallet.publicKey!,
                season: seasonAddress,
              });
              setState("awaiting_signature");
              const sig = await sendIx(connection, wallet, [ix]);
              setState("confirming");
              return sig;
            }}
            onDone={refetch}
          />
        )}

        {(status === "session_missing" || status === "session_expired") && program && wallet.publicKey && (
          <TxButton
            label={status === "session_expired" ? "Renew Session" : "Set Up Session"}
            onRun={async (setState) => {
              setState("awaiting_signature");
              const { meta, secret, signature } = await setUpSession(
                connection,
                wallet,
                program.programId
              );
              sessionSecretRef.current = secret;
              saveSessionMeta(wallet.publicKey!.toBase58(), meta);
              setSession(meta);
              setState("confirming");
              return signature;
            }}
            onDone={refetch}
          />
        )}

        {status === "ready" && (
          <p className="bootstrap-panel__ready">
            You&apos;re in — painting coming soon.
          </p>
        )}
      </div>
    </section>
  );
}
