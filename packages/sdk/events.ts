import { BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";

export type PixlEventData = {
  GameInitialized: {
    game: PublicKey;
    authority: PublicKey;
    currentSeasonId: number;
    timestamp: BN;
  };
  SeasonStarted: {
    game: PublicKey;
    season: PublicKey;
    seasonId: number;
    authority: PublicKey;
    title: string;
    startTime: BN;
    endTime: BN;
    timestamp: BN;
  };
  CanvasInitialized: {
    season: PublicKey;
    canvas: PublicKey;
    width: number;
    height: number;
    authority: PublicKey;
    timestamp: BN;
  };
  PlayerInitialized: {
    player: PublicKey;
    wallet: PublicKey;
    maxEnergy: number;
    energyCooldownSeconds: number;
    timestamp: BN;
  };
  PlayerJoined: {
    season: PublicKey;
    player: PublicKey;
    wallet: PublicKey;
    joinedAt: BN;
    timestamp: BN;
  };
  PixelPainted: {
    player: PublicKey;
    season: PublicKey;
    x: number;
    y: number;
    oldColorIndex: number;
    newColorIndex: number;
    timestamp: BN;
  };
  SeasonEnded: {
    game: PublicKey;
    season: PublicKey;
    seasonId: number;
    authority: PublicKey;
    endedAt: BN;
    timestamp: BN;
  };
};

export type PixlEvent = {
  [K in keyof PixlEventData]: { name: K; data: PixlEventData[K] };
}[keyof PixlEventData];

export function createEventParser(idl: Idl, programId: PublicKey): EventParser {
  return new EventParser(programId, new BorshCoder(idl));
}

/** Parses all Pixl events emitted in a transaction's logs. */
export function parsePixlEvents(
  idl: Idl,
  programId: PublicKey,
  logs: string[]
): PixlEvent[] {
  const parser = createEventParser(idl, programId);
  const events: PixlEvent[] = [];
  for (const event of parser.parseLogs(logs)) {
    events.push({
      name: event.name,
      data: camelCaseKeys(event.data),
    } as PixlEvent);
  }
  return events;
}

/** Decodes a single base64-encoded event blob (e.g. from a CPI `emit_cpi!`). */
export function decodePixlEvent(idl: Idl, base64: string): PixlEvent | null {
  const decoded = new BorshCoder(idl).events.decode(base64);
  if (!decoded) return null;
  return { name: decoded.name, data: camelCaseKeys(decoded.data) } as PixlEvent;
}

// The borsh event coder returns snake_case field names; normalize to camelCase.
function camelCaseKeys(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c: string) =>
      c.toUpperCase()
    );
    out[camel] = value;
  }
  return out;
}
