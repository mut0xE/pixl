"use client";
import { useState } from "react";
import { normalizeError, type NormalizedError } from "../../../packages/sdk";

export type TxState =
  | "idle"
  | "building"
  | "awaiting_signature"
  | "confirming"
  | "success"
  | "error";

const EXPLORER_CLUSTER = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? "devnet";

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

const STATE_LABEL: Record<TxState, string> = {
  idle: "",
  building: "Building transaction…",
  awaiting_signature: "Waiting for wallet signature…",
  confirming: "Confirming…",
  success: "Confirmed",
  error: "Failed",
};

export function TxButton({
  label,
  onRun,
  onDone,
}: {
  label: string;
  onRun: (setState: (s: TxState) => void) => Promise<string>;
  onDone?: () => void;
}) {
  const [state, setState] = useState<TxState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<NormalizedError | null>(null);

  const busy = state === "building" || state === "awaiting_signature" || state === "confirming";

  async function handleClick() {
    setError(null);
    setSignature(null);
    setState("building");
    try {
      const sig = await onRun(setState);
      setSignature(sig);
      setState("success");
      onDone?.();
    } catch (err) {
      setError(normalizeError(err));
      setState("error");
    }
  }

  return (
    <div className="tx-button">
      <button onClick={handleClick} disabled={busy} className="tx-button__button">
        {busy ? STATE_LABEL[state] : label}
      </button>
      {state === "success" && signature && (
        <a
          className="tx-button__link"
          href={explorerUrl(signature)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {state === "error" && error && (
        <div className="tx-button__error" role="alert">
          <strong>{error.title}</strong>
          <span>{error.detail}</span>
        </div>
      )}
    </div>
  );
}
