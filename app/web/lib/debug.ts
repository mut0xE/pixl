"use client";

type DebugPayload = unknown;

declare global {
  interface Window {
    __PIXL_DEBUG__?: Array<{
      tag: string;
      message: string;
      payload?: DebugPayload;
      at: string;
    }>;
  }
}

export function pixlLog(
  tag: string,
  message: string,
  payload?: DebugPayload
): void {
  const entry = { tag, message, payload, at: new Date().toISOString() };
  window.__PIXL_DEBUG__ = [...(window.__PIXL_DEBUG__ ?? []), entry].slice(-200);
  console.log(tag, message, payload ?? "");

  if (process.env.NODE_ENV !== "development") return;
  fetch("/api/debug-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch(() => {
    // Terminal mirroring is best-effort; browser console still has the log.
  });
}

export function pixlError(
  tag: string,
  message: string,
  err: unknown,
  payload?: DebugPayload
): void {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : { payload };
  pixlLog(tag, message, {
    ...base,
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : err,
  });
  console.error(tag, message, err);
}
