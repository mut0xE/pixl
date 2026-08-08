"use client";
import {
  estimateAvailableEnergy,
  secondsUntilNextEnergy,
  type PlayerEnergy,
  type SessionMeta,
} from "../../../packages/sdk";

// Paint-energy HUD. Presentational: projects the ER Player forward with the same
// math the program runs on refresh; painting still re-checks via canPaint.

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function sessionState(
  session: SessionMeta | null,
  now: number
): { kind: "active" | "expired" | "none"; expiresIn?: number } {
  if (!session) return { kind: "none" };
  if (session.validUntil <= now) return { kind: "expired" };
  return { kind: "active", expiresIn: session.validUntil - now };
}

// Coarse "time left" readout that rolls up as the horizon grows (s → m → h → d → mo).
function formatExpiry(seconds: number): string {
  const DAY = 86400;
  const MONTH = DAY * 30;
  if (seconds >= MONTH) return `${Math.floor(seconds / MONTH)}mo`;
  if (seconds >= DAY) return `${Math.floor(seconds / DAY)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

export function PaintEnergyHud({
  energy,
  session,
  variant = "card",
  alertTick = 0,
  error = null,
  hover = null,
  canvas = null,
}: {
  energy: PlayerEnergy | null;
  session: SessionMeta | null;
  // "pill" is the compact single-line readout that lives in the top bar; "card"
  // is the full stacked HUD.
  variant?: "card" | "pill";
  alertTick?: number;
  error?: string | null;
  hover?: { x: number; y: number } | null;
  canvas?: { width: number; height: number; frozen?: boolean } | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const pill = variant === "pill";

  // Stale / not-yet-loaded: the delegated Player hasn't decoded off the ER yet.
  if (!energy) {
    if (pill) {
      return (
        <div className="energy-pill" data-state="syncing">
          <span className="energy-pill__bolt" aria-hidden>
            ⚡
          </span>
          <span className="energy-pill__count">—</span>
          <span className="energy-pill__regen">syncing…</span>
        </div>
      );
    }
    return (
      <div className="energy-hud" data-state="syncing">
        <div className="energy-hud__head">
          <span className="energy-hud__eyebrow">Paint energy</span>
        </div>
        <div className="energy-hud__top">
          <span className="energy-hud__label">
            <span className="energy-hud__bolt" aria-hidden>
              ⚡
            </span>
            <span className="energy-hud__count">—</span>
          </span>
          <span className="energy-hud__status">syncing…</span>
        </div>
        {error && (
          <p className="energy-hud__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const max = energy.maxEnergy;
  // Clock skew would throw; fall back to the raw account value.
  let available: number;
  let countdown: number | null;
  try {
    available = estimateAvailableEnergy(energy, now);
    countdown = secondsUntilNextEnergy(energy, now);
  } catch {
    available = Math.min(energy.availableEnergy, max);
    countdown = null;
  }

  const full = available >= max;
  const empty = available <= 0;
  const state = empty ? "empty" : full ? "full" : "charging";
  const session_ = sessionState(session, now);

  if (pill) {
    return (
      <div className="energy-pill" data-state={state}>
        <span className="energy-pill__bolt" aria-hidden>
          ⚡
        </span>
        <span className="energy-pill__count">
          {available}
          <span className="energy-pill__max">/{max}</span>
        </span>
        <span className="energy-pill__regen">
          {full
            ? "full"
            : countdown !== null
            ? `+1 in ${formatCountdown(countdown)}`
            : "—"}
        </span>
        <span
          className="energy-pill__session"
          data-session={session_.kind}
          title={
            session_.kind === "active"
              ? "Session active"
              : session_.kind === "expired"
              ? "Session expired — reconnect to paint"
              : "No session — connect to paint"
          }
        >
          <span className="energy-pill__dot" aria-hidden />
          {session_.kind === "active"
            ? formatExpiry(session_.expiresIn ?? 0)
            : session_.kind === "expired"
            ? "expired"
            : "no session"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="energy-hud"
      data-state={state}
      data-alert={alertTick > 0 || undefined}
      key={alertTick}
    >
      <div className="energy-hud__head">
        <span className="energy-hud__eyebrow">Paint energy</span>
      </div>
      <div className="energy-hud__top">
        <span className="energy-hud__label">
          <span className="energy-hud__bolt" aria-hidden>
            ⚡
          </span>
          <span className="energy-hud__count">{available}</span>
          <span className="energy-hud__max">/{max}</span>
        </span>
        <span className="energy-hud__status">
          {full ? (
            "Full"
          ) : countdown !== null ? (
            <>
              <span className="energy-hud__status-dim">+1 in</span>{" "}
              {formatCountdown(countdown)}
            </>
          ) : (
            "—"
          )}
        </span>
      </div>

      <div className="energy-hud__session" data-session={session_.kind}>
        {session_.kind === "active" ? (
          <>
            <span className="energy-hud__dot" aria-hidden />
            session active · {formatExpiry(session_.expiresIn ?? 0)} left
          </>
        ) : session_.kind === "expired" ? (
          <>
            <span className="energy-hud__dot" aria-hidden />
            session expired · reconnect to paint
          </>
        ) : (
          <>
            <span className="energy-hud__dot" aria-hidden />
            no session · connect to paint
          </>
        )}
      </div>

      {error && (
        <p className="energy-hud__error" role="alert">
          {error}
        </p>
      )}

      {(hover || canvas) && (
        <div className="energy-hud__tools">
          <div className="energy-hud__facts" data-cols={canvas ? "2" : "1"}>
            <div className="energy-hud__fact">
              <span className="energy-hud__fact-label">X/Y</span>
              <span className="energy-hud__fact-value">
                {hover ? `${hover.x}, ${hover.y}` : "—"}
              </span>
            </div>
            {canvas && (
              <div className="energy-hud__fact">
                <span className="energy-hud__fact-label">Canvas</span>
                <span className="energy-hud__fact-value">
                  {canvas.width}×{canvas.height}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
