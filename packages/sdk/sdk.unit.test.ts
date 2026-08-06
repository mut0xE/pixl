import { expect } from "chai";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import {
  deriveGamePda,
  deriveSeasonPda,
  deriveCanvasPda,
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
  deriveDelegationRecordPda,
  DELEGATION_PROGRAM_ID,
  resolveBootstrapAccounts,
  buildInitPlayerIx,
  buildJoinSeasonIx,
  deriveBootstrapStatus,
  type StartSeasonArgs,
} from "./index";
import { SystemProgram } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("A7fbbwXrM1zSUbqEBzF7MvXKaNGqnZjpNVBAA8Fb6GyQ");
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
      deriveSeasonPda(PROGRAM_ID, 1)[0].equals(deriveSeasonPda(PROGRAM_ID, 2)[0])
    ).to.equal(false);
  });

  it("rejects out-of-range season ids", () => {
    expect(() => deriveSeasonPda(PROGRAM_ID, -1)).to.throw(RangeError);
    expect(() => deriveSeasonPda(PROGRAM_ID, 0x1_0000_0000)).to.throw(RangeError);
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
    expect(() =>
      assertStatsBelongToSeason({ season }, season)
    ).to.not.throw();
  });

  it("rejects mismatches", () => {
    const other = Keypair.generate().publicKey;
    expect(() =>
      assertSeasonBelongsToGame({ game: other }, season, { currentSeason: season }, game)
    ).to.throw();
    expect(() => assertCanvasBelongsToSeason({ season: other }, season)).to.throw();
    expect(() => assertPlayerOwnedBy({ wallet: other }, wallet)).to.throw();
    expect(() => assertProfileMatches({ season, player: other }, season, player)).to.throw();
    expect(() => assertStatsBelongToSeason({ season: other }, season)).to.throw();
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
    const result = await buildCreateSeasonWithDelegationTx(conn as any, program, {
      authority,
      game,
      args,
    });
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
    expect(r.player.equals(derivePlayerPda(PROGRAM_ID, wallet)[0])).to.equal(true);
    expect(r.seasonStats.equals(deriveSeasonStatsPda(PROGRAM_ID, seasonPda)[0])).to.equal(true);
    expect(
      r.seasonProfile.equals(deriveSeasonProfilePda(PROGRAM_ID, seasonPda, wallet)[0])
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

  it("buildJoinSeasonIx wires player, season, stats, profile", async () => {
    const ix = await buildJoinSeasonIx(program, { wallet, season: seasonPda });
    const [profile] = deriveSeasonProfilePda(PROGRAM_ID, seasonPda, wallet);
    const [stats] = deriveSeasonStatsPda(PROGRAM_ID, seasonPda);
    const has = (k: PublicKey) => ix.keys.some((m) => m.pubkey.equals(k));
    expect(ix.programId.equals(PROGRAM_ID)).to.equal(true);
    expect(has(seasonPda)).to.equal(true);
    expect(has(stats)).to.equal(true);
    expect(has(profile)).to.equal(true);
    const w = ix.keys.find((m) => m.pubkey.equals(wallet))!;
    expect(w.isSigner).to.equal(true);
  });
});

describe("deriveBootstrapStatus", () => {
  const base = {
    connected: true,
    game: {},
    season: { completed: false, startTime: 0, endTime: 1000 } as any,
    player: {},
    seasonProfile: {},
    session: { sessionSigner: "s", sessionToken: "t", validUntil: 999 },
    now: 500,
  };

  it("disconnected when wallet not connected", () => {
    expect(deriveBootstrapStatus({ ...base, connected: false })).to.equal("disconnected");
  });
  it("loading_game when game not yet fetched", () => {
    expect(deriveBootstrapStatus({ ...base, game: null })).to.equal("loading_game");
  });
  it("no_active_season when current_season is zero", () => {
    expect(deriveBootstrapStatus({ ...base, season: "zero" as any })).to.equal("no_active_season");
  });
  it("no_active_season when completed", () => {
    expect(
      deriveBootstrapStatus({ ...base, season: { completed: true, startTime: 0, endTime: 1000 } })
    ).to.equal("no_active_season");
  });
  it("no_active_season when now outside window", () => {
    expect(
      deriveBootstrapStatus({ ...base, season: { completed: false, startTime: 0, endTime: 100 }, now: 500 })
    ).to.equal("no_active_season");
  });
  it("loading_player when season loaded but player null-vs-loading unknown", () => {
    // player === undefined means still loading
    expect(deriveBootstrapStatus({ ...base, player: undefined as any })).to.equal("loading_player");
  });
  it("player_missing when player fetch returned null", () => {
    expect(deriveBootstrapStatus({ ...base, player: null })).to.equal("player_missing");
  });
  it("loading_profile when profile still loading", () => {
    expect(deriveBootstrapStatus({ ...base, seasonProfile: undefined as any })).to.equal("loading_profile");
  });
  it("season_profile_missing when profile null", () => {
    expect(deriveBootstrapStatus({ ...base, seasonProfile: null })).to.equal("season_profile_missing");
  });
  it("session_missing when no session", () => {
    expect(deriveBootstrapStatus({ ...base, session: null })).to.equal("session_missing");
  });
  it("session_expired when validUntil in the past", () => {
    expect(
      deriveBootstrapStatus({ ...base, session: { sessionSigner: "s", sessionToken: "t", validUntil: 100 }, now: 500 })
    ).to.equal("session_expired");
  });
  it("ready when everything present and session valid", () => {
    expect(deriveBootstrapStatus(base)).to.equal("ready");
  });
});
