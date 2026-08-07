// Pure bootstrap state machine mapping observed account/session state to a
// status string. undefined = still fetching; null = fetched but absent.
export type BootstrapStatus =
  | "disconnected"
  | "connecting"
  | "loading_game"
  | "no_active_season"
  | "loading_player"
  | "player_missing"
  | "loading_profile"
  | "season_profile_missing"
  | "session_missing"
  | "session_expired"
  | "ready";

export type SessionMeta = {
  sessionSigner: string;
  sessionToken: string;
  validUntil: number;
  // Public nonce to re-derive the session signer keypair; the secret is never stored.
  nonce: number;
};

export type SeasonView = {
  completed: boolean;
  startTime: number;
  endTime: number;
};

export type DeriveBootstrapInput = {
  connected: boolean;
  game: unknown | null | undefined;
  season: SeasonView | "zero" | null | undefined;
  player: unknown | null | undefined;
  seasonProfile: unknown | null | undefined;
  session: SessionMeta | null;
  now: number;
};

export function deriveBootstrapStatus(
  input: DeriveBootstrapInput
): BootstrapStatus {
  if (!input.connected) return "disconnected";

  if (input.game === undefined) return "connecting";
  if (input.game === null) return "loading_game";

  if (input.season === undefined || input.season === null)
    return "loading_game";
  if (input.season === "zero") return "no_active_season";
  const s = input.season;
  const active =
    !s.completed && input.now >= s.startTime && input.now < s.endTime;
  if (!active) return "no_active_season";

  if (input.player === undefined) return "loading_player";
  if (input.player === null) return "player_missing";

  if (input.seasonProfile === undefined) return "loading_profile";
  if (input.seasonProfile === null) return "season_profile_missing";

  if (input.session === null) return "session_missing";
  if (input.session.validUntil <= input.now) return "session_expired";

  return "ready";
}
