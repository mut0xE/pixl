"use client";
import {
  estimateAvailableEnergy,
  secondsUntilNextEnergy,
  type PlayerEnergy,
  type SessionMeta,
} from "../../../packages/sdk";

// Paint-energy HUD. Presentational: projects the ER Player forward with the same
// math the program runs on refresh; painting still re-checks via canPaint.

// Above this many blocks the pip grid becomes noise; fall back to a bar.
const MAX_PIPS = 24;

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
}: {
  energy: PlayerEnergy | null;
  session: SessionMeta | null;
}) {
  const now = Math.floor(Date.now() / 1000);

  // Stale / not-yet-loaded: the delegated Player hasn't decoded off the ER yet.
  if (!energy) {
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

  return (
    <div className="energy-hud" data-state={state}>
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

      {max <= MAX_PIPS ? (
        <div
          className="energy-hud__pips"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={available}
          aria-label="Paint energy"
        >
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className="energy-hud__pip"
              data-filled={i < available || undefined}
            />
          ))}
        </div>
      ) : (
        <div
          className="energy-hud__bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={available}
          aria-label="Paint energy"
        >
          <span
            className="energy-hud__bar-fill"
            style={{ width: `${(available / max) * 100}%` }}
          />
        </div>
      )}

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
    </div>
  );
}
