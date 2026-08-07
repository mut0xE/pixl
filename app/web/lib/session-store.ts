"use client";
import type { SessionMeta } from "../../../packages/sdk";

const KEY = (wallet: string) => `pixl.session.${wallet}`;
const NONCE_KEY = (wallet: string) => `pixl.sessionNonce.${wallet}`;

/** Bump and persist the per-wallet nonce, returning the new value. */
export function nextSessionNonce(wallet: string): number {
  const current = Number(window.localStorage.getItem(NONCE_KEY(wallet)) ?? "0");
  const next = (current + 1) | 0;
  window.localStorage.setItem(NONCE_KEY(wallet), String(next));
  return next;
}

export function loadSessionMeta(wallet: string): SessionMeta | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY(wallet));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

export function saveSessionMeta(wallet: string, meta: SessionMeta): void {
  window.localStorage.setItem(KEY(wallet), JSON.stringify(meta));
}

export function clearSessionMeta(wallet: string): void {
  window.localStorage.removeItem(KEY(wallet));
}
