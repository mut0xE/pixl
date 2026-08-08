"use client";
import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { WalletControl } from "./WalletControl";

const PIXELS = [
  "#d96a3a",
  "#d7bc62",
  "#79c98f",
  "#6c8fe5",
  "#e7dfd2",
  "#8f5a3c",
];
const GRID = 16;

// Deterministic hash in [0,1) so server and client render the same grid.
function noise(x: number, y: number, seed: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 3.14) * 43758.5453;
  return v - Math.floor(v);
}

type Cell = {
  lit: boolean;
  color: string;
  color2: string;
  paintDelay: number;
  liveDelay: number;
};

function buildCanvas(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const h = noise(x, y, 1);
      const lit = h > 0.46;
      const color = PIXELS[Math.floor(noise(x, y, 7) * PIXELS.length)];
      // Second colour a lit cell gets "repainted" to during the live loop.
      const color2 = PIXELS[Math.floor(noise(x, y, 11) * PIXELS.length)];
      // Initial fill: diagonal wave, cells nearer the top-left paint first.
      const paintDelay = (x + y) * 45 + noise(x, y, 3) * 90;
      // Ongoing life: each pixel gets repainted once per cycle at its own
      // random point (2–11s), spread out so the board reads as sporadic live
      // player activity rather than a synchronised blink.
      const liveDelay = 2000 + noise(x, y, 5) * 9000;
      cells.push({ lit, color, color2, paintDelay, liveDelay });
    }
  }
  return cells;
}

function SelfPaintingCanvas() {
  const cells = useMemo(buildCanvas, []);
  return (
    <div className="landing-canvas" aria-hidden>
      <div className="landing-canvas__header">
        <span className="landing-canvas__label">Preview board</span>
        <span className="landing-canvas__mini-pixels">
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="landing-canvas__grid">
        {cells.map((c, i) => (
          <span
            key={i}
            className="landing-canvas__cell"
            data-lit={c.lit}
            style={{
              // Unlit cells stay as faint grid; lit ones paint in on paintDelay,
              // then repaint on their own liveDelay to mimic live players.
              ["--cell-color" as string]: c.color,
              ["--cell-color-2" as string]: c.color2,
              ["--paint-delay" as string]: `${c.paintDelay}ms`,
              ["--live-delay" as string]: `${c.liveDelay}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Landing CTA: connect a wallet, then an explicit Enter button (never auto-advance).
// The hint only appears before a wallet is connected — once connected it would
// contradict the "Enter the seasons" action, so it's dropped.
function EnterCta({ onEnter }: { onEnter: () => void }) {
  const { connected } = useWallet();
  if (!connected) {
    return (
      <>
        <WalletMultiButton />
        <span className="landing-hero__hint">
          Connect a wallet to enter the seasons.
        </span>
      </>
    );
  }
  return (
    <button className="landing-enter" type="button" onClick={onEnter}>
      Enter the seasons →
    </button>
  );
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="landing">
      <div className="landing__frame">
        <header className="landing__header">
          <span className="landing__wordmark">Pixl</span>
          <div className="landing__header-actions">
            <WalletControl />
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-hero__copy">
            <p
              className="landing-eyebrow reveal"
              style={{ animationDelay: "60ms" }}
            >
              Pixel canvas on Solana
            </p>
            <h1
              className="landing-hero__title reveal"
              style={{ animationDelay: "140ms" }}
            >
              Paint one pixel.
              <br />
              Leave a
              <br />
              <span className="landing-hero__mark">permanent</span> mark.
            </h1>
            <p
              className="landing-hero__sub reveal"
              style={{ animationDelay: "220ms" }}
            >
              Pixl is a shared on-chain canvas. Players paint pixel by pixel
              across timed seasons — and when a season ends, the artwork is
              settled to Solana forever.
            </p>
            <div
              className="landing-hero__cta reveal"
              style={{ animationDelay: "260ms" }}
            >
              <EnterCta onEnter={onEnter} />
            </div>
          </div>

          <div className="landing-hero__art reveal" style={{ animationDelay: "180ms" }}>
            <SelfPaintingCanvas />
          </div>
        </section>

        <footer className="landing__footer">
          <span className="landing__footer-pill">Pixl</span>
          <span className="landing__footer-tagline">
            Built on MagicBlock ephemeral rollups · Solana devnet
          </span>
        </footer>
      </div>
    </main>
  );
}
