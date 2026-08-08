"use client";
import { useRef, useState } from "react";
import { normalizeError } from "../../../packages/sdk";
import { pixlError, pixlLog } from "../lib/debug";
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
  inlineFeedback = true,
  toastProgress = false,
}: {
  label: string;
  onRun: (setState: (s: TxState) => void) => Promise<string>;
  onDone?: () => void;
  disabled?: boolean;
  /** Chain this action settles on, used to build the success Explorer link. */
  explorer?: TxCluster;
  /** Render progress/success/error feedback inline under the button. */
  inlineFeedback?: boolean;
  /** Announce progress phases in toast notifications instead of the card body. */
  toastProgress?: boolean;
}) {
  const [state, setState] = useState<TxState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errInfo, setErrInfo] = useState<ErrInfo | null>(null);
  const toast = useToast();
  const lastToastState = useRef<TxState | null>(null);

  const busy =
    state === "building" ||
    state === "awaiting_signature" ||
    state === "confirming";

  function applyState(next: TxState) {
    setState(next);
    if (!toastProgress || lastToastState.current === next) return;
    lastToastState.current = next;
    if (next === "building") {
      toast.info(label, "Building transaction...");
    } else if (next === "awaiting_signature") {
      toast.info(label, "Waiting for wallet signature...");
    } else if (next === "confirming") {
      toast.info(label, "Confirming transaction...");
    }
  }

  async function handleClick() {
    setSignature(null);
    setErrInfo(null);
    lastToastState.current = null;
    applyState("building");
    try {
      const sig = await onRun(applyState);
      setSignature(sig);
      setState("success");
      toast.success("Transaction confirmed", label);
      onDone?.();
    } catch (err) {
      const normalized = normalizeError(err);
      // A reverted tx carries its signature — link straight to the failed tx.
      const failed = err as {
        signature?: string;
        txCluster?: TxCluster;
        logs?: string[];
      };
      console.groupCollapsed(`[pixl:tx-button] ${label} failed`);
      pixlError("[pixl:tx-button]", `${label} raw error`, err);
      pixlLog("[pixl:tx-button]", `${label} normalized`, normalized);
      pixlLog("[pixl:tx-button]", `${label} signature`, {
        signature: failed?.signature ?? null,
        cluster: failed?.txCluster ?? explorer,
      });
      if (Array.isArray(failed?.logs)) {
        console.groupCollapsed("[pixl:tx-button] program logs");
        pixlLog("[pixl:tx-button]", `${label} program logs`, failed.logs);
        failed.logs.forEach((line, i) => console.log(`${i}: ${line}`));
        console.groupEnd();
      }
      console.groupEnd();
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
        {busy && inlineFeedback ? STATE_LABEL[state] : label}
      </button>
      {inlineFeedback && state === "success" && signature && (
        <a
          className="tx-button__link"
          href={explorerUrl(signature, explorer)}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {inlineFeedback && state === "error" && errInfo?.signature && (
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
  );
}
