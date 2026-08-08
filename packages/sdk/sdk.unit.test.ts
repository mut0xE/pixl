import { expect } from "chai";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import {
  deriveGamePda,
  deriveSeasonPda,
  deriveCanvasPda,
  deriveFeePayerPda,
  deriveSeasonStatsPda,
  derivePlayerPda,
  deriveSeasonProfilePda,
  toCanvasIndex,
  fromCanvasIndex,
  rgbaToU32,
  u32ToRgba,
  u32ToHex,
  hexToU32,
  estimateAvailableEnergy,
  secondsUntilNextEnergy,
  canPaint,
  assertSeasonBelongsToGame,
  assertCanvasBelongsToSeason,
  assertPlayerOwnedBy,
  assertProfileMatches,
  assertStatsBelongToSeason,
  decodePixlEvent,
  canvasAccountSpace,
  buildCreateCanvasAccountIx,
  buildDelegateCanvasIx,
  buildDelegateSeasonStatsIx,
  buildDelegatePlayerIx,
  buildDelegateSeasonProfileIx,
  buildCreateSeasonWithDelegationTx,
  buildCreateSeasonPlan,
  deriveDelegationRecordPda,
  DELEGATION_PROGRAM_ID,
  resolveBootstrapAccounts,
  buildInitPlayerIx,
  buildJoinSeasonIx,
  deriveBootstrapStatus,
  normalizeError,
  type StartSeasonArgs,
  fitScale,
  fitCamera,
  centerCamera,
  clampScale,
  screenToCanvas,
  screenToCell,
  cellToScreen,
  zoomAt,
  panBy,
  clampOffset,
  shouldShowGrid,
  MIN_SCALE,
  MAX_SCALE,
  GRID_SCALE_THRESHOLD,
  classifySeason,
  toSeasonSummary,
  sortSeasonsForDisplay,
  summarizeSeasonCounts,
  computeContributionPct,
  computeSeasonProgressPct,
  formatPercent,
  rankOfPlayer,
  type SeasonSummary,
  buildEndSeasonIx,
  buildCommitGameplayStateIx,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  canvasToSnapshot,
  snapshotToRgbaBytes,
  snapshotToJson,
  paletteIndexToRgba,
} from "./index";
import { SystemProgram } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  "A7fbbwXrM1zSUbqEBzF7MvXKaNGqnZjpNVBAA8Fb6GyQ"
);
const pixlIdl = require("../../target/idl/pixl.json");

describe("pda derivation", () => {
  it("derives deterministic, distinct PDAs", () => {
    const wallet = Keypair.generate().publicKey;
    const [game] = deriveGamePda(PROGRAM_ID);
    const [season] = deriveSeasonPda(PROGRAM_ID, 1);
    const [canvas] = deriveCanvasPda(PROGRAM_ID, season);
    const [stats] = deriveSeasonStatsPda(PROGRAM_ID, season);
    const [player] = derivePlayerPda(PROGRAM_ID, wallet);
    const [profile] = deriveSeasonProfilePda(PROGRAM_ID, season, wallet);

    // Deterministic
    expect(deriveGamePda(PROGRAM_ID)[0].equals(game)).to.equal(true);

    // Distinct
    const keys = [game, season, canvas, stats, player, profile].map((k) =>
      k.toBase58()
    );
    expect(new Set(keys).size).to.equal(keys.length);
  });

  it("changes season PDA with season id", () => {
    expect(
      deriveSeasonPda(PROGRAM_ID, 1)[0].equals(
        deriveSeasonPda(PROGRAM_ID, 2)[0]
      )
    ).to.equal(false);
  });

  it("rejects out-of-range season ids", () => {
    expect(() => deriveSeasonPda(PROGRAM_ID, -1)).to.throw(RangeError);
    expect(() => deriveSeasonPda(PROGRAM_ID, 0x1_0000_0000)).to.throw(
      RangeError
    );
  });
});

describe("canvas index", () => {
  it("maps (x, y) row-major", () => {
    expect(toCanvasIndex(0, 0, 512)).to.equal(0);
    expect(toCanvasIndex(3, 0, 512)).to.equal(3);
    expect(toCanvasIndex(0, 1, 512)).to.equal(512);
    expect(toCanvasIndex(5, 2, 512)).to.equal(1029);
  });

  it("round-trips through fromCanvasIndex", () => {
    const { x, y } = fromCanvasIndex(1029, 512);
    expect(x).to.equal(5);
    expect(y).to.equal(2);
  });

  it("rejects x >= width and zero width", () => {
    expect(() => toCanvasIndex(512, 0, 512)).to.throw(RangeError);
    expect(() => toCanvasIndex(0, 0, 0)).to.throw(RangeError);
  });
});

describe("palette conversion", () => {
  it("packs and unpacks RGBA as 0xRRGGBBAA", () => {
    const color = rgbaToU32({ r: 0x11, g: 0x22, b: 0x33, a: 0x44 });
    expect(color).to.equal(0x11223344);
    expect(u32ToRgba(color)).to.deep.equal({
      r: 0x11,
      g: 0x22,
      b: 0x33,
      a: 0x44,
    });
  });

  it("handles full white (high bit set) without sign issues", () => {
    const color = rgbaToU32({ r: 0xff, g: 0xff, b: 0xff, a: 0xff });
    expect(color).to.equal(0xffffffff);
    expect(color).to.be.greaterThan(0);
  });

  it("converts to and from hex", () => {
    expect(u32ToHex(0x11223344)).to.equal("#11223344");
    expect(hexToU32("#11223344")).to.equal(0x11223344);
    expect(hexToU32("#112233")).to.equal(0x112233ff); // alpha defaults to ff
  });

  it("rejects malformed input", () => {
    expect(() => rgbaToU32({ r: 256, g: 0, b: 0, a: 0 })).to.throw(RangeError);
    expect(() => hexToU32("#xyz")).to.throw(RangeError);
    expect(() => hexToU32("#12345")).to.throw(RangeError);
  });
});

describe("energy estimation", () => {
  const base = {
    availableEnergy: 2,
    maxEnergy: 6,
    energyCooldownSeconds: 30,
    lastEnergyRefresh: 100,
  };

  it("keeps energy when no full interval elapsed", () => {
    expect(estimateAvailableEnergy(base, 100)).to.equal(2);
    expect(estimateAvailableEnergy(base, 129)).to.equal(2);
  });

  it("adds one energy per elapsed interval", () => {
    expect(estimateAvailableEnergy(base, 130)).to.equal(3);
    expect(estimateAvailableEnergy(base, 190)).to.equal(5);
  });

  it("caps at max energy", () => {
    expect(estimateAvailableEnergy(base, 100_000)).to.equal(6);
  });

  it("returns max immediately when already full", () => {
    expect(
      estimateAvailableEnergy({ ...base, availableEnergy: 6 }, 100_000)
    ).to.equal(6);
  });

  it("rejects backward timestamps", () => {
    expect(() => estimateAvailableEnergy(base, 99)).to.throw(RangeError);
  });
});

describe("secondsUntilNextEnergy", () => {
  const base = {
    availableEnergy: 2,
    maxEnergy: 6,
    energyCooldownSeconds: 30,
    lastEnergyRefresh: 100,
  };

  it("counts down within the current cooldown window", () => {
    expect(secondsUntilNextEnergy(base, 100)).to.equal(30);
    expect(secondsUntilNextEnergy(base, 110)).to.equal(20);
    expect(secondsUntilNextEnergy(base, 129)).to.equal(1);
  });

  it("resets to a full window as each block lands", () => {
    // 130 = one block regenerated; next block is a fresh 30s away.
    expect(secondsUntilNextEnergy(base, 130)).to.equal(30);
    expect(secondsUntilNextEnergy(base, 145)).to.equal(15);
  });

  it("returns null once projected energy is full", () => {
    expect(secondsUntilNextEnergy(base, 100_000)).to.equal(null);
    expect(
      secondsUntilNextEnergy({ ...base, availableEnergy: 6 }, 100)
    ).to.equal(null);
  });

  it("rejects backward timestamps", () => {
    expect(() => secondsUntilNextEnergy(base, 99)).to.throw(RangeError);
  });
});

describe("canPaint (paint pre-checks)", () => {
  // Mirrors every require! in paint_pixel.rs. now=1000 is inside the season and
  // the player has 2 energy available, painting color 1 onto a 4x4 canvas whose
  // pixels are all color 0.
  const base = {
    season: { startTime: 0, endTime: 10_000, completed: false },
    canvas: {
      width: 4,
      height: 4,
      frozen: false,
      pixels: new Array(16).fill(0),
    },
    paletteLength: 4,
    player: {
      availableEnergy: 2,
      maxEnergy: 6,
      energyCooldownSeconds: 30,
      lastEnergyRefresh: 1000,
    },
    x: 1,
    y: 1,
    colorIndex: 1,
    now: 1000,
  };

  it("accepts a valid paint and returns the row-major index", () => {
    const r = canPaint(base);
    expect(r.ok).to.equal(true);
    if (r.ok) expect(r.index).to.equal(5); // y*width + x = 1*4 + 1
  });

  it("blocks when the season is not active", () => {
    expect(canPaint({ ...base, now: 20_000 })).to.deep.equal({
      ok: false,
      reason: "season_inactive",
    });
    expect(
      canPaint({ ...base, season: { ...base.season, completed: true } })
    ).to.deep.equal({ ok: false, reason: "season_inactive" });
  });

  it("blocks a frozen canvas", () => {
    expect(
      canPaint({ ...base, canvas: { ...base.canvas, frozen: true } })
    ).to.deep.equal({ ok: false, reason: "frozen" });
  });

  it("blocks out-of-bounds coordinates", () => {
    expect(canPaint({ ...base, x: 4 })).to.deep.equal({
      ok: false,
      reason: "out_of_bounds",
    });
    expect(canPaint({ ...base, y: 9 })).to.deep.equal({
      ok: false,
      reason: "out_of_bounds",
    });
  });

  it("blocks a color index outside the palette", () => {
    expect(canPaint({ ...base, colorIndex: 4 })).to.deep.equal({
      ok: false,
      reason: "invalid_color",
    });
  });

  it("blocks when estimated energy is zero", () => {
    expect(
      canPaint({
        ...base,
        player: { ...base.player, availableEnergy: 0 },
      })
    ).to.deep.equal({ ok: false, reason: "no_energy" });
  });

  it("regenerates energy from the timestamp before blocking", () => {
    // 0 stored, but 60s elapsed at 30s cooldown => 2 regenerated.
    const r = canPaint({
      ...base,
      player: { ...base.player, availableEnergy: 0, lastEnergyRefresh: 940 },
    });
    expect(r.ok).to.equal(true);
  });

  it("blocks painting a pixel its current color", () => {
    expect(canPaint({ ...base, colorIndex: 0 })).to.deep.equal({
      ok: false,
      reason: "same_color",
    });
  });
});

describe("account relationship validation", () => {
  const game = Keypair.generate().publicKey;
  const season = Keypair.generate().publicKey;
  const player = Keypair.generate().publicKey;
  const wallet = Keypair.generate().publicKey;

  it("accepts consistent accounts", () => {
    expect(() =>
      assertSeasonBelongsToGame(
        { game },
        season,
        { currentSeason: season },
        game
      )
    ).to.not.throw();
    expect(() =>
      assertCanvasBelongsToSeason({ season }, season)
    ).to.not.throw();
    expect(() => assertPlayerOwnedBy({ wallet }, wallet)).to.not.throw();
    expect(() =>
      assertProfileMatches({ season, player }, season, player)
    ).to.not.throw();
    expect(() => assertStatsBelongToSeason({ season }, season)).to.not.throw();
  });

  it("rejects mismatches", () => {
    const other = Keypair.generate().publicKey;
    expect(() =>
      assertSeasonBelongsToGame(
        { game: other },
        season,
        { currentSeason: season },
        game
      )
    ).to.throw();
    expect(() =>
      assertCanvasBelongsToSeason({ season: other }, season)
    ).to.throw();
    expect(() => assertPlayerOwnedBy({ wallet: other }, wallet)).to.throw();
    expect(() =>
      assertProfileMatches({ season, player: other }, season, player)
    ).to.throw();
    expect(() =>
      assertStatsBelongToSeason({ season: other }, season)
    ).to.throw();
  });
});

describe("admin: canvas creation + delegation", () => {
  // In-memory anchor Program — no network is touched by `.instruction()`.
  const dummyKey = Keypair.generate();
  const wallet = {
    publicKey: dummyKey.publicKey,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  const provider = new AnchorProvider(
    new Connection("http://localhost:8899"),
    wallet as any,
    {}
  );
  const program = new Program(pixlIdl as any, provider) as any;

  const authority = dummyKey.publicKey;
  const game = Keypair.generate().publicKey;
  const season = Keypair.generate().publicKey;
  const seasonStats = Keypair.generate().publicKey;

  it("computes canvas account space matching the on-chain layout", () => {
    // 8 + 32 + 2 + 2 + 4 + w*h + 1
    expect(canvasAccountSpace(4, 4)).to.equal(65);
    expect(canvasAccountSpace(0, 0)).to.equal(49);
  });

  it("rejects a canvas too large for a single createAccount", async () => {
    let threw = false;
    try {
      await buildCreateCanvasAccountIx(
        {} as any,
        PROGRAM_ID,
        authority,
        512,
        512
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  it("builds a createAccount ix owned by the program", async () => {
    const conn = { getMinimumBalanceForRentExemption: async () => 1_000_000 };
    const { canvas, instruction, space } = await buildCreateCanvasAccountIx(
      conn as any,
      PROGRAM_ID,
      authority,
      4,
      4
    );
    expect(space).to.equal(65);
    // createAccount assigns ownership to the program (last 32 bytes of data).
    const ownerFromData = new PublicKey(instruction.data.subarray(-32));
    expect(ownerFromData.equals(PROGRAM_ID)).to.equal(true);
    // The new account must sign.
    const canvasMeta = instruction.keys.find((k) =>
      k.pubkey.equals(canvas.publicKey)
    );
    expect(canvasMeta?.isSigner).to.equal(true);
  });

  it("builds delegate_canvas with the canvas as a required signer", async () => {
    const canvas = Keypair.generate().publicKey;
    const ix = await buildDelegateCanvasIx(program, {
      payer: authority,
      canvas,
      season,
      game,
    });
    expect(ix.programId.equals(PROGRAM_ID)).to.equal(true);
    const canvasMeta = ix.keys.find((k) => k.pubkey.equals(canvas));
    expect(canvasMeta?.isSigner).to.equal(true);
    // Delegation record PDA for the canvas is present.
    const record = deriveDelegationRecordPda(canvas);
    expect(ix.keys.some((k) => k.pubkey.equals(record))).to.equal(true);
    expect(
      ix.keys.some((k) => k.pubkey.equals(DELEGATION_PROGRAM_ID))
    ).to.equal(true);
  });

  it("builds delegate_any for season stats signed only by the admin", async () => {
    const ix = await buildDelegateSeasonStatsIx(program, {
      payer: authority,
      seasonStats,
      season,
      game,
    });
    expect(ix.programId.equals(PROGRAM_ID)).to.equal(true);
    // The PDA target is not a signer — the program signs via seeds.
    const statsMeta = ix.keys.find((k) => k.pubkey.equals(seasonStats));
    expect(statsMeta?.isSigner).to.equal(false);
  });

  it("builds delegate_any for a player's own PDAs, signed by the player", async () => {
    const wallet = Keypair.generate().publicKey;
    const [player] = derivePlayerPda(PROGRAM_ID, wallet);
    const [profile] = deriveSeasonProfilePda(PROGRAM_ID, season, wallet);

    const playerIx = await buildDelegatePlayerIx(program, {
      payer: wallet,
      wallet,
      season,
      game,
    });
    const profileIx = await buildDelegateSeasonProfileIx(program, {
      payer: wallet,
      wallet,
      season,
      game,
    });

    // Each ix targets the correct PDA...
    expect(playerIx.keys.some((k) => k.pubkey.equals(player))).to.equal(true);
    expect(profileIx.keys.some((k) => k.pubkey.equals(profile))).to.equal(true);
    // ...and the wallet is the fee-paying signer (the PDA is not).
    expect(
      playerIx.keys.find((k) => k.pubkey.equals(wallet))?.isSigner
    ).to.equal(true);
    expect(
      playerIx.keys.find((k) => k.pubkey.equals(player))?.isSigner
    ).to.equal(false);
  });

  it("assembles a single tx: create + start + both delegations", async () => {
    const conn = { getMinimumBalanceForRentExemption: async () => 1_000_000 };
    const args: StartSeasonArgs = {
      seasonId: 7,
      title: "S7",
      description: "d",
      palette: [0x000000ff, 0xffffffff],
      imageUri: "ipfs://x",
      canvasWidth: 4,
      canvasHeight: 4,
      startTime: new BN(1_000),
      endTime: new BN(2_000),
    };
    const result = await buildCreateSeasonWithDelegationTx(
      conn as any,
      program,
      {
        authority,
        game,
        args,
      }
    );
    expect(result.instructions.length).to.equal(4);
    expect(result.transaction.instructions.length).to.equal(4);
    // The ephemeral canvas keypair is returned so the caller can partial-sign.
    expect(result.canvas.publicKey).to.be.instanceOf(PublicKey);
    // start_season and delegate_canvas both reference the same canvas account.
    const [, startSeasonIx, delegateCanvasIx] = result.instructions;
    const inStart = startSeasonIx.keys.some((k) =>
      k.pubkey.equals(result.canvas.publicKey)
    );
    const inDelegate = delegateCanvasIx.keys.some((k) =>
      k.pubkey.equals(result.canvas.publicKey)
    );
    expect(inStart && inDelegate).to.equal(true);
  });

  const planArgs = (w: number, h: number): StartSeasonArgs => ({
    seasonId: 9,
    title: "S9",
    description: "d",
    palette: [0x000000ff, 0xffffffff],
    imageUri: "ipfs://x",
    canvasWidth: w,
    canvasHeight: h,
    startTime: new BN(1_000),
    endTime: new BN(2_000),
  });
  const conn = { getMinimumBalanceForRentExemption: async () => 1_000_000 };

  it("plans a single step for a small canvas", async () => {
    const plan = await buildCreateSeasonPlan(conn as any, program, {
      authority,
      game,
      args: planArgs(64, 64),
    });
    expect(plan.steps.length).to.equal(1);
    // create + start + delegate_canvas + delegate_stats.
    expect(plan.steps[0].instructions.length).to.equal(4);
    expect(
      plan.steps[0].signers[0].publicKey.equals(plan.canvas.publicKey)
    ).to.equal(true);
  });

  for (const dim of [256, 512]) {
    it(`plans two steps for a ${dim}x${dim} canvas`, async () => {
      const plan = await buildCreateSeasonPlan(conn as any, program, {
        authority,
        game,
        args: planArgs(dim, dim),
      });
      expect(plan.steps.length).to.equal(2);
      // Step 1 is a lone createAccount; the canvas keypair signs it.
      expect(plan.steps[0].instructions.length).to.equal(1);
      expect(
        plan.steps[0].signers[0].publicKey.equals(plan.canvas.publicKey)
      ).to.equal(true);
      // Step 2 is start_season + both delegations; canvas co-signs delegate.
      expect(plan.steps[1].instructions.length).to.equal(3);
      const [startIx, delegateCanvasIx] = plan.steps[1].instructions;
      expect(
        startIx.keys.some((k) => k.pubkey.equals(plan.canvas.publicKey))
      ).to.equal(true);
      expect(
        delegateCanvasIx.keys.some((k) =>
          k.pubkey.equals(plan.canvas.publicKey)
        )
      ).to.equal(true);
    });
  }

  it("rejects a canvas beyond the 10 MiB account cap", async () => {
    // 4096x4096 = ~16 MiB of pixels, over MAX_PERMITTED_DATA_LENGTH.
    let threw = false;
    try {
      await buildCreateSeasonPlan(conn as any, program, {
        authority,
        game,
        args: planArgs(4096, 4096),
      });
    } catch (e) {
      threw = e instanceof RangeError;
    }
    expect(threw).to.equal(true);
  });
});

describe("event parsing", () => {
  it("round-trips a PixelPainted event through the IDL coder", () => {
    const { BorshCoder } = require("@coral-xyz/anchor");
    const coder = new BorshCoder(pixlIdl);
    // The borsh coder encodes using the IDL's snake_case field names.
    const data = {
      player: Keypair.generate().publicKey,
      season: Keypair.generate().publicKey,
      x: 5,
      y: 2,
      old_color_index: 0,
      new_color_index: 3,
      timestamp: new BN(1_700_000_000),
    };
    // Anchor logs events as `discriminator(8) || borsh(fields)`, base64-encoded.
    const discriminator = Buffer.from(
      pixlIdl.events.find((e: any) => e.name === "PixelPainted").discriminator
    );
    const encoded = Buffer.concat([
      discriminator,
      coder.types.encode("PixelPainted", data),
    ]).toString("base64");
    const event = decodePixlEvent(pixlIdl, encoded);

    expect(event).to.not.equal(null);
    expect(event!.name).to.equal("PixelPainted");
    if (event!.name === "PixelPainted") {
      expect(event!.data.x).to.equal(5);
      expect(event!.data.newColorIndex).to.equal(3);
      expect(event!.data.timestamp.toString()).to.equal("1700000000");
    }
  });
});

describe("bootstrap builders", () => {
  const wallet = Keypair.generate().publicKey;
  const [seasonPda] = deriveSeasonPda(PROGRAM_ID, 1);

  // Read-only program instance for building instructions (no signing/sending).
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const provider = new AnchorProvider(
    connection,
    { publicKey: wallet } as any,
    { commitment: "confirmed" }
  );
  const program = new Program(pixlIdl, provider) as any;

  it("resolves the four bootstrap PDAs", () => {
    const r = resolveBootstrapAccounts(PROGRAM_ID, wallet, seasonPda);
    expect(r.game.equals(deriveGamePda(PROGRAM_ID)[0])).to.equal(true);
    expect(r.player.equals(derivePlayerPda(PROGRAM_ID, wallet)[0])).to.equal(
      true
    );
    expect(
      r.seasonStats.equals(deriveSeasonStatsPda(PROGRAM_ID, seasonPda)[0])
    ).to.equal(true);
    expect(
      r.seasonProfile.equals(
        deriveSeasonProfilePda(PROGRAM_ID, seasonPda, wallet)[0]
      )
    ).to.equal(true);
  });

  it("buildInitPlayerIx sets correct program id, signer, and writable metas", async () => {
    const ix = await buildInitPlayerIx(program, { wallet });
    const [game] = deriveGamePda(PROGRAM_ID);
    const [player] = derivePlayerPda(PROGRAM_ID, wallet);
    expect(ix.programId.equals(PROGRAM_ID)).to.equal(true);
    const byKey = (k: PublicKey) => ix.keys.find((m) => m.pubkey.equals(k))!;
    expect(byKey(wallet).isSigner).to.equal(true);
    expect(byKey(wallet).isWritable).to.equal(true);
    expect(byKey(game).isWritable).to.equal(true);
    expect(byKey(player).isWritable).to.equal(true);
    expect(byKey(SystemProgram.programId)).to.not.equal(undefined);
  });

  it("buildJoinSeasonIx wires player, season, stats, profile with session payer", async () => {
    const payer = Keypair.generate().publicKey;
    const ix = await buildJoinSeasonIx(program, {
      payer,
      wallet,
      season: seasonPda,
    });
    const [profile] = deriveSeasonProfilePda(PROGRAM_ID, seasonPda, wallet);
    const [stats] = deriveSeasonStatsPda(PROGRAM_ID, seasonPda);
    const has = (k: PublicKey) => ix.keys.some((m) => m.pubkey.equals(k));
    expect(ix.programId.equals(PROGRAM_ID)).to.equal(true);
    expect(has(seasonPda)).to.equal(true);
    expect(has(stats)).to.equal(true);
    expect(has(profile)).to.equal(true);
    // The session key (payer) signs; the wallet is only a PDA seed, not a key.
    const p = ix.keys.find((m) => m.pubkey.equals(payer))!;
    expect(p.isSigner).to.equal(true);
  });
});

describe("deriveBootstrapStatus", () => {
  const base = {
    connected: true,
    game: {},
    season: { completed: false, startTime: 0, endTime: 1000 } as any,
    player: {},
    seasonProfile: {},
    session: {
      sessionSigner: "s",
      sessionToken: "t",
      validUntil: 999,
      nonce: 1,
    },
    now: 500,
  };

  it("disconnected when wallet not connected", () => {
    expect(deriveBootstrapStatus({ ...base, connected: false })).to.equal(
      "disconnected"
    );
  });
  it("connecting when game not yet fetched", () => {
    expect(deriveBootstrapStatus({ ...base, game: undefined as any })).to.equal(
      "connecting"
    );
  });
  it("game_missing when game fetch returned null", () => {
    expect(deriveBootstrapStatus({ ...base, game: null })).to.equal(
      "game_missing"
    );
  });
  it("loading_game when season not yet fetched", () => {
    expect(
      deriveBootstrapStatus({ ...base, season: undefined as any })
    ).to.equal("loading_game");
  });
  it("no_active_season when current_season is zero", () => {
    expect(deriveBootstrapStatus({ ...base, season: "zero" as any })).to.equal(
      "no_active_season"
    );
  });
  it("no_active_season when completed", () => {
    expect(
      deriveBootstrapStatus({
        ...base,
        season: { completed: true, startTime: 0, endTime: 1000 },
      })
    ).to.equal("no_active_season");
  });
  it("no_active_season when now outside window", () => {
    expect(
      deriveBootstrapStatus({
        ...base,
        season: { completed: false, startTime: 0, endTime: 100 },
        now: 500,
      })
    ).to.equal("no_active_season");
  });
  it("loading_player when season loaded but player null-vs-loading unknown", () => {
    // player === undefined means still loading
    expect(
      deriveBootstrapStatus({ ...base, player: undefined as any })
    ).to.equal("loading_player");
  });
  it("player_missing when player fetch returned null", () => {
    expect(deriveBootstrapStatus({ ...base, player: null })).to.equal(
      "player_missing"
    );
  });
  it("loading_profile when profile still loading", () => {
    expect(
      deriveBootstrapStatus({ ...base, seasonProfile: undefined as any })
    ).to.equal("loading_profile");
  });
  it("season_profile_missing when profile null", () => {
    expect(deriveBootstrapStatus({ ...base, seasonProfile: null })).to.equal(
      "season_profile_missing"
    );
  });
  it("session_missing when no session", () => {
    expect(deriveBootstrapStatus({ ...base, session: null })).to.equal(
      "session_missing"
    );
  });
  it("session_expired when validUntil in the past", () => {
    expect(
      deriveBootstrapStatus({
        ...base,
        session: {
          sessionSigner: "s",
          sessionToken: "t",
          validUntil: 100,
          nonce: 1,
        },
        now: 500,
      })
    ).to.equal("session_expired");
  });
  it("ready when everything present and session valid", () => {
    expect(deriveBootstrapStatus(base)).to.equal("ready");
  });
});

describe("normalizeError", () => {
  it("detects user rejection", () => {
    const r = normalizeError(new Error("User rejected the request"));
    expect(r.title).to.equal("Signature rejected");
  });
  it("detects insufficient funds", () => {
    const r = normalizeError(
      new Error(
        "Attempt to debit an account but found no record of a prior credit"
      )
    );
    expect(r.title).to.equal("Insufficient SOL");
  });
  it("surfaces named anchor error codes", () => {
    const r = normalizeError(
      new Error("custom program error: SeasonNotActive")
    );
    expect(r.detail).to.contain("SeasonNotActive");
  });
  it("falls back to raw message", () => {
    const r = normalizeError(new Error("boom"));
    expect(r.detail).to.contain("boom");
  });
  it("handles non-Error values", () => {
    const r = normalizeError("weird");
    expect(r.detail).to.contain("weird");
  });
});

describe("camera math", () => {
  const CANVAS = { width: 256, height: 256 };

  it("fitScale uses the limiting dimension (contain)", () => {
    // Wide viewport -> height is limiting.
    expect(fitScale({ width: 1024, height: 512 }, CANVAS)).to.equal(2);
    // Tall viewport -> width is limiting.
    expect(fitScale({ width: 512, height: 1024 }, CANVAS)).to.equal(2);
  });

  it("fitScale rejects a degenerate canvas", () => {
    expect(() =>
      fitScale({ width: 100, height: 100 }, { width: 0, height: 10 })
    ).to.throw();
  });

  it("fitCamera centers the canvas in the viewport", () => {
    const cam = fitCamera({ width: 1024, height: 512 }, CANVAS);
    expect(cam.scale).to.equal(2);
    // 256*2 = 512 wide, centered in 1024 -> offsetX = (1024-512)/2 = 256.
    expect(cam.offsetX).to.equal(256);
    // 256*2 = 512 tall, exactly fills height -> offsetY = 0.
    expect(cam.offsetY).to.equal(0);
  });

  it("centerCamera positions a given scale", () => {
    const cam = centerCamera(4, { width: 2048, height: 2048 }, CANVAS);
    expect(cam.offsetX).to.equal((2048 - 256 * 4) / 2);
    expect(cam.offsetY).to.equal(cam.offsetX);
  });

  it("clampScale bounds and validates", () => {
    expect(clampScale(1000)).to.equal(MAX_SCALE);
    expect(clampScale(0.001)).to.equal(MIN_SCALE);
    expect(clampScale(3)).to.equal(3);
    expect(() => clampScale(1, 5, 2)).to.throw();
  });

  it("screenToCanvas and cellToScreen are inverses at cell corners", () => {
    const cam = { scale: 10, offsetX: 100, offsetY: 50 };
    const corner = cellToScreen(cam, 7, 3);
    const back = screenToCanvas(cam, corner.x, corner.y);
    expect(back.x).to.be.closeTo(7, 1e-9);
    expect(back.y).to.be.closeTo(3, 1e-9);
  });

  it("screenToCell floors into the containing cell", () => {
    const cam = { scale: 10, offsetX: 0, offsetY: 0 };
    // Anywhere inside cell (2,4) -> [20,30) x [40,50) maps to (2,4).
    expect(screenToCell(cam, 25, 49, CANVAS)).to.deep.equal({ x: 2, y: 4 });
    expect(screenToCell(cam, 20, 40, CANVAS)).to.deep.equal({ x: 2, y: 4 });
  });

  it("screenToCell returns null outside the canvas", () => {
    const cam = { scale: 10, offsetX: 0, offsetY: 0 };
    expect(screenToCell(cam, -1, 5, CANVAS)).to.equal(null);
    expect(screenToCell(cam, 5, -1, CANVAS)).to.equal(null);
    // x = 256 is out of [0,256).
    expect(screenToCell(cam, 2560, 5, CANVAS)).to.equal(null);
  });

  it("zoomAt keeps the anchored canvas point under the cursor", () => {
    const cam = { scale: 4, offsetX: 30, offsetY: 60 };
    const anchorX = 200;
    const anchorY = 140;
    const before = screenToCanvas(cam, anchorX, anchorY);
    const zoomed = zoomAt(cam, 2, anchorX, anchorY);
    const after = screenToCanvas(zoomed, anchorX, anchorY);
    expect(zoomed.scale).to.equal(8);
    expect(after.x).to.be.closeTo(before.x, 1e-9);
    expect(after.y).to.be.closeTo(before.y, 1e-9);
  });

  it("zoomAt does not move the camera when clamped", () => {
    const cam = { scale: MAX_SCALE, offsetX: 10, offsetY: 20 };
    expect(zoomAt(cam, 2, 100, 100)).to.equal(cam);
  });

  it("panBy translates the offset", () => {
    const cam = { scale: 4, offsetX: 10, offsetY: 20 };
    const p = panBy(cam, -5, 15);
    expect(p).to.deep.equal({ scale: 4, offsetX: 5, offsetY: 35 });
  });

  it("clampOffset keeps a margin of canvas on-screen", () => {
    const vp = { width: 800, height: 600 };
    const cam = { scale: 4, offsetX: 100000, offsetY: -100000 };
    const c = clampOffset(cam, vp, CANVAS, 24);
    const spanX = 256 * 4;
    const spanY = 256 * 4;
    // Dragged far right -> offset capped at viewport.width - margin.
    expect(c.offsetX).to.equal(vp.width - 24);
    // Dragged far up -> offset floored at margin - span.
    expect(c.offsetY).to.equal(24 - spanY);
    expect(spanX).to.equal(1024);
  });

  it("shouldShowGrid honors the threshold", () => {
    expect(shouldShowGrid(GRID_SCALE_THRESHOLD)).to.equal(true);
    expect(shouldShowGrid(GRID_SCALE_THRESHOLD - 0.01)).to.equal(false);
  });
});

describe("season history", () => {
  const NOW = 1_000;

  it("classifies by completed flag and time window", () => {
    expect(
      classifySeason({ completed: true, startTime: 0, endTime: 2000 }, NOW)
    ).to.equal("ended");
    expect(
      classifySeason({ completed: false, startTime: 1500, endTime: 2000 }, NOW)
    ).to.equal("upcoming");
    expect(
      classifySeason({ completed: false, startTime: 500, endTime: 2000 }, NOW)
    ).to.equal("active");
    // now == endTime is past the half-open window -> ended.
    expect(
      classifySeason({ completed: false, startTime: 500, endTime: 1000 }, NOW)
    ).to.equal("ended");
  });

  it("normalizes a decoded account (BN timings) into a summary", () => {
    const season = deriveSeasonPda(PROGRAM_ID, 7)[0];
    const canvas = deriveCanvasPda(PROGRAM_ID, season)[0];
    const summary = toSeasonSummary(
      season,
      {
        id: 7,
        title: "Genesis",
        description: "d",
        palette: [0xff0000ff, 0x00ff00ff],
        imageUri: "ipfs://x",
        canvas,
        startTime: new BN(500),
        endTime: new BN(2000),
        completed: false,
      },
      NOW
    );
    expect(summary.address).to.equal(season.toBase58());
    expect(summary.id).to.equal(7);
    expect(summary.canvas).to.equal(canvas.toBase58());
    expect(summary.startTime).to.equal(500);
    expect(summary.endTime).to.equal(2000);
    expect(summary.palette).to.deep.equal([0xff0000ff, 0x00ff00ff]);
    expect(summary.status).to.equal("active");
  });

  it("sorts active, then upcoming, then ended; recent first within a group", () => {
    const mk = (
      id: number,
      status: SeasonSummary["status"],
      startTime: number
    ): SeasonSummary => ({
      address: String(id),
      id,
      title: "s",
      description: "",
      palette: [],
      imageUri: "",
      canvas: "c",
      startTime,
      endTime: startTime + 10,
      completed: status === "ended",
      status,
    });
    const sorted = sortSeasonsForDisplay([
      mk(1, "ended", 100),
      mk(2, "active", 50),
      mk(3, "ended", 300),
      mk(4, "upcoming", 200),
    ]);
    expect(sorted.map((s) => s.id)).to.deep.equal([2, 4, 3, 1]);
  });

  it("summarizes counts by status", () => {
    const counts = summarizeSeasonCounts([
      { status: "ended" } as SeasonSummary,
      { status: "ended" } as SeasonSummary,
      { status: "active" } as SeasonSummary,
    ]);
    expect(counts).to.deep.equal({ active: 1, upcoming: 0, ended: 2 });
  });
});

describe("community contribution", () => {
  it("derives contribution as a share of the community total", () => {
    expect(computeContributionPct(25, 100)).to.equal(25);
    expect(computeContributionPct(1, 3)).to.be.closeTo(33.333, 0.001);
  });

  it("treats a zero (or missing) community total as 0%", () => {
    expect(computeContributionPct(0, 0)).to.equal(0);
    expect(computeContributionPct(5, 0)).to.equal(0);
  });

  it("measures season progress by elapsed time, clamped to the window", () => {
    expect(computeSeasonProgressPct(100, 200, 150)).to.equal(50);
    expect(computeSeasonProgressPct(100, 200, 50)).to.equal(0); // before start
    expect(computeSeasonProgressPct(100, 200, 500)).to.equal(100); // after end
  });

  it("guards a degenerate window", () => {
    expect(computeSeasonProgressPct(200, 200, 150)).to.equal(0);
    expect(computeSeasonProgressPct(200, 200, 250)).to.equal(100);
  });

  it("never renders a nonzero share as a misleading 0%", () => {
    expect(formatPercent(0)).to.equal("0%");
    expect(formatPercent(0.02)).to.equal("<0.1%"); // tiny but real
    expect(formatPercent(33.333)).to.equal("33.3%");
    expect(formatPercent(50)).to.equal("50%"); // no trailing .0
    expect(formatPercent(100)).to.equal("100%");
  });

  it("ranks a player from the (pre-sorted) leaderboard", () => {
    const contributors = [
      { player: "a", pixelsPainted: 30, joinedAt: 1 },
      { player: "b", pixelsPainted: 20, joinedAt: 1 },
      { player: "c", pixelsPainted: 10, joinedAt: 1 },
    ];
    expect(rankOfPlayer("a", contributors)).to.equal(1);
    expect(rankOfPlayer("c", contributors)).to.equal(3);
    expect(rankOfPlayer("z", contributors)).to.equal(null);
  });
});

describe("admin: season lifecycle builders", () => {
  const dummyKey = Keypair.generate();
  const wallet = {
    publicKey: dummyKey.publicKey,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  const provider = new AnchorProvider(
    new Connection("http://localhost:8899"),
    wallet as any,
    {}
  );
  const program = new Program(pixlIdl as any, provider) as any;

  const authority = dummyKey.publicKey;
  const game = Keypair.generate().publicKey;
  const season = Keypair.generate().publicKey;
  const seasonStats = Keypair.generate().publicKey;
  const canvas = Keypair.generate().publicKey;

  it("builds end_season signed by the authority on L1", async () => {
    const ix = await buildEndSeasonIx(program, {
      authority,
      game,
      season,
      canvas,
    });
    expect(ix.programId.equals(program.programId)).to.equal(true);
    const authMeta = ix.keys.find((k) => k.pubkey.equals(authority));
    expect(authMeta?.isSigner).to.equal(true);
    // Canvas + season must be referenced.
    expect(ix.keys.some((k) => k.pubkey.equals(canvas))).to.equal(true);
    expect(ix.keys.some((k) => k.pubkey.equals(season))).to.equal(true);
  });

  it("builds commit_gameplay_state with the magic context and fee vault accounts", async () => {
    const magicFeeVault = PublicKey.unique();
    const ix = await buildCommitGameplayStateIx(program, {
      authority,
      season,
      seasonStats,
      canvas,
      magicFeeVault,
      undelegate: true,
    });
    const payerMeta = ix.keys.find((k) => k.pubkey.equals(authority));
    expect(payerMeta?.isSigner).to.equal(true);
    expect(ix.keys.some((k) => k.pubkey.equals(MAGIC_PROGRAM_ID))).to.equal(
      true
    );
    expect(ix.keys.some((k) => k.pubkey.equals(MAGIC_CONTEXT_ID))).to.equal(
      true
    );
    // The validator fee vault must be present and writable.
    const vaultMeta = ix.keys.find((k) => k.pubkey.equals(magicFeeVault));
    expect(vaultMeta?.isWritable).to.equal(true);
    // The delegated fee payer PDA must be present and writable.
    const feePayer = deriveFeePayerPda(program.programId);
    const feePayerMeta = ix.keys.find((k) => k.pubkey.equals(feePayer));
    expect(feePayerMeta?.isWritable).to.equal(true);
  });
});

describe("snapshot export", () => {
  const palette = [0xff0000ff, 0x00ff00ff];

  it("resolves palette indices, transparent for out-of-range", () => {
    expect(paletteIndexToRgba(palette, 0)).to.deep.equal({
      r: 255,
      g: 0,
      b: 0,
      a: 255,
    });
    expect(paletteIndexToRgba(palette, 9)).to.deep.equal({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it("builds a snapshot and rejects a size mismatch", () => {
    const snap = canvasToSnapshot({
      width: 2,
      height: 1,
      palette,
      pixels: [0, 1],
    });
    expect(snap).to.deep.equal({
      width: 2,
      height: 1,
      palette,
      indices: [0, 1],
    });
    expect(() =>
      canvasToSnapshot({ width: 2, height: 2, palette, pixels: [0, 1] })
    ).to.throw(/does not match/);
  });

  it("rasterizes to an RGBA byte buffer", () => {
    const snap = canvasToSnapshot({
      width: 2,
      height: 1,
      palette,
      pixels: [0, 1],
    });
    const bytes = snapshotToRgbaBytes(snap);
    expect([...bytes]).to.deep.equal([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(JSON.parse(snapshotToJson(snap)).width).to.equal(2);
  });
});

describe("sortContributors", () => {
  it("sorts by pixels desc then player base58 asc", () => {
    const { sortContributors } = require("./seasons");
    const out = sortContributors([
      { player: "C", pixelsPainted: 7, joinedAt: 1 },
      { player: "A", pixelsPainted: 7, joinedAt: 1 },
      { player: "B", pixelsPainted: 9, joinedAt: 1 },
    ]);
    expect(out.map((c) => c.player)).to.deep.equal(["B", "A", "C"]);
  });
});
