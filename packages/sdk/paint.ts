import type { Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  deriveGamePda,
  derivePlayerPda,
  deriveSeasonProfilePda,
  deriveSeasonStatsPda,
} from "./pda";
import { estimateAvailableEnergy, type PlayerEnergy } from "./energy";
import { toCanvasIndex } from "./canvas";

// Client-side mirror of the on-chain `paint_pixel` `require!` checks so the UI
// can decide whether an optimistic paint is safe before it hits the ER.
export type PaintBlockReason =
  | "season_inactive"
  | "frozen"
  | "out_of_bounds"
  | "invalid_color"
  | "no_energy"
  | "same_color";

export type PaintCheck =
  | { ok: true; index: number }
  | { ok: false; reason: PaintBlockReason };

export type CanPaintInput = {
  season: { startTime: number; endTime: number; completed: boolean };
  canvas: { width: number; height: number; frozen: boolean; pixels: number[] };
  paletteLength: number;
  player: PlayerEnergy;
  x: number;
  y: number;
  colorIndex: number;
  now: number;
};

export function canPaint(input: CanPaintInput): PaintCheck {
  const { season, canvas, paletteLength, player, x, y, colorIndex, now } =
    input;

  const active =
    !season.completed && now >= season.startTime && now < season.endTime;
  if (!active) return { ok: false, reason: "season_inactive" };

  if (canvas.frozen) return { ok: false, reason: "frozen" };
  if (x >= canvas.width || y >= canvas.height)
    return { ok: false, reason: "out_of_bounds" };
  if (colorIndex >= paletteLength)
    return { ok: false, reason: "invalid_color" };

  if (estimateAvailableEnergy(player, now) <= 0)
    return { ok: false, reason: "no_energy" };

  const index = toCanvasIndex(x, y, canvas.width);
  if (canvas.pixels[index] === colorIndex)
    return { ok: false, reason: "same_color" };

  return { ok: true, index };
}

export const PAINT_BLOCK_MESSAGES: Record<PaintBlockReason, string> = {
  season_inactive: "Season is not active.",
  frozen: "Canvas is frozen.",
  out_of_bounds: "Pixel is out of bounds.",
  invalid_color: "That color isn't in the palette.",
  no_energy: "Out of energy — wait for it to recharge.",
  same_color: "Pixel is already that color.",
};

export type PaintTarget = {
  wallet: PublicKey;
  season: PublicKey;
  canvas: PublicKey;
  sessionToken: PublicKey | null;
};

export function resolvePaintAccounts(
  programId: PublicKey,
  target: PaintTarget
) {
  const [game] = deriveGamePda(programId);
  const [player] = derivePlayerPda(programId, target.wallet);
  const [seasonProfile] = deriveSeasonProfilePda(
    programId,
    target.season,
    target.wallet
  );
  const [seasonStats] = deriveSeasonStatsPda(programId, target.season);

  return {
    game,
    season: target.season,
    canvas: target.canvas,
    player,
    seasonProfile,
    seasonStats,
    sessionToken: target.sessionToken,
  };
}

export async function paintWithSession(
  erProgram: Program<any>,
  target: PaintTarget & { sessionToken: PublicKey },
  x: number,
  y: number,
  colorIndex: number
): Promise<string> {
  const provider = erProgram.provider as any; // AnchorProvider (has wallet)
  const connection = provider.connection;
  const payer = provider.publicKey!; // the session key

  // Send through the raw connection rather than Anchor's `.rpc()`: Anchor 0.32
  // rewraps send failures in a way that drops the real program logs on web3.js
  // 1.98. Going around it lets us surface the actual logs.
  const ix = await (erProgram.methods as any)
    .paintPixel(x, y, colorIndex)
    .accounts({
      payer,
      ...resolvePaintAccounts(erProgram.programId, target),
    })
    .instruction();

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  const signed = await provider.wallet.signTransaction(tx);

  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
  });

  const conf = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  if (conf.value.err) {
    // The tx landed with an error — pull its real logs off the confirmed tx.
    let logs: string[] | null = null;
    try {
      const failed = await connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      logs = failed?.meta?.logMessages ?? null;
    } catch {
      /* ignore — fall back to the confirmation error */
    }
    if (logs && logs.length > 0) {
      // eslint-disable-next-line no-console
      console.error("paintPixel failed — program logs:\n" + logs.join("\n"));
      throw new Error(logs.slice(-4).join(" | "));
    }
    throw new Error(`paintPixel failed: ${JSON.stringify(conf.value.err)}`);
  }
  return sig;
}
