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

const LOADING_PIXELS = Array.from({ length: 12 }, (_, i) => i);
const LOADING_STATUSES = new Set([
  "connecting",
  "loading_game",
  "loading_player",
  "loading_profile",
]);

export function BootstrapPanel() {
  const { status, refetch, seasonAddress, session, setSession, error } =
    useBootstrap();
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { isAuthority } = useAdmin();
  const isLoadingStatus = LOADING_STATUSES.has(status);
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
      <div className="bootstrap-panel__grain" aria-hidden />
      <header
        className="bootstrap-panel__header reveal"
        style={{ animationDelay: "40ms" }}
      >
        <div className="bootstrap-panel__brand">
          <span className="bootstrap-panel__eyebrow">Session gateway</span>
          <h1>Pixl</h1>
        </div>
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
        {isLoadingStatus ? "loading game" : status.replace(/_/g, " ")}
      </p>

      <div
        className="bootstrap-panel__meta reveal"
        style={{ animationDelay: "150ms" }}
      >
        <span className="bootstrap-panel__meta-pill">Wallet-synced</span>
        <span className="bootstrap-panel__meta-pill">Season-aware</span>
        <span className="bootstrap-panel__meta-pill">One-tap entry</span>
      </div>

      <div
        className="bootstrap-panel__body reveal"
        style={{ animationDelay: "180ms" }}
      >
        {status === "disconnected" && (
          <p className="bootstrap-panel__hint">Connect a wallet to begin.</p>
        )}

        {status === "game_missing" && (
          <p className="bootstrap-panel__hint bootstrap-panel__hint--error">
            Game account is missing. Open admin and initialize Pixl first.
            <Link href="/admin" className="bootstrap-panel__retry">
              Admin
            </Link>
            <button
              type="button"
              className="bootstrap-panel__retry"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </p>
        )}

        {isLoadingStatus &&
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
            <div className="loading-card">
              <div className="loading-card__track">
                <div
                  className="loading-pixels"
                  role="progressbar"
                  aria-label={status.replace(/_/g, " ")}
                >
                  {LOADING_PIXELS.map((i) => (
                    <span
                      key={i}
                      className="loading-pixels__cell"
                      style={{ animationDelay: `${i * 85}ms` }}
                    />
                  ))}
                </div>
              </div>
              <span className="loading-inline__label">loading...</span>
            </div>
          ))}

        {status === "no_active_season" && <SeasonBrowser />}

        {status === "player_missing" &&
          program &&
          wallet.publicKey &&
          seasonAddress && (
            <TxButton
              label="Create Player"
              inlineFeedback={false}
              toastProgress
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
              inlineFeedback={false}
              toastProgress
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
            <div className="bootstrap-panel__session-step">
              <p className="bootstrap-panel__session-copy">
                Pixl uses a short-lived session key so painting can happen on
                the rollup without a wallet popup for every pixel.
              </p>
              <TxButton
                label={
                  status === "session_expired"
                    ? "Renew Session"
                    : "Enable Session"
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
            </div>
          )}
      </div>
    </section>
  );
}
