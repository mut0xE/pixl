import { Connection, PublicKey } from "@solana/web3.js";

export type CanvasState = {
  season: PublicKey;
  width: number;
  height: number;
  pixels: number[];
  frozen: boolean;
};

export function decodeCanvas(data: Buffer | Uint8Array): CanvasState {
  const buf = Buffer.from(data);
  let offset = 8;
  const season = new PublicKey(buf.subarray(offset, offset + 32));
  offset += 32;
  const width = buf.readUInt16LE(offset);
  offset += 2;
  const height = buf.readUInt16LE(offset);
  offset += 2;
  const pixelCount = buf.readUInt32LE(offset);
  offset += 4;
  const pixels = [...buf.subarray(offset, offset + pixelCount)];
  offset += pixelCount;
  const frozen = buf[offset] === 1;
  return { season, width, height, pixels, frozen };
}

export async function fetchCanvas(
  connection: Connection,
  canvas: PublicKey
): Promise<CanvasState | null> {
  const info = await connection.getAccountInfo(canvas, "confirmed");
  if (!info) return null;
  return decodeCanvas(info.data);
}
