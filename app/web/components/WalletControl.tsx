"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useToast } from "./Toast";

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// Wallet chip with an explicit copy-address / disconnect menu once connected;
// defers to the adapter's connect button + modal while disconnected.
export function WalletControl() {
  const { publicKey, connected, disconnect } = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismiss the menu on any outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!connected || !publicKey) return <WalletMultiButton />;

  const address = publicKey.toBase58();

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Copied", "Wallet address");
    } catch {
      toast.error("Copy failed", "Clipboard is unavailable in this context");
    }
    setOpen(false);
  }

  async function onDisconnect() {
    setOpen(false);
    try {
      await disconnect();
      toast.success("Disconnected", "Wallet disconnected");
    } catch {
      toast.error("Disconnect failed", "Could not disconnect the wallet");
    }
  }

  return (
    <div className="wallet-control" ref={rootRef}>
      <button
        type="button"
        className="wallet-control__chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={address}
      >
        <span className="wallet-control__dot" aria-hidden />
        <code>{shortKey(address)}</code>
        <span className="wallet-control__caret" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="wallet-control__menu" role="menu">
          <button
            type="button"
            className="wallet-control__item"
            role="menuitem"
            onClick={copy}
          >
            Copy address
          </button>
          <button
            type="button"
            className="wallet-control__item wallet-control__item--danger"
            role="menuitem"
            onClick={onDisconnect}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
