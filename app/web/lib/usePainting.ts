"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Idl, Program } from "@coral-xyz/anchor";
import {
  canPaint,
  decodeCanvas,
  derivePlayerPda,
  estimateAvailableEnergy,
  paintWithSession,
  parsePixlEvents,
  PAINT_BLOCK_MESSAGES,
  type PlayerEnergy,
  type SessionMeta,
} from "../../../packages/sdk";
import pixlIdl from "../../../target/idl/pixl.json";
import { getErConnection } from "./er";
import { useToast } from "../components/Toast";
import type { CanvasData } from "./useCanvasData";

// Live painting orchestration: authoritative pixels synced from an ER canvas
// subscription, an optimistic overlay of pending paints, a `dirty` set of
// indices to repaint, and live energy from an ER player subscription.
type Pending = { color: number; prevColor: number };

export type PaintTxStatus = "pending" | "confirmed" | "failed";

/** One entry in the "recent paints" feed the canvas renders. */
export type PaintTx = {
  id: number;
  x: number;
  y: number;
  colorIndex: number;
  status: PaintTxStatus;
  signature?: string;
  error?: string;
  at: number;
  /** Base58 wallet that painted this pixel (from the on-chain event). */
  painter?: string;
  /** True when this local wallet is the painter. */
  mine: boolean;
};

const MAX_RECENT_TX = 12;

export type PaintArgs = {
  erProgram: Program<any> | null;
  data: CanvasData | null;
  wallet: PublicKey | null;
  seasonAddress: PublicKey | null;
  session: SessionMeta | null;
};

export function usePainting({
  erProgram,
  data,
  wallet,
  seasonAddress,
  session,
}: PaintArgs) {
  const [selectedColor, setSelectedColor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every visible change so the renderer drains `dirty` and patches.
  const [revision, setRevision] = useState(0);
  const [energy, setEnergy] = useState<PlayerEnergy | null>(null);
  const [recentTxs, setRecentTxs] = useState<PaintTx[]>([]);
  const toast = useToast();
  const txSeq = useRef(0);

  const updateTx = useCallback((id: number, patch: Partial<PaintTx>) => {
    setRecentTxs((list) =>
      list.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx))
    );
  }, []);

  const authoritativeRef = useRef<number[]>([]);
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const dirtyRef = useRef<Set<number>>(new Set());

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  // Reset authoritative state whenever a fresh snapshot loads.
  useEffect(() => {
    authoritativeRef.current = data ? [...data.pixels] : [];
    pendingRef.current.clear();
    dirtyRef.current.clear();
    setError(null);
    // Full repaint is handled by the renderer keying off `data`; no dirty marks.
  }, [data]);

  const colorAt = useCallback((index: number): number => {
    const pending = pendingRef.current.get(index);
    if (pending) return pending.color;
    return authoritativeRef.current[index] ?? 0;
  }, []);

  /** Renderer calls this once per revision to get the pixels needing a patch. */
  const drainDirty = useCallback((): number[] => {
    const out = [...dirtyRef.current];
    dirtyRef.current.clear();
    return out;
  }, []);

  // Subscribe to authoritative canvas updates on the ER.
  useEffect(() => {
    if (!data) return;
    const conn = getErConnection();
    const id = conn.onAccountChange(
      data.canvasAddress,
      (info) => {
        let next: number[];
        try {
          next = decodeCanvas(info.data).pixels;
        } catch {
          return;
        }
        const auth = authoritativeRef.current;
        for (let i = 0; i < next.length; i++) {
          if (next[i] === auth[i]) continue;
          auth[i] = next[i];
          const pending = pendingRef.current.get(i);
          if (pending) {
            // Confirmed: authoritative caught up to our optimistic color.
            if (pending.color === next[i]) pendingRef.current.delete(i);
            else pending.prevColor = next[i];
            // Overlay still shown (or now equal) — no repaint needed here.
          } else {
            dirtyRef.current.add(i); // someone else's paint became visible
          }
        }
        bump();
      },
      "confirmed"
    );
    return () => {
      void conn.removeAccountChangeListener(id);
    };
  }, [data?.canvasAddress.toBase58(), bump]);

  // Subscribe to the delegated Player on the ER for live energy.
  useEffect(() => {
    if (!erProgram || !wallet) {
      setEnergy(null);
      return;
    }
    const conn = getErConnection();
    const [playerPda] = derivePlayerPda(erProgram.programId, wallet);
    let stale = false;
    const read = (p: any) =>
      setEnergy({
        availableEnergy: p.availableEnergy,
        maxEnergy: p.maxEnergy,
        energyCooldownSeconds: p.energyCooldownSeconds,
        lastEnergyRefresh: Number(p.lastEnergyRefresh),
      });
    (erProgram.account as any).player
      .fetch(playerPda)
      .then((p: any) => {
        if (!stale) read(p);
      })
      .catch(() => {});
    const id = conn.onAccountChange(
      playerPda,
      (info) => {
        try {
          read(erProgram.coder.accounts.decode("player", info.data));
        } catch {
          /* ignore decode races */
        }
      },
      "confirmed"
    );
    return () => {
      stale = true;
      void conn.removeAccountChangeListener(id);
    };
  }, [erProgram, wallet?.toBase58()]);

  // Global paint feed: to show who painted each pixel (with an Explorer link) we
  // poll `getSignaturesForAddress(canvas)` on the ER — its `logsSubscribe`
  // doesn't reliably deliver — then decode each new tx's `PixelPainted` event.
  useEffect(() => {
    if (!erProgram || !seasonAddress || !data) return;
    const conn = getErConnection();
    const canvas = data.canvasAddress;
    const seasonB58 = seasonAddress.toBase58();
    // The PixelPainted event's `player` is the Player PDA, not the wallet, so we
    // match against the derived PDA to flag our own paints.
    const mineB58 = wallet
      ? derivePlayerPda(erProgram.programId, wallet)[0].toBase58()
      : null;
    const seen = new Set<string>();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const addPaint = (
      signature: string,
      d: { x: number; y: number; newColorIndex: number; player: PublicKey }
    ) => {
      const painter = d.player.toBase58();
      const mine = painter === mineB58;
      setRecentTxs((list) => {
        // Dedupe: this signature may already be attached to a local entry.
        if (list.some((tx) => tx.signature === signature)) return list;
        // Reconcile with my own optimistic entry at this pixel, if any.
        if (mine) {
          const pendingIdx = list.findIndex(
            (tx) =>
              tx.mine &&
              tx.status === "pending" &&
              !tx.signature &&
              tx.x === d.x &&
              tx.y === d.y
          );
          if (pendingIdx !== -1) {
            const next = [...list];
            next[pendingIdx] = {
              ...next[pendingIdx],
              status: "confirmed",
              signature,
              painter,
            };
            return next;
          }
        }
        return [
          {
            id: ++txSeq.current,
            x: d.x,
            y: d.y,
            colorIndex: d.newColorIndex,
            status: "confirmed" as const,
            signature,
            at: Date.now(),
            painter,
            mine,
          },
          ...list,
        ].slice(0, MAX_RECENT_TX);
      });
    };

    const poll = async () => {
      try {
        const sigs = await conn.getSignaturesForAddress(canvas, { limit: 20 });
        // Newest-first from RPC; process oldest-first so prepends end up ordered.
        const fresh = sigs.filter((s) => !s.err && !seen.has(s.signature));
        for (const s of fresh) seen.add(s.signature);
        for (const s of [...fresh].reverse()) {
          const tx = await conn.getTransaction(s.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          const logs = tx?.meta?.logMessages;
          if (!logs) continue;
          let events: ReturnType<typeof parsePixlEvents> = [];
          try {
            // Parse with the raw IDL: anchor's Program camelCases event names,
            // which would make the PascalCase `PixelPainted` filter below miss.
            events = parsePixlEvents(pixlIdl as Idl, erProgram.programId, logs);
          } catch {
            continue;
          }
          for (const ev of events) {
            if (ev.name !== "PixelPainted") continue;
            if (ev.data.season.toBase58() !== seasonB58) continue;
            addPaint(s.signature, ev.data);
          }
        }
      } catch {
        // Transient RPC error — keep polling.
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    erProgram,
    seasonAddress?.toBase58(),
    wallet?.toBase58(),
    data?.canvasAddress.toBase58(),
  ]);

  const paint = useCallback(
    async (x: number, y: number) => {
      setError(null);
      if (!erProgram || !data || !wallet || !seasonAddress || !session) {
        setError("Painting unavailable — connect and set up a session.");
        return;
      }
      if (!energy) {
        setError("Energy not loaded yet.");
        return;
      }
      const check = canPaint({
        season: data.season,
        canvas: {
          width: data.width,
          height: data.height,
          frozen: data.frozen,
          pixels: authoritativeRef.current,
        },
        paletteLength: data.palette.length,
        player: energy,
        x,
        y,
        colorIndex: selectedColor,
        now: Math.floor(Date.now() / 1000),
      });
      if (!check.ok) {
        setError(PAINT_BLOCK_MESSAGES[check.reason]);
        return;
      }

      const index = check.index;
      const prevColor = authoritativeRef.current[index] ?? 0;
      // Optimistic overlay — safe because canPaint mirrored every on-chain rule.
      pendingRef.current.set(index, { color: selectedColor, prevColor });
      dirtyRef.current.add(index);
      bump();

      const txId = ++txSeq.current;
      const color = selectedColor;
      setRecentTxs((list) =>
        [
          {
            id: txId,
            x,
            y,
            colorIndex: color,
            status: "pending" as const,
            at: Date.now(),
            painter: wallet.toBase58(),
            mine: true,
          },
          ...list,
        ].slice(0, MAX_RECENT_TX)
      );

      try {
        const signature = await paintWithSession(
          erProgram,
          {
            wallet,
            season: seasonAddress,
            canvas: data.canvasAddress,
            sessionToken: new PublicKey(session.sessionToken),
          },
          x,
          y,
          color
        );
        // Authoritative confirmation drops the overlay via the canvas subscription.
        updateTx(txId, { status: "confirmed", signature });
        toast.success("Pixel painted", `x${x} y${y} · confirmed on the ER`);
      } catch (e) {
        // Revert: restore the previous pixel and surface the failure.
        pendingRef.current.delete(index);
        dirtyRef.current.add(index);
        bump();
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        updateTx(txId, { status: "failed", error: message });
        toast.error("Paint failed", `x${x} y${y} · ${message}`);
      }
    },
    [
      erProgram,
      data,
      wallet,
      seasonAddress,
      session,
      energy,
      selectedColor,
      bump,
      updateTx,
      toast,
    ]
  );

  const displayEnergy = energy
    ? estimateAvailableEnergy(energy, Math.floor(Date.now() / 1000))
    : null;

  // Tick so live regen shows without waiting for the next paint/subscription.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!energy) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [energy]);

  return {
    selectedColor,
    setSelectedColor,
    paint,
    error,
    revision,
    drainDirty,
    colorAt,
    energy: displayEnergy,
    maxEnergy: energy?.maxEnergy ?? null,
    // Raw ER Player energy state (null until the delegated account loads). The
    // HUD needs the cooldown + last-refresh fields to project the countdown.
    energyState: energy,
    recentTxs,
  };
}
