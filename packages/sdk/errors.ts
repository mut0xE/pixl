export type NormalizedError = { title: string; detail: string };

// PixlError variants in declaration order. Anchor numbers custom errors from
// 6000, so index i maps to code 6000 + i. Used to turn a bare
// "custom program error: 0x177d" into the human message the program declared.
const PIXL_ERRORS = [
  "Unauthorized action for the provided authority.",
  "The provided season id is invalid.",
  "The provided season time range is invalid.",
  "The provided season title is invalid.",
  "The provided season description is invalid.",
  "The provided image reference is invalid.",
  "The provided palette is invalid.",
  "The provided canvas dimensions are invalid.",
  "The provided coordinate is outside the canvas bounds.",
  "The provided color index is invalid.",
  "The season is not active.",
  "A season is already active.",
  "The season has already been completed.",
  "The season has not ended yet.",
  "The canvas is frozen.",
  "The player is already registered.",
  "The player has already joined this season.",
  "The player account has not been initialized.",
  "The season profile account has not been initialized.",
  "The player does not have enough energy.",
  "The pixel is already painted with that color.",
  "The provided game account does not match the expected game.",
  "The provided season account does not match the expected season.",
  "The provided canvas account does not match the expected canvas.",
  "Arithmetic overflow occurred.",
  "The account state is invalid for this operation.",
];

function pixlErrorMessage(code: number): string | null {
  const i = code - 6000;
  return i >= 0 && i < PIXL_ERRORS.length ? PIXL_ERRORS[i] : null;
}

// Pulls a custom program error number out of any of the shapes web3/Anchor use:
//   "custom program error: 0x177d"  ·  {"Custom":6013}  ·  "Custom(6013)"
function extractCustomCode(text: string): number | null {
  const hex = /custom program error:\s*0x([0-9a-fA-F]+)/.exec(text);
  if (hex) return parseInt(hex[1], 16);
  const dec = /"?Custom"?[:(]\s*(\d+)/.exec(text);
  if (dec) return Number(dec[1]);
  return null;
}

// Flattens an error plus any attached simulation logs into one searchable blob.
function collectText(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  else if (typeof err === "string") parts.push(err);
  const anyErr = err as { logs?: unknown };
  if (Array.isArray(anyErr?.logs)) parts.push(anyErr.logs.join("\n"));
  if (parts.length === 0) {
    try {
      parts.push(JSON.stringify(err));
    } catch {
      parts.push(String(err));
    }
  }
  return parts.join("\n");
}

// First non-empty line, hard-capped so a raw dump can't wall-of-text the toast.
function concise(msg: string): string {
  const line = msg
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const text = line ?? msg.trim();
  return text.length > 160 ? text.slice(0, 157) + "…" : text;
}

export function normalizeError(err: unknown): NormalizedError {
  const msg = collectText(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("rejected the request")
  ) {
    return { title: "Signature rejected", detail: "You declined the request." };
  }

  // Anchor prints "Error Message: <text>." in the program logs — prefer it
  // verbatim, it's already the friendliest phrasing.
  const anchorMsg = /Error Message:\s*(.+?)\.*\s*(?:"|$)/m.exec(msg);
  if (anchorMsg && anchorMsg[1].trim()) {
    return { title: "Program error", detail: anchorMsg[1].trim() };
  }

  // Otherwise resolve a custom error number against the program's error table.
  const code = extractCustomCode(msg);
  if (code !== null) {
    const known = pixlErrorMessage(code);
    return {
      title: "Program error",
      detail: known ?? `Custom error ${code}`,
    };
  }

  if (
    lower.includes("insufficient") ||
    lower.includes("found no record of a prior credit")
  ) {
    return {
      title: "Insufficient SOL",
      detail: "Not enough SOL to cover this transaction.",
    };
  }

  return { title: "Transaction failed", detail: concise(msg) };
}
