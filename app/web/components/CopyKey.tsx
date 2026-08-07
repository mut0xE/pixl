"use client";
import { useState } from "react";
import { useToast } from "./Toast";

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// A truncated pubkey; click-to-copy the full value, with toast + inline feedback.
export function CopyKey({
  value,
  label,
  full = false,
}: {
  value: string;
  /** What was copied, for the toast, e.g. "Season address". */
  label?: string;
  /** Show the full key instead of the truncated form. */
  full?: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.success("Copied", label ?? value);
    } catch {
      toast.error("Copy failed", "Clipboard is unavailable in this context");
    }
  }

  return (
    <button
      type="button"
      className="copy-key"
      onClick={copy}
      title={`Copy ${label ?? value}`}
    >
      <code>{full ? value : shortKey(value)}</code>
      <span className="copy-key__icon" aria-hidden>
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}
