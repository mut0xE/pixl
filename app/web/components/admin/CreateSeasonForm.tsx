"use client";
import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  buildCreateSeasonPlan,
  canvasAccountSpace,
  hexToU32,
  u32ToHex,
} from "../../../../packages/sdk";
import {
  MAX_CANVAS_PIXELS,
  MAX_DESCRIPTION_LENGTH,
  MAX_PALETTE_COLORS,
  MAX_REFERENCE_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../../../packages/shared";
import { usePixlProgram } from "../../lib/program";
import { sendIx } from "../../lib/actions";
import { TxButton } from "../TxButton";
import { DateTimeField } from "./DateTimeField";

const DEFAULT_PALETTE = [
  "#ffffff",
  "#e4e4e4",
  "#888888",
  "#555555",
  "#222222",
  "#000000",
  "#ffa7d1",
  "#fd4659",
  "#e50000",
  "#800000",
  "#ffddca",
  "#f6b389",
  "#e59500",
  "#ff5b00",
  "#a06a42",
  "#604028",
  "#ffff00",
  "#94e044",
  "#02be01",
  "#005f00",
  "#43ebc2",
  "#00d3dd",
  "#0083c7",
  "#0000ea",
  "#030764",
  "#cf6ee4",
  "#ff00ff",
  "#820080",
  "#b9c3cf",
  "#777f8c",
  "#424651",
  "#1f1e26",
  "#382215",
  "#7c3f20",
  "#c06f37",
  "#fead6c",
  "#ffd2b1",
  "#ffa4d0",
  "#f14fb4",
  "#e973ff",
  "#a630d2",
  "#531d8c",
  "#242367",
  "#0334bf",
  "#149cff",
  "#8df5ff",
  "#01bfa5",
  "#16777e",
  "#054523",
  "#18862f",
  "#61e021",
  "#b1ff37",
  "#ffffa5",
  "#fde111",
  "#ff9f17",
  "#f66e08",
  "#550022",
  "#99011a",
  "#f30f0c",
  "#ff7872",
];

// Random u32 season id so a fresh season never collides with a past PDA.
function randomSeasonId(): number {
  return Math.floor(Math.random() * 0xffffffff) + 1;
}

// Accepts "#rgb", "#rrggbb", or the same without the leading "#".
function normalizeHex(raw: string): string | null {
  const v = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return (
      "#" +
      v
        .split("")
        .map((c) => c + c)
        .join("")
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(v)) return "#" + v.toLowerCase();
  return null;
}

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

  const [seasonId, setSeasonId] = useState<number>(randomSeasonId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(64);
  const [startTime, setStartTime] = useState(() => nowLocal(1));
  const [endTime, setEndTime] = useState(() => nowLocal(60 * 24));
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [newColor, setNewColor] = useState("#ffffff");
  const [hexInput, setHexInput] = useState("");

  const hexInputNorm = normalizeHex(hexInput);
  const hexInputInvalid = hexInput.trim().length > 0 && !hexInputNorm;

  function addColor(hex: string) {
    setPalette((p) => [...p, hex]);
  }

  const paletteU32 = useMemo(() => {
    try {
      return palette.map((h) => hexToU32(h));
    } catch {
      return null;
    }
  }, [palette]);

  // Hold the admin UI to a 512×512 ceiling (well under the 10 MiB account cap).
  const MAX_DIM = 512;
  const capacity = width * height;
  const badDims =
    width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM;
  const overCap = capacity > MAX_CANVAS_PIXELS;
  const badTimes = toUnix(endTime) <= toUnix(startTime);

  // Surface the rent cost so a large (e.g. 512², ~1.8 SOL) canvas isn't a surprise.
  const [rentSol, setRentSol] = useState<number | null>(null);
  useEffect(() => {
    if (badDims) {
      setRentSol(null);
      return;
    }
    let cancelled = false;
    const space = canvasAccountSpace(width, height);
    connection
      .getMinimumBalanceForRentExemption(space)
      .then((lamports) => {
        if (!cancelled) setRentSol(lamports / 1e9);
      })
      .catch(() => {
        if (!cancelled) setRentSol(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, width, height, badDims]);

  // Blueprint reference is required on-chain and capped at MAX_REFERENCE_LENGTH.
  const trimmedImage = imageUri.trim();
  const imageMissing = trimmedImage.length === 0;
  const imageTooLong = trimmedImage.length > MAX_REFERENCE_LENGTH;
  const imageBadScheme =
    trimmedImage.length > 0 && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedImage);

  // First blocking problem, in field order.
  const validationError: string | null = !program
    ? "Connect the authority wallet"
    : !title.trim()
    ? "Title is required"
    : title.trim().length > MAX_TITLE_LENGTH
    ? `Title must be ${MAX_TITLE_LENGTH} characters or fewer`
    : description.trim().length > MAX_DESCRIPTION_LENGTH
    ? `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`
    : imageMissing
    ? "Blueprint URI is required (e.g. ipfs://… or https://…)"
    : imageBadScheme
    ? "Blueprint URI must include a scheme, e.g. ipfs:// or https://"
    : imageTooLong
    ? `Blueprint URI must be ${MAX_REFERENCE_LENGTH} characters or fewer`
    : !paletteU32 || paletteU32.length === 0
    ? "Add at least one valid palette color"
    : paletteU32.length > MAX_PALETTE_COLORS
    ? `Palette is limited to ${MAX_PALETTE_COLORS} colors`
    : badDims
    ? `Canvas dimensions must be between 1 and ${MAX_DIM}`
    : overCap
    ? `Canvas exceeds the ${MAX_CANVAS_PIXELS.toLocaleString()} px limit`
    : badTimes
    ? "End time must be after the start time"
    : null;

  const disabled = validationError !== null;

  // Reset the form to a pristine state after a season is created.
  function resetForm() {
    setSeasonId(randomSeasonId());
    setTitle("");
    setDescription("");
    setImageUri("");
    setWidth(64);
    setHeight(64);
    setStartTime(nowLocal(1));
    setEndTime(nowLocal(60 * 24));
    setPalette(DEFAULT_PALETTE);
    setNewColor("#ffffff");
    setHexInput("");
  }

  async function run(setState: (s: any) => void): Promise<string> {
    if (validationError) throw new Error(validationError);
    if (!program) throw new Error("Connect the authority wallet");
    if (!wallet.publicKey) throw new Error("Wallet not connected");
    if (!paletteU32) throw new Error("Add at least one valid palette color");

    const { steps } = await buildCreateSeasonPlan(connection, program, {
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
    });

    // Send each step in order (large canvases split into allocate + start/delegate);
    // returns the final signature for the Explorer link.
    let sig = "";
    for (const step of steps) {
      setState("awaiting_signature");
      sig = await sendIx(connection, wallet, step.instructions, step.signers);
    }
    return sig;
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
          <span>Season ID (random)</span>
          <div className="admin-field__inline">
            <input type="number" value={seasonId} readOnly tabIndex={-1} />
            <button
              type="button"
              className="canvas-btn"
              onClick={() => setSeasonId(randomSeasonId())}
              title="Generate a new random season ID"
            >
              ↻
            </button>
          </div>
        </label>
        <label className="admin-field">
          <span>
            Title <em className="admin-field__req">*required</em>
          </span>
          <input
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="admin-field admin-field--wide">
          <span>Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="admin-field admin-field--wide">
          <span>
            Blueprint URI <em className="admin-field__req">*required</em>
          </span>
          <input
            value={imageUri}
            maxLength={MAX_REFERENCE_LENGTH}
            className={
              imageBadScheme || imageTooLong ? "admin-input--error" : undefined
            }
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
          <span className="admin-field__lbl">
            <ClockIcon /> Start
          </span>
          <DateTimeField value={startTime} onChange={setStartTime} />
        </label>
        <label className="admin-field">
          <span className="admin-field__lbl">
            <ClockIcon /> End
          </span>
          <DateTimeField value={endTime} onChange={setEndTime} />
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
            <button className="canvas-btn" onClick={() => addColor(newColor)}>
              + ADD
            </button>
          </span>
        </div>

        <div className="admin-palette__hex">
          <span
            className="admin-palette__hex-preview"
            style={{ background: hexInputNorm ?? "transparent" }}
            aria-hidden
          />
          <input
            className={hexInputInvalid ? "admin-input--error" : undefined}
            value={hexInput}
            placeholder="#1a2b3c — custom hex"
            spellCheck={false}
            onChange={(e) => setHexInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hexInputNorm) {
                e.preventDefault();
                addColor(hexInputNorm);
                setHexInput("");
              }
            }}
          />
          <button
            type="button"
            className="canvas-btn"
            disabled={!hexInputNorm}
            onClick={() => {
              if (!hexInputNorm) return;
              addColor(hexInputNorm);
              setHexInput("");
            }}
          >
            + ADD HEX
          </button>
        </div>
        {hexInputInvalid && (
          <p className="admin-warn">
            Enter a 3- or 6-digit hex color, e.g. #1a2b3c.
          </p>
        )}
      </div>

      {!badDims && (
        <p className="admin-card__note">
          {capacity.toLocaleString()} px canvas ·{" "}
          {rentSol === null
            ? "calculating rent…"
            : `~${rentSol.toFixed(rentSol < 0.1 ? 4 : 2)} SOL rent`}
          {canvasAccountSpace(width, height) > 10 * 1024
            ? " · created in 2 transactions"
            : " · created in 1 transaction"}
        </p>
      )}

      {validationError && program && (
        <p className="admin-warn">{validationError}.</p>
      )}

      <TxButton
        key={disabled ? "disabled" : "ready"}
        label="Create & delegate season"
        onRun={run}
        onDone={() => {
          resetForm();
          onCreated?.();
        }}
        disabled={disabled}
      />
    </section>
  );
}

function ClockIcon() {
  return (
    <svg
      className="admin-field__ico"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
