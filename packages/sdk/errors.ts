// Unwraps wallet/Anchor/web3 errors into a readable { title, detail }.
// Never swallows the raw message — detail always carries it as a fallback.

export type NormalizedError = { title: string; detail: string };

const KNOWN_CODES = [
  "SeasonNotActive",
  "PlayerNotInitialized",
  "SeasonAlreadyCompleted",
  "WrongSeason",
  "InvalidAccountState",
  "MathOverflow",
];

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function normalizeError(err: unknown): NormalizedError {
  const msg = rawMessage(err);
  const lower = msg.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return { title: "Signature rejected", detail: msg };
  }
  if (
    lower.includes("insufficient") ||
    lower.includes("found no record of a prior credit") ||
    lower.includes("0x1") // system program: result in an account with insufficient funds
  ) {
    return { title: "Insufficient SOL", detail: msg };
  }
  const code = KNOWN_CODES.find((c) => msg.includes(c));
  if (code) {
    return { title: "Program error", detail: `${code}: ${msg}` };
  }
  return { title: "Transaction failed", detail: msg };
}
