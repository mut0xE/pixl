"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LandingPage } from "./LandingPage";
import { BootstrapPanel } from "./BootstrapPanel";

const ENTERED_KEY = "pixl.entered";

// The home route opens on the landing page until an explicit "enter" action
// (since autoConnect makes a returning player `connected` on first paint). The
// choice is persisted in sessionStorage so a refresh keeps the player in place.
export function HomeView() {
  // `null` = undecided (server render + first client paint, to avoid a hydration
  // mismatch); resolved from sessionStorage in the effect below.
  const [entered, setEntered] = useState<boolean | null>(null);
  useEffect(() => {
    // A shared game link (`?join=1` or legacy `?season=<address>`) is an
    // invitation to play, so skip the landing page and enter the bootstrap flow.
    const params = new URLSearchParams(window.location.search);
    const invited = params.has("join") || params.has("season");
    setEntered(invited || window.sessionStorage.getItem(ENTERED_KEY) === "1");
  }, []);
  const enter = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(ENTERED_KEY, "1");
    }
    setEntered(true);
  };

  // Disconnecting the wallet is a "leaving" gesture, so return to the landing
  // hero rather than stranding the player on the bare disconnected panel. Only
  // fires on a genuine connected → disconnected transition, so an invited player
  // who never connected isn't bounced away from the join flow.
  const { connected } = useWallet();
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected) {
      wasConnected.current = true;
    } else if (wasConnected.current) {
      wasConnected.current = false;
      window.sessionStorage.removeItem(ENTERED_KEY);
      setEntered(false);
    }
  }, [connected]);
  if (entered === null) return <main className="app-boot" aria-busy />;
  if (!entered) return <LandingPage onEnter={enter} />;
  return (
    <main>
      <BootstrapPanel />
    </main>
  );
}
