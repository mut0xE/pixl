"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Keypair } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAdmin } from "../lib/useAdmin";
import { WalletControl } from "./WalletControl";
import { HomeButton } from "./HomeButton";
import { deriveSessionKeypair } from "../../../packages/sdk";
import { usePixlProgram } from "../lib/program";
import { useBootstrap } from "../lib/useBootstrap";
import { setUpSession, joinActiveSeason, createPlayer } from "../lib/actions";
import { saveSessionMeta, nextSessionNonce } from "../lib/session-store";
import { TxButton } from "./TxButton";
import { PixlCanvas } from "./PixlCanvas";
import { SeasonBrowser } from "./SeasonBrowser";

export function BootstrapPanel() {
  const { status, refetch, seasonAddress, session, setSession } =
    useBootstrap();
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { isAuthority } = useAdmin();
  // The seasons roster is offered only once the player is fully bootstrapped:
  // wallet connected, Player created, and its season profile created +
  // delegated. Those are exactly the statuses that come after Join Season —
  // the session/ready states — so the profile is known to exist by then.
  const seasonsUnlocked =
    status === "session_missing" ||
    status === "session_expired" ||
    status === "ready";
  // Session secret lives in memory only for this render tree — never persisted,
  // never logged. Only its public metadata (incl. nonce) goes to localStorage.
  const sessionSecretRef = useRef<Keypair | null>(null);

  // Re-derive the in-memory secret from the persisted session on load, so a
  // "ready" session (from localStorage) always has a usable signer after a
  // page reload. Derivation is deterministic from wallet pubkey + nonce.
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

  return (
    <section className="bootstrap-panel" data-status={status}>
      <header
        className="bootstrap-panel__header reveal"
        style={{ animationDelay: "40ms" }}
      >
        <h1>Pixl</h1>
        <div className="bootstrap-panel__nav">
          <HomeButton />
          {seasonsUnlocked && (
            <Link href="/seasons" className="header-link">
              SEASONS
            </Link>
          )}
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
          status === "loading_profile") && (
          <p className="bootstrap-panel__hint">
            <span className="spinner" aria-hidden /> Loading…
          </p>
        )}

        {status === "no_active_season" && <SeasonBrowser />}

        {status === "player_missing" &&
          program &&
          wallet.publicKey &&
          seasonAddress && (
            <TxButton
              label="Create Player"
              onRun={async (setState) => {
                setState("building");
                // Create the Player PDA on L1 only — no delegation yet. It is
                // delegated later in the Join Season step (same tx as
                // init_season_profile, which needs a program-owned Player).
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

        {status === "ready" && (
          <PixlCanvas
            seasonAddress={seasonAddress}
            wallet={wallet.publicKey ?? null}
            session={session}
            sessionSecret={sessionSecretRef.current}
            shareable
          />
        )}
      </div>
    </section>
  );
}
