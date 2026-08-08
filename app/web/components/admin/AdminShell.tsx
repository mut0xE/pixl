"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useAdmin } from "../../lib/useAdmin";
import { WalletControl } from "../WalletControl";
import { HomeButton } from "../HomeButton";
import { InitGamePanel } from "./InitGamePanel";

type BackLink = { href: string; label: string };

export type AdminContext = { game: PublicKey; authority: PublicKey };

// Chrome + access gate shared by every admin route; only hands `children` a
// verified {game, authority} once the connected wallet is the authority.
export function AdminShell({
  title,
  back,
  children,
}: {
  title: string;
  back: BackLink;
  children: (ctx: AdminContext) => ReactNode;
}) {
  const { connected } = useWallet();
  const { game, authority, isAuthority, gameMissing, loading, error, refetch } =
    useAdmin();

  let body: ReactNode;
  if (!connected) {
    body = (
      <Gate
        heading="Authority required"
        note="Connect the game authority wallet to manage seasons."
      />
    );
  } else if (loading && !authority && !gameMissing) {
    body = <SkeletonCard />;
  } else if (gameMissing && game) {
    body = <InitGamePanel game={game} onDone={refetch} />;
  } else if (error) {
    body = <Gate heading="Couldn’t load game" note={error} tone="err" />;
  } else if (!isAuthority || !game) {
    body = (
      <Gate
        heading="Access denied"
        note="This wallet is not the game authority."
        tone="err"
      />
    );
  } else {
    body = children({ game, authority: authority as PublicKey });
  }

  return (
    <div className="admin-console">
      <header className="admin-console__bar">
        <h1 className="admin-console__title">{title}</h1>
        <div className="admin-console__who">
          <nav className="admin-console__nav">
            <HomeButton />
            <Link href={back.href} className="header-link">
              {back.label}
            </Link>
          </nav>
          <div className="admin-console__id">
            {isAuthority && <span className="admin-badge">AUTHORITY ✓</span>}
            <WalletControl />
          </div>
        </div>
      </header>
      {body}
    </div>
  );
}

function Gate({
  heading,
  note,
  tone = "dim",
}: {
  heading: string;
  note: string;
  tone?: "dim" | "err";
}) {
  return (
    <section className="admin-card admin-gate">
      <h3 className="admin-card__heading">{heading}</h3>
      <p className={tone === "err" ? "admin-warn" : "admin-card__note"}>
        {note}
      </p>
    </section>
  );
}

function SkeletonCard() {
  return (
    <section className="admin-card" aria-busy>
      <span className="skeleton skeleton--line" style={{ width: "40%" }} />
      <span className="skeleton skeleton--line" style={{ width: "70%" }} />
      <span className="skeleton skeleton--block" />
    </section>
  );
}
