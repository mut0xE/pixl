// Mirrors the on-chain `Player::refresh_energy` logic (see `state.rs`).
export type PlayerEnergy = {
  availableEnergy: number;
  maxEnergy: number;
  energyCooldownSeconds: number;
  lastEnergyRefresh: number;
};

export function estimateAvailableEnergy(
  player: PlayerEnergy,
  now: number
): number {
  const {
    availableEnergy,
    maxEnergy,
    energyCooldownSeconds,
    lastEnergyRefresh,
  } = player;

  if (now < lastEnergyRefresh) {
    throw new RangeError(
      `now (${now}) is before last_energy_refresh (${lastEnergyRefresh})`
    );
  }
  if (availableEnergy >= maxEnergy) {
    return maxEnergy;
  }
  if (energyCooldownSeconds <= 0) {
    throw new RangeError("energy_cooldown_seconds must be greater than zero");
  }

  const elapsed = now - lastEnergyRefresh;
  const regenerated = Math.floor(elapsed / energyCooldownSeconds);
  if (regenerated <= 0) {
    return availableEnergy;
  }

  return Math.min(availableEnergy + regenerated, maxEnergy);
}

// Seconds until the next energy block regenerates, or null if already at max.
export function secondsUntilNextEnergy(
  player: PlayerEnergy,
  now: number
): number | null {
  const { energyCooldownSeconds, lastEnergyRefresh } = player;

  if (now < lastEnergyRefresh) {
    throw new RangeError(
      `now (${now}) is before last_energy_refresh (${lastEnergyRefresh})`
    );
  }
  if (estimateAvailableEnergy(player, now) >= player.maxEnergy) {
    return null;
  }
  if (energyCooldownSeconds <= 0) {
    throw new RangeError("energy_cooldown_seconds must be greater than zero");
  }

  const elapsed = now - lastEnergyRefresh;
  return energyCooldownSeconds - (elapsed % energyCooldownSeconds);
}
