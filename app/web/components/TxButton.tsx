"use client";
import { useState } from "react";
import { normalizeError } from "../../../packages/sdk";
import { erExplorerTxUrl } from "../lib/er";
import type { TxCluster } from "../lib/actions";
import { useToast } from "./Toast";

export type TxState =
  | "idle"
  | "building"
  | "awaiting_signature"
  | "confirming"
  | "success"
  | "error";

const EXPLORER_CLUSTER = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? "devnet";

// Explorer link for a signature: ER uses the customUrl form, L1 the named cluster.
function explorerUrl(signature: string, cluster: TxCluster): string {
  return cluster === "er"
    ? erExplorerTxUrl(signature)
    : `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

const STATE_LABEL: Record<TxState, string> = {
  idle: "",
  building: "Building transaction…",
  awaiting_signature: "Waiting for wallet signature…",
  confirming: "Confirming…",
  success: "Confirmed",
  error: "Failed",
};

type ErrInfo = {
  title: string;
  detail: string;
  signature: string | null;
  cluster: TxCluster;
};

export function TxButton({
  label,
  onRun,
  onDone,
  disabled,
  explorer = "l1",
}: {
  label: string;
  onRun: (setState: (s: TxState) => void) => Promise<string>;
  onDone?: () => void;
  disabled?: boolean;
  /** Chain this action settles on, used to build the success Explorer link. */
  explorer?: TxCluster;
}) {
  const [state, setState] = useState<TxState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errInfo, setErrInfo] = useState<ErrInfo | null>(null);
  const toast = useToast();

  const busy =
    state === "building" ||
    state === "awaiting_signature" ||
    state === "confirming";

  async function handleClick() {
    setSignature(null);
    setErrInfo(null);
    setState("building");
    try {
      const sig = await onRun(setState);
      setSignature(sig);
      setState("success");
      toast.success("Transaction confirmed", label);
      onDone?.();
    } catch (err) {
      const normalized = normalizeError(err);
      // A reverted tx carries its signature — link straight to the failed tx.
      const failed = err as { signature?: string; txCluster?: TxCluster };
      setErrInfo({
        ...normalized,
        signature: failed?.signature ?? null,
        cluster: failed?.txCluster ?? explorer,
      });
      toast.error(normalized.title, normalized.detail);
      setState("error");
    }
  }

  return (
    <div className="tx-button">
      <button
        onClick={handleClick}
        disabled={busy || disabled}
        className="tx-button__button"
      >
        {busy ? STATE_LABEL[state] : label}
      </button>
      {state === "success" && signature && (
        <a
          className="tx-button__link"
          href={explorerUrl(signature, explorer)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {state === "error" && errInfo && (
        <div className="tx-button__error">
          <strong>{errInfo.title}</strong>
          <span>{errInfo.detail}</span>
          {errInfo.signature && (
            <a
              className="tx-button__link"
              href={explorerUrl(errInfo.signature, errInfo.cluster)}
              target="_blank"
              rel="noreferrer"
            >
              View failed transaction ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
