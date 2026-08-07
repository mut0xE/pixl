"use client";
import { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { WalletControl } from "./WalletControl";

const PIXELS = ["#ff5f2e", "#f2c14e", "#6fd28a", "#4a90d9", "#eae6da", "#9c3c1e"];
const GRID = 16;

// Deterministic hash in [0,1) so server and client render the same grid.
function noise(x: number, y: number, seed: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 3.14) * 43758.5453;
  return v - Math.floor(v);
}

type Cell = { lit: boolean; color: string; delay: number };

function buildCanvas(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const h = noise(x, y, 1);
      const lit = h > 0.46;
      const color = PIXELS[Math.floor(noise(x, y, 7) * PIXELS.length)];
      // Diagonal wave: cells nearer the top-left paint first.
      const delay = (x + y) * 24 + noise(x, y, 3) * 120;
      cells.push({ lit, color, delay });
    }
  }
  return cells;
}

function SelfPaintingCanvas() {
  const cells = useMemo(buildCanvas, []);
  return (
    <div className="landing-canvas" aria-hidden>
      <div className="landing-canvas__grid">
        {cells.map((c, i) => (
          <span
            key={i}
            className="landing-canvas__cell"
            data-lit={c.lit}
            style={{
              // Unlit cells stay as faint grid; lit ones fade up on their delay.
              ["--cell-color" as string]: c.color,
              animationDelay: `${c.delay}ms`,
            }}
          />
        ))}
      </div>
      <span className="landing-canvas__tag">season · live</span>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: "Link a Solana wallet. That's your identity on the canvas.",
  },
  {
    n: "02",
    title: "Join a season",
    body: "Pick an ongoing season and join. A one-time setup delegates your player to the rollup.",
  },
  {
    n: "03",
    title: "Paint",
    body: "Choose a color and click. Pixels land instantly — no wallet popup per stroke.",
  },
];

const WHAT = [
  {
    title: "One shared canvas",
    body: "Thousands of pixels, one grid. What you paint sits next to everyone else's, permanently.",
  },
  {
    title: "Seasons, not forever",
    body: "Each season opens, fills, and closes. Ongoing seasons are live to paint; ended ones are sealed on-chain.",
  },
  {
    title: "Every pixel counts",
    body: "Your strokes are tracked. A per-season leaderboard ranks the canvas's biggest contributors.",
  },
];

const TECH = [
  {
    k: "Ephemeral Rollups",
    body: "Painting runs on a MagicBlock rollup: instant, near-zero-fee pixels that settle back to Solana.",
  },
  {
    k: "Session keys",
    body: "A short-lived session signer lets you paint continuously without signing every single pixel.",
  },
  {
    k: "On-chain permanence",
    body: "When a season closes, its canvas and leaderboard become final state on Solana devnet.",
  },
];

// Reveal-on-scroll: adds .is-visible once an element enters the viewport.
// Reduced-motion users get everything visible from the start (CSS default).
function useScrollReveal() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll("[data-reveal]");
    if (!els?.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return root;
}

// Landing CTA: connect a wallet, then an explicit Enter button (never auto-advance).
function EnterCta({ onEnter }: { onEnter: () => void }) {
  const { connected } = useWallet();
  if (!connected) return <WalletMultiButton />;
  return (
    <button className="landing-enter" type="button" onClick={onEnter}>
      Enter the seasons →
    </button>
  );
}

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const root = useScrollReveal();
  return (
    <main className="landing" ref={root}>
      <header className="landing__header">
        <span className="landing__wordmark">Pixl</span>
        <div className="landing__header-actions">
          <a className="landing__nav-link" href="#how">
            How it works
          </a>
          <WalletControl />
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow reveal" style={{ animationDelay: "60ms" }}>
            A collaborative pixel canvas on Solana
          </p>
          <h1
            className="landing-hero__title reveal"
            style={{ animationDelay: "140ms" }}
          >
            Paint one pixel.
            <br />
            Leave a <span className="landing-hero__mark">permanent</span> mark.
          </h1>
          <p
            className="landing-hero__sub reveal"
            style={{ animationDelay: "220ms" }}
          >
            Pixl is a shared on-chain canvas. Players paint pixel by pixel across
            timed seasons — and when a season ends, the artwork is settled to
            Solana forever.
          </p>
          <div
            className="landing-hero__cta reveal"
            style={{ animationDelay: "300ms" }}
          >
            <EnterCta onEnter={onEnter} />
            <span className="landing-hero__hint">
              Connect a wallet to enter the seasons.
            </span>
          </div>
        </div>
        <div className="reveal" style={{ animationDelay: "180ms" }}>
          <SelfPaintingCanvas />
        </div>
      </section>

      <section className="landing-section">
        <h2 className="landing-section__eyebrow" data-reveal>
          What is Pixl
        </h2>
        <div className="landing-what">
          {WHAT.map((w, i) => (
            <article
              key={w.title}
              className="landing-what__card"
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="how">
        <h2 className="landing-section__eyebrow" data-reveal>
          How it works
        </h2>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="landing-step"
              data-reveal
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <span className="landing-step__n">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2 className="landing-section__eyebrow" data-reveal>
          Powered by MagicBlock
        </h2>
        <div className="landing-tech">
          {TECH.map((t, i) => (
            <article
              key={t.k}
              className="landing-tech__row"
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="landing-tech__k">{t.k}</span>
              <p>{t.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-outro" data-reveal>
        <h2>Ready to paint?</h2>
        <p>Connect your wallet and pick an ongoing season.</p>
        <EnterCta onEnter={onEnter} />
      </section>

      <footer className="landing__footer">
        <span>Pixl</span>
        <span>Built on MagicBlock ephemeral rollups · Solana devnet</span>
      </footer>
    </main>
  );
}
