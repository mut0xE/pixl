"use client";
import type { SessionMeta } from "../../../packages/sdk";

const KEY = (wallet: string) => `pixl.session.${wallet}`;

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
