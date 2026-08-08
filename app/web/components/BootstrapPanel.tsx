"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAdmin } from "../lib/useAdmin";
import { WalletControl } from "./WalletControl";
import { deriveSessionKeypair } from "../../../packages/sdk";
import { usePixlProgram } from "../lib/program";
import { useBootstrap } from "../lib/useBootstrap";
import { setUpSession, joinActiveSeason, createPlayer } from "../lib/actions";
import { saveSessionMeta, nextSessionNonce } from "../lib/session-store";
import { TxButton } from "./TxButton";
import { PixlCanvas } from "./PixlCanvas";
import { SeasonBrowser } from "./SeasonBrowser";

export function BootstrapPanel() {
  const { status, refetch, seasonAddress, session, setSession, error } =
    useBootstrap();
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { isAuthority } = useAdmin();
  // Session secret lives in memory only; only its public metadata is persisted.
  const sessionSecretRef = useRef<Keypair | null>(null);

  // Re-derive the in-memory secret from the persisted session on load.
  useEffect(() => {
    if (!wallet.publicKey || !session) {
      sessionSecretRef.current = null;
      return;
    }
    const derived = deriveSessionKeypair(wallet.publicKey, session.nonce);
    // Sanity check: derived signer must match the stored public metadata.
    sessionSecretRef.current =
      derived.publicKey.toBase58() === session.sessionSigner ? derived : null;
  }, [wallet.publicKey?.toBase58(), session?.sessionSigner, session?.nonce]);

  // Ready: hand the whole viewport to the canvas. The wordmark, wallet control
  // and admin link ride along as floating chrome instead of a boxed header.
  if (status === "ready") {
    return (
      <PixlCanvas
        seasonAddress={seasonAddress}
        wallet={wallet.publicKey ?? null}
        session={session}
        sessionSecret={sessionSecretRef.current}
        shareable
        chrome={
          <>
            {isAuthority && (
              <Link href="/admin" className="header-link">
                ADMIN
              </Link>
            )}
            <WalletControl />
          </>
        }
      />
    );
  }

  return (
    <section className="bootstrap-panel" data-status={status}>
      <header
        className="bootstrap-panel__header reveal"
        style={{ animationDelay: "40ms" }}
      >
        <h1>Pixl</h1>
        <div className="bootstrap-panel__nav">
          {isAuthority && (
            <Link href="/admin" className="header-link">
              ADMIN
            </Link>
          )}
          <WalletControl />
        </div>
      </header>

      <p
        className="bootstrap-panel__status reveal"
        style={{ animationDelay: "120ms" }}
      >
        <span
          className="bootstrap-panel__status-dot"
          data-status={status}
          aria-hidden
        />
        {status.replace(/_/g, " ")}
      </p>

      <div
        className="bootstrap-panel__body reveal"
        style={{ animationDelay: "180ms" }}
      >
        {status === "disconnected" && (
          <p className="bootstrap-panel__hint">Connect a wallet to begin.</p>
        )}

        {(status === "connecting" ||
          status === "loading_game" ||
          status === "loading_player" ||
          status === "loading_profile") &&
          (error ? (
            <p className="bootstrap-panel__hint bootstrap-panel__hint--error">
              Couldn't reach the network. {error}
              <button
                type="button"
                className="bootstrap-panel__retry"
                onClick={() => refetch()}
              >
                Retry
              </button>
            </p>
          ) : (
            <div
              className="loading-bar"
              role="progressbar"
              aria-label={status.replace(/_/g, " ")}
            >
              <span className="loading-bar__fill" />
            </div>
          ))}

        {status === "no_active_season" && <SeasonBrowser />}

        {status === "player_missing" &&
          program &&
          wallet.publicKey &&
          seasonAddress && (
            <TxButton
              label="Create Player"
              onRun={async (setState) => {
                setState("building");
                // Create the Player PDA on L1 only; delegation happens in Join Season.
                return createPlayer(program, wallet, connection, () =>
                  setState("awaiting_signature")
                );
              }}
              onDone={refetch}
            />
          )}

        {status === "season_profile_missing" &&
          program &&
          wallet.publicKey &&
          seasonAddress && (
            <TxButton
              label="Join Season"
              onRun={async (setState) => {
                setState("building");
                // One action, two layers: create + delegate the profile on L1,
                // wait for the ER clone, then join on the rollup.
                return joinActiveSeason(
                  program,
                  wallet,
                  connection,
                  seasonAddress,
                  (phase) =>
                    setState(
                      phase === "syncing to rollup"
                        ? "confirming"
                        : "awaiting_signature"
                    )
                );
              }}
              onDone={refetch}
            />
          )}

        {(status === "session_missing" || status === "session_expired") &&
          program &&
          wallet.publicKey && (
            <TxButton
              label={
                status === "session_expired"
                  ? "Renew Session"
                  : "Set Up Session"
              }
              onRun={async (setState) => {
                setState("awaiting_signature");
                const nonce = nextSessionNonce(wallet.publicKey!.toBase58());
                const { meta, secret, signature } = await setUpSession(
                  connection,
                  wallet,
                  program.programId,
                  nonce
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
      </div>
    </section>
  );
}
