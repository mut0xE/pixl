# Public Seasons Page — Design

Date: 2026-08-07

## Goal

Give players a dedicated `/seasons` route that lists seasons split across
**Active / Upcoming / Ended** tabs, with clean pixel-styled cards and smooth
skeleton loading. Mirrors the admin season roster's tabbed shape, but public
(no authority gating) and styled to match the player-facing aesthetic.

## Scope

- New route: `app/web/app/seasons/page.tsx` — a public page wrapping the
  seasons browser in a lightweight header shell (`Pixl` wordmark + `HomeButton`),
  matching the landing aesthetic rather than the authority-gated `AdminShell`.
- Enhance `app/web/components/SeasonBrowser.tsx` (reused by the new route and by
  the existing inline `no_active_season` case in `BootstrapPanel`):
  - Three tabs — **Active · Upcoming · Ended** — reusing the existing
    `admin-tabs` / `admin-tab` markup + per-tab count badge.
  - Partition `seasons` by `s.status` in a `useMemo`.
  - Default tab = **Active**, falling back to the first non-empty tab so the
    view never opens on a blank list.
  - Per-tab empty state copy.
  - Existing card grid + detail drill-down unchanged.
- Smooth loading: replace the "Loading seasons…" spinner with a skeleton card
  grid (reusing `season-card--skeleton` / `skeleton` classes), plus a staggered
  fade-in (`animation-delay`) on real cards.

## Non-goals / YAGNI

- No SDK or data-layer changes — `useSeasons` + `classifySeason` already provide
  all three statuses.
- No pagination, search, or sort.

## Testing

Presentational change. Verify via typecheck/build and manual load of `/seasons`.
`classifySeason` is already unit-tested.
