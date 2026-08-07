import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Pixl } from "../target/types/pixl";
import { fetchCanvasAccount, type TestWorld } from "./helpers";

type AccountKind =
  | "game"
  | "season"
  | "seasonStats"
  | "player"
  | "seasonProfile"
  | "canvas";

export type AccountRef = {
  label: string;
  kind: AccountKind;
  address: PublicKey;
};

type Program = anchor.Program<Pixl>;
type State = Record<string, unknown> | null;

export function worldAccountRefs(
  world: TestWorld,
  { includeCanvas = true }: { includeCanvas?: boolean } = {}
): AccountRef[] {
  const refs: AccountRef[] = [
    { label: "game", kind: "game", address: world.gamePda },
    { label: "season", kind: "season", address: world.seasonPda },
    {
      label: "seasonStats",
      kind: "seasonStats",
      address: world.seasonStatsPda,
    },
    { label: "player", kind: "player", address: world.playerPda },
    {
      label: "seasonProfile",
      kind: "seasonProfile",
      address: world.seasonProfilePda,
    },
  ];
  if (includeCanvas && world.canvasKeypair) {
    refs.push({
      label: "canvas",
      kind: "canvas",
      address: world.canvasKeypair.publicKey,
    });
  }
  return refs;
}

function toPlain(value: any): any {
  if (value == null) return value;
  if (value instanceof PublicKey) return value.toBase58();
  if (anchor.BN.isBN(value)) return value.toString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export async function fetchAccountState(
  program: Program,
  ref: AccountRef
): Promise<State> {
  const connection = program.provider.connection;
  try {
    if (ref.kind === "canvas") {
      return toPlain(await fetchCanvasAccount(connection, ref.address));
    }
    return toPlain(await (program.account as any)[ref.kind].fetch(ref.address));
  } catch {
    return null;
  }
}

export async function snapshotAccounts(
  program: Program,
  refs: AccountRef[]
): Promise<Record<string, State>> {
  const entries = await Promise.all(
    refs.map(
      async (ref) => [ref.label, await fetchAccountState(program, ref)] as const
    )
  );
  return Object.fromEntries(entries);
}

function formatValue(key: string, value: unknown): string {
  if (value == null) return String(value);
  if (Array.isArray(value)) {
    const nonZero = value.filter((p) => p !== 0).length;
    return `[${value.join(",")}]  (len=${value.length}, painted=${nonZero})`;
  }
  return String(value);
}

export function logSnapshot(
  title: string,
  snap: Record<string, State>,
  source?: string
) {
  console.log(`\n### ${title}${source ? `  (via ${source})` : ""}`);
  for (const [label, data] of Object.entries(snap)) {
    if (data == null) {
      console.log(`  ${label}: <not readable here>`);
      continue;
    }
    console.log(`  ${label}:`);
    for (const [k, v] of Object.entries(data)) {
      console.log(`    ${k}: ${formatValue(k, v)}`);
    }
  }
}

export function logDiff(
  title: string,
  before: Record<string, State>,
  after: Record<string, State>,
  source?: string
) {
  console.log(`\n### DIFF ${title}${source ? `  (via ${source})` : ""}`);
  const labels = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const label of labels) {
    const b = before[label];
    const a = after[label];

    if (b == null && a == null) {
      console.log(`  ${label}: <not readable, before & after>`);
      continue;
    }
    if (b == null) {
      console.log(`  ${label}: CREATED / now readable`);
      logSnapshot("", { [label]: a });
      continue;
    }
    if (a == null) {
      console.log(`  ${label}: DISAPPEARED / no longer readable`);
      continue;
    }

    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const changes: string[] = [];
    for (const k of keys) {
      const bv = formatValue(k, (b as any)[k]);
      const av = formatValue(k, (a as any)[k]);
      if (bv !== av) changes.push(`    ${k}: ${bv}  ->  ${av}`);
    }

    if (changes.length === 0) {
      console.log(`  ${label}: (unchanged)`);
    } else {
      console.log(`  ${label}:`);
      changes.forEach((line) => console.log(line));
    }
  }
}

export async function withAccountDiff<T>(
  opts: {
    title: string;
    program: Program;
    refs: AccountRef[];
    source?: string;
  },
  run: () => Promise<T>
): Promise<T> {
  const before = await snapshotAccounts(opts.program, opts.refs);
  const result = await run();
  const after = await snapshotAccounts(opts.program, opts.refs);
  logDiff(opts.title, before, after, opts.source);
  return result;
}
