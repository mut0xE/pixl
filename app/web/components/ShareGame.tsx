"use client";
import { useState } from "react";
import { useToast } from "./Toast";

// Invite link to the current season; `?join=1` tells HomeView to skip the
// landing page. Origin-relative so it works across localhost / preview / prod.
export function gameShareUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?join=1`;
}

// Click-to-copy an invite link, with toast + brief inline "copied" feedback.
export function ShareGame({
  className = "canvas-btn",
}: {
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(gameShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.success("Invite link copied", "Share it so others can join");
    } catch {
      toast.error("Copy failed", "Clipboard is unavailable in this context");
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      title="Copy an invite link to the game"
    >
      {copied ? "✓ COPIED" : "INVITE ↗"}
    </button>
  );
}
