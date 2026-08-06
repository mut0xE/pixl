"use client";
import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildCreateSeasonWithDelegationTx,
  hexToU32,
  u32ToHex,
} from "../../../../packages/sdk";
import { usePixlProgram } from "../../lib/program";
import { sendIx } from "../../lib/actions";
import { TxButton } from "../TxButton";

const DEFAULT_PALETTE = [
  "#0b0d12",
  "#eae6da",
  "#ff5f2e",
  "#6fd28a",
  "#f2c14e",
  "#3a86ff",
];

// Local datetime-local string (no tz suffix) → unix seconds.
function toUnix(local: string): number {
  return Math.floor(new Date(local).getTime() / 1000);
}

function nowLocal(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setSeconds(0, 0);
  // strip the timezone by formatting to the `datetime-local` shape.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function CreateSeasonForm({
  game,
  onCreated,
}: {
  game: PublicKey;
  onCreated?: () => void;
}) {
  const program = usePixlProgram();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [seasonId, setSeasonId] = useState<number>(
    () => Math.floor(Date.now() / 1000) % 1_000_000
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);
  const [startTime, setStartTime] = useState(() => nowLocal(1));
  const [endTime, setEndTime] = useState(() => nowLocal(60 * 24));
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [newColor, setNewColor] = useState("#ffffff");

  const paletteU32 = useMemo(() => {
    try {
      return palette.map((h) => hexToU32(h));
    } catch {
      return null;
    }
  }, [palette]);

  const capacity = width * height;
  const overCap = capacity > 10_193;
  const badTimes = toUnix(endTime) <= toUnix(startTime);
  const disabled =
    !program ||
    !title.trim() ||
    !paletteU32 ||
    paletteU32.length === 0 ||
    overCap ||
    badTimes;

  async function run(setState: (s: any) => void): Promise<string> {
    if (!program) throw new Error("Connect the authority wallet");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    if (!title.trim()) throw new Error("Title is required");
    if (!paletteU32 || paletteU32.length === 0)
      throw new Error("Add at least one valid palette color");
    if (overCap)
      throw new Error("Canvas exceeds the 10,193 px single-tx creation limit");
    if (badTimes) throw new Error("End time must be after the start time");

    const { instructions, canvas } = await buildCreateSeasonWithDelegationTx(
      connection,
      program,
      {
        authority: wallet.publicKey,
        game,
        args: {
          seasonId,
          title: title.trim(),
          description: description.trim(),
          palette: paletteU32,
          imageUri: imageUri.trim(),
          canvasWidth: width,
          canvasHeight: height,
          startTime: new BN(toUnix(startTime)),
          endTime: new BN(toUnix(endTime)),
        },
      }
    );
    setState("awaiting_signature");
    // The ephemeral canvas keypair co-signs in-memory, then is discarded.
    return sendIx(connection, wallet, instructions, [canvas]);
  }

  return (
    <section className="admin-card">
      <h3 className="admin-card__heading">CREATE SEASON</h3>
      <p className="admin-card__note">
        Initializes Season + Canvas + SeasonStats and delegates the canvas and
        stats to the Ephemeral Rollup — one transaction.
      </p>

      <div className="admin-grid">
        <label className="admin-field">
          <span>Season ID</span>
          <input
            type="number"
            value={seasonId}
            onChange={(e) => setSeasonId(Number(e.target.value))}
          />
        </label>
        <label className="admin-field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Blueprint URI</span>
          <input
            value={imageUri}
            onChange={(e) => setImageUri(e.target.value)}
            placeholder="ipfs://… or https://…"
          />
        </label>
        <label className="admin-field">
          <span>Canvas width</span>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <label className="admin-field">
          <span>Canvas height</span>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        <label className="admin-field">
          <span>Start</span>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>End</span>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>

      <div className="admin-palette">
        <span className="admin-field__label">
          Palette ({palette.length}) — {capacity.toLocaleString()} px
        </span>
        <div className="admin-palette__row">
          {palette.map((hex, i) => (
            <span key={i} className="admin-swatch" title={hex}>
              <span
                className="admin-swatch__chip"
                style={{ background: u32ToHex(hexToU32(hex)).slice(0, 7) }}
              />
              <button
                className="admin-swatch__x"
                onClick={() => setPalette(palette.filter((_, j) => j !== i))}
                aria-label={`remove ${hex}`}
              >
                ×
              </button>
            </span>
          ))}
          <span className="admin-swatch admin-swatch--add">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
            />
            <button
              className="canvas-btn"
              onClick={() => setPalette([...palette, newColor])}
            >
              + ADD
            </button>
          </span>
        </div>
      </div>

      {overCap && (
        <p className="admin-warn">
          {capacity.toLocaleString()} px exceeds the 10,193 px
          single-transaction limit for client-side canvas creation. Reduce the
          size.
        </p>
      )}
      {badTimes && (
        <p className="admin-warn">End time must be after the start time.</p>
      )}

      <TxButton
        key={disabled ? "disabled" : "ready"}
        label={disabled ? "Complete the form" : "Create & delegate season"}
        onRun={run}
        onDone={onCreated}
      />
    </section>
  );
}
