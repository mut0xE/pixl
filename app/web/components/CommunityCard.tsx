"use client";
import {
  computeContributionPct,
  computeSeasonProgressPct,
  formatPercent,
} from "../../../packages/sdk";
import type { SeasonTiming } from "../lib/useCanvasData";
import type { Contribution } from "../lib/useContribution";

// Community Contribution card. Presentational: figures are read off-chain or
// derived here (contribution %, season progress); nothing is stored as a %.
export function CommunityCard({
  contribution,
  season,
}: {
  contribution: Contribution | null;
  season: SeasonTiming | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const progress = season
    ? computeSeasonProgressPct(season.startTime, season.endTime, now)
    : 0;

  // Not yet loaded — mirror the energy HUD's syncing shell.
  if (!contribution) {
    return (
      <div className="community-card" data-state="syncing">
        <div className="community-card__head">
          <span className="community-card__eyebrow">Community</span>
        </div>
        <p className="community-card__syncing">syncing…</p>
      </div>
    );
  }

  const { communityPixels, yourPixels, rank } = contribution;
  const contributionPct = computeContributionPct(yourPixels, communityPixels);

  return (
    <div className="community-card">
      <div className="community-card__head">
        <span className="community-card__eyebrow">Community</span>
        <span className="community-card__rank">
          {rank !== null ? `#${rank}` : "—"}
        </span>
      </div>

      <div className="community-card__progress">
        <div className="community-card__progress-head">
          <span className="community-card__progress-label">
            Season progress
          </span>
          <span className="community-card__progress-pct">
            {formatPercent(progress)}
          </span>
        </div>
        <div
          className="community-card__bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Season progress"
        >
          <span
            className="community-card__bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <dl className="community-card__stats">
        <div className="community-card__stat">
          <dt>Community pixels</dt>
          <dd>{communityPixels.toLocaleString()}</dd>
        </div>
        <div className="community-card__stat">
          <dt>Your pixels</dt>
          <dd>{yourPixels.toLocaleString()}</dd>
        </div>
        <div className="community-card__stat community-card__stat--accent">
          <dt>Contribution</dt>
          <dd>{formatPercent(contributionPct)}</dd>
        </div>
      </dl>
    </div>
  );
}
