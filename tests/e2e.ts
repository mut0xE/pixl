import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  assertSystemWallet,
  assertDefaultCanvasState,
  assertDefaultPlayerState,
  buildSeasonArgs,
  createCanvasAccount,
  deriveBufferPda,
  deriveDelegationMetadataPda,
  deriveDelegationRecordPda,
  derivePlayerAddress,
  deriveSeasonAddressSet,
  deriveSeasonProfileAddress,
  ensureJoinedSeason,
  ensureGameInitialized,
  ensurePlayerInitialized,
  createFundedPlayer,
  fetchCanvasAccount,
  getAdminContext,
  getWalletContext,
  getMagicBlockConfig,
  hasMagicBlockEnv,
  logSection,
  resetToCleanSlate,
  resolveDelegationTarget,
  resolveDelegationValidator,
  waitForAccountOwner,
  waitForErDelegated,
  waitForL1CanvasPixel,
  waitUntilSeasonCanEnd,
  withRetry,
  type TestWorld,
} from "./helpers";
import { createSessionV2, paintWithSession } from "../packages/sdk";
import {
  withAccountDiff,
  worldAccountRefs,
  snapshotAccounts,
  logDiff,
  logSnapshot,
  type AccountRef,
} from "./account-log";

describe("pixl success paths", () => {
  const admin = getAdminContext();
  const world = {} as TestWorld;

  before(async () => {
    world.admin = admin;
    world.gamePda = admin.gamePda;
    await ensureGameInitialized(admin);
    world.playerWallet = await createFundedPlayer(admin);

    logSection("environment", {
      l1RpcUrl: getMagicBlockConfig().l1RpcUrl,
      erRpcUrl: getMagicBlockConfig().erRpcUrl,
      admin: admin.provider.wallet.publicKey.toBase58(),
      player: world.playerWallet.publicKey.toBase58(),
      programId: admin.program.programId.toBase58(),
    });

    await withRetry(() => resetToCleanSlate(admin, world.playerWallet), {
      label: "reset",
    });
  });

  it("init_game: admin initializes the game PDA", async () => {
    const signature = await withAccountDiff(
      {
        title: "init_game",
        program: admin.program,
        refs: [{ label: "game", kind: "game", address: world.gamePda }],
        source: "L1",
      },
      () => ensureGameInitialized(admin)
    );
    const game = (await admin.program.account.game.fetch(world.gamePda)) as any;

    logSection("init_game", {
      signature,
      game: world.gamePda.toBase58(),
      authority: game.authority.toBase58(),
    });

    expect(game.authority.equals(admin.provider.wallet.publicKey)).to.equal(
      true
    );
  });

  it("start_season: admin creates season, season stats, and canvas", async () => {
    const args = buildSeasonArgs();
    const { seasonPda, seasonStatsPda } = deriveSeasonAddressSet(
      admin.program.programId,
      args.seasonId
    );
    const canvasKeypair = Keypair.generate();

    await createCanvasAccount(
      admin.provider,
      admin.program.programId,
      canvasKeypair,
      args.canvasWidth ?? 4,
      args.canvasHeight ?? 4
    );

    const startSeasonRefs: AccountRef[] = [
      { label: "game", kind: "game", address: world.gamePda },
      { label: "season", kind: "season", address: seasonPda },
      { label: "seasonStats", kind: "seasonStats", address: seasonStatsPda },
      { label: "canvas", kind: "canvas", address: canvasKeypair.publicKey },
    ];
    const signature = await withAccountDiff(
      {
        title: "start_season",
        program: admin.program,
        refs: startSeasonRefs,
        source: "L1",
      },
      () =>
        (admin.program.methods as any)
          .startSeason(args)
          .accounts({
            authority: admin.provider.wallet.publicKey,
            game: world.gamePda,
            season: seasonPda,
            seasonStats: seasonStatsPda,
            canvas: canvasKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc()
    );

    world.seasonId = args.seasonId;
    world.seasonPda = seasonPda;
    world.seasonStatsPda = seasonStatsPda;
    world.canvasKeypair = canvasKeypair;
    world.seasonEndTime = args.endTime.toNumber();
    world.createdFreshSeason = true;
    const canvasPublicKey = canvasKeypair.publicKey;

    const [game, season, seasonStats, canvas] = (await Promise.all([
      admin.program.account.game.fetch(world.gamePda),
      admin.program.account.season.fetch(world.seasonPda),
      admin.program.account.seasonStats.fetch(world.seasonStatsPda),
      fetchCanvasAccount(admin.provider.connection, canvasPublicKey),
    ])) as any;

    world.playerPda = derivePlayerAddress(
      admin.program.programId,
      world.playerWallet.publicKey
    );
    world.seasonProfilePda = deriveSeasonProfileAddress(
      admin.program.programId,
      world.seasonPda,
      world.playerWallet.publicKey
    );

    logSection("start_season", {
      signature,
      seasonId: world.seasonId,
      season: world.seasonPda.toBase58(),
      seasonStats: world.seasonStatsPda.toBase58(),
      canvas: canvasPublicKey.toBase58(),
      createdFreshSeason: Boolean(world.createdFreshSeason),
    });

    expect(game.currentSeason.equals(world.seasonPda)).to.equal(true);
    expect(game.currentSeasonId).to.equal(world.seasonId);
    expect(season.canvas.equals(canvasPublicKey)).to.equal(true);
    expect(seasonStats.participantCount.toString()).to.equal("0");
    expect(assertDefaultCanvasState(canvas).firstPixel).to.equal(true);
  });

  it("init_player: player creates their player PDA", async () => {
    await assertSystemWallet(
      admin.provider.connection,
      world.playerWallet.publicKey
    );

    const signature = await withAccountDiff(
      {
        title: "init_player",
        program: admin.program,
        refs: [
          { label: "player", kind: "player", address: world.playerPda },
        ],
        source: "L1",
      },
      () =>
        ensurePlayerInitialized(
          admin,
          world.gamePda,
          world.playerPda,
          world.playerWallet
        )
    );

    const player = (await admin.program.account.player.fetch(
      world.playerPda
    )) as any;

    logSection("init_player", {
      signature,
      player: world.playerPda.toBase58(),
      wallet: world.playerWallet.publicKey.toBase58(),
    });

    const playerState = assertDefaultPlayerState(
      player,
      world.playerWallet.publicKey
    );
    expect(playerState.walletMatches).to.equal(true);
    expect(playerState.energy).to.equal(true);
    expect(playerState.maxEnergy).to.equal(true);
    expect(playerState.cooldown).to.equal(true);
  });

  it("join_season: player creates their season profile", async () => {
    const signature = await withAccountDiff(
      {
        title: "join_season",
        program: admin.program,
        refs: [
          {
            label: "seasonStats",
            kind: "seasonStats",
            address: world.seasonStatsPda,
          },
          {
            label: "seasonProfile",
            kind: "seasonProfile",
            address: world.seasonProfilePda,
          },
        ],
        source: "L1",
      },
      () =>
        ensureJoinedSeason(
          admin,
          world.playerWallet,
          world.playerPda,
          world.seasonPda,
          world.seasonStatsPda,
          world.seasonProfilePda
        )
    );

    const seasonProfileInfo = await admin.provider.connection.getAccountInfo(
      world.seasonProfilePda,
      "confirmed"
    );
    const seasonStats = (await admin.program.account.seasonStats.fetch(
      world.seasonStatsPda
    )) as any;

    logSection("join_season", {
      signature,
      seasonProfile: world.seasonProfilePda.toBase58(),
      participantCount: seasonStats.participantCount.toString(),
    });

    expect(seasonProfileInfo).to.not.equal(null);
    expect(seasonStats.participantCount.toString()).to.equal("1");
  });

  it("delegate_canvas: admin delegates the client-created canvas", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    const config = getMagicBlockConfig();
    const signature = await (admin.program.methods as any)
      .delegateCanvas()
      .accounts({
        payer: admin.provider.wallet.publicKey,
        bufferCanvas: deriveBufferPda(
          admin.program.programId,
          world.canvasKeypair.publicKey
        ),
        delegationRecordCanvas: deriveDelegationRecordPda(
          world.canvasKeypair.publicKey
        ),
        delegationMetadataCanvas: deriveDelegationMetadataPda(
          world.canvasKeypair.publicKey
        ),
        canvas: world.canvasKeypair.publicKey,
        season: world.seasonPda,
        game: world.gamePda,
        validator: resolveDelegationValidator(config),
        ownerProgram: admin.program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([world.canvasKeypair])
      .rpc();

    const target = await resolveDelegationTarget(world.canvasKeypair.publicKey);
    world.erRpcUrl = target.erRpcUrl;
    world.erValidator = target.validator;

    const baseInfo = await admin.provider.connection.getAccountInfo(
      world.canvasKeypair.publicKey,
      "confirmed"
    );
    const erAdmin = getAdminContext(world.erRpcUrl);
    await waitForErDelegated(
      erAdmin.provider.connection,
      world.canvasKeypair.publicKey,
      admin.program.programId,
      "canvas delegated clone on ER"
    );
    const erCanvas = await fetchCanvasAccount(
      erAdmin.provider.connection,
      world.canvasKeypair.publicKey
    );

    logSnapshot(
      "delegate_canvas: ER clone now live",
      await snapshotAccounts(erAdmin.program, [
        {
          label: "canvas",
          kind: "canvas",
          address: world.canvasKeypair.publicKey,
        },
      ]),
      "ER"
    );

    logSection("delegate_canvas", {
      signature,
      canvas: world.canvasKeypair.publicKey.toBase58(),
      erRpcUrl: world.erRpcUrl,
      erValidator: world.erValidator?.toBase58() ?? "(router-assigned)",
    });

    expect(baseInfo?.owner.equals(DELEGATION_PROGRAM_ID)).to.equal(true);
    expect(erCanvas.season.equals(world.seasonPda)).to.equal(true);
  });

  it("delegate_any: admin delegates season stats", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }

    const config = getMagicBlockConfig();
    const signature = await (admin.program.methods as any)
      .delegateAny({
        seasonStats: { season: world.seasonPda },
      })
      .accountsStrict({
        payer: admin.provider.wallet.publicKey,
        bufferTargetAccount: deriveBufferPda(
          admin.program.programId,
          world.seasonStatsPda
        ),
        delegationRecordTargetAccount: deriveDelegationRecordPda(
          world.seasonStatsPda
        ),
        delegationMetadataTargetAccount: deriveDelegationMetadataPda(
          world.seasonStatsPda
        ),
        targetAccount: world.seasonStatsPda,
        season: world.seasonPda,
        game: world.gamePda,
        validator: world.erValidator ?? resolveDelegationValidator(config),
        ownerProgram: admin.program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const erAdmin = getAdminContext(world.erRpcUrl!);
    await waitForErDelegated(
      erAdmin.provider.connection,
      world.seasonStatsPda,
      admin.program.programId,
      "season_stats delegated clone on ER"
    );
    const erSeasonStats = (await erAdmin.program.account.seasonStats.fetch(
      world.seasonStatsPda
    )) as any;

    logSnapshot(
      "delegate_any season_stats: ER clone now live",
      await snapshotAccounts(erAdmin.program, [
        {
          label: "seasonStats",
          kind: "seasonStats",
          address: world.seasonStatsPda,
        },
      ]),
      "ER"
    );

    logSection("delegate_any season_stats", {
      signature,
      seasonStats: world.seasonStatsPda.toBase58(),
      erRpcUrl: world.erRpcUrl,
    });

    expect(erSeasonStats.season.equals(world.seasonPda)).to.equal(true);
  });

  it("delegate_any: player delegates player and season profile", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    const config = getMagicBlockConfig();
    const playerSignature = await (admin.program.methods as any)
      .delegateAny({
        player: { wallet: world.playerWallet.publicKey },
      })
      .accountsStrict({
        payer: world.playerWallet.publicKey,
        bufferTargetAccount: deriveBufferPda(
          admin.program.programId,
          world.playerPda
        ),
        delegationRecordTargetAccount: deriveDelegationRecordPda(
          world.playerPda
        ),
        delegationMetadataTargetAccount: deriveDelegationMetadataPda(
          world.playerPda
        ),
        targetAccount: world.playerPda,
        season: world.seasonPda,
        game: world.gamePda,
        validator: world.erValidator ?? resolveDelegationValidator(config),
        ownerProgram: admin.program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([world.playerWallet])
      .rpc();

    const seasonProfileSignature = await (admin.program.methods as any)
      .delegateAny({
        seasonProfile: {
          season: world.seasonPda,
          wallet: world.playerWallet.publicKey,
        },
      })
      .accountsStrict({
        payer: world.playerWallet.publicKey,
        bufferTargetAccount: deriveBufferPda(
          admin.program.programId,
          world.seasonProfilePda
        ),
        delegationRecordTargetAccount: deriveDelegationRecordPda(
          world.seasonProfilePda
        ),
        delegationMetadataTargetAccount: deriveDelegationMetadataPda(
          world.seasonProfilePda
        ),
        targetAccount: world.seasonProfilePda,
        season: world.seasonPda,
        game: world.gamePda,
        validator: world.erValidator ?? resolveDelegationValidator(config),
        ownerProgram: admin.program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([world.playerWallet])
      .rpc();

    const erAdmin = getAdminContext(world.erRpcUrl!);
    await Promise.all([
      waitForErDelegated(
        erAdmin.provider.connection,
        world.playerPda,
        admin.program.programId,
        "player delegated clone on ER"
      ),
      waitForErDelegated(
        erAdmin.provider.connection,
        world.seasonProfilePda,
        admin.program.programId,
        "season_profile delegated clone on ER"
      ),
    ]);
    const [playerStatus, seasonProfileStatus] = await Promise.all([
      erAdmin.program.account.player.fetch(world.playerPda),
      erAdmin.program.account.seasonProfile.fetch(world.seasonProfilePda),
    ]);

    logSnapshot(
      "delegate_any player accounts: ER clones now live",
      await snapshotAccounts(erAdmin.program, [
        { label: "player", kind: "player", address: world.playerPda },
        {
          label: "seasonProfile",
          kind: "seasonProfile",
          address: world.seasonProfilePda,
        },
      ]),
      "ER"
    );

    logSection("delegate_any player accounts", {
      delegatePlayer: playerSignature,
      delegateSeasonProfile: seasonProfileSignature,
      player: world.playerPda.toBase58(),
      seasonProfile: world.seasonProfilePda.toBase58(),
      playerErRpcUrl: world.erRpcUrl,
      seasonProfileErRpcUrl: world.erRpcUrl,
    });

    expect(
      (playerStatus as any).wallet.equals(world.playerWallet.publicKey)
    ).to.equal(true);
    expect(
      (seasonProfileStatus as any).season.equals(world.seasonPda)
    ).to.equal(true);
  });

  it("paint_pixel: delegated player paints on the ER", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    const config = getMagicBlockConfig();
    const erPlayer = getWalletContext(world.erRpcUrl!, world.playerWallet);
    const signature = await withAccountDiff(
      {
        title: "paint_pixel",
        program: erPlayer.program,
        refs: worldAccountRefs(world),
        source: "ER",
      },
      () =>
        (erPlayer.program.methods as any)
          .paintPixel(1, 1, 1)
          .accounts({
            payer: world.playerWallet.publicKey,
            sessionToken: null,
            game: world.gamePda,
            season: world.seasonPda,
            canvas: world.canvasKeypair.publicKey,
            player: world.playerPda,
            seasonProfile: world.seasonProfilePda,
            seasonStats: world.seasonStatsPda,
          })
          .rpc()
    );

    const [player, seasonProfile, seasonStats, canvas] = (await Promise.all([
      erPlayer.program.account.player.fetch(world.playerPda),
      erPlayer.program.account.seasonProfile.fetch(world.seasonProfilePda),
      erPlayer.program.account.seasonStats.fetch(world.seasonStatsPda),
      fetchCanvasAccount(
        erPlayer.provider.connection,
        world.canvasKeypair.publicKey
      ),
    ])) as any;

    const paintedIndex = 1 * canvas.width + 1;

    logSection("paint_pixel", {
      signature,
      erRpcUrl: world.erRpcUrl,
      paintedIndex,
      newColorIndex: 1,
    });

    expect(canvas.pixels[paintedIndex]).to.equal(1);
    expect(player.availableEnergy).to.equal(5);
    expect(player.lifetimePixels.toString()).to.equal("1");
    expect(seasonProfile.pixelsPainted.toString()).to.equal("1");
    expect(seasonStats.totalPixelsPainted.toString()).to.equal("1");
  });

  it("paint_pixel: session key paints a loop on the ER (no wallet popup)", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    const { sessionKeypair, sessionToken } = await createSessionV2(
      world.admin.provider.connection,
      {
        programId: world.admin.program.programId,
        authoritySigner: world.playerWallet,
        validForSeconds: 60 * 60,
      }
    );

    const erSession = getWalletContext(world.erRpcUrl!, sessionKeypair);

    const before = (await erSession.program.account.player.fetch(
      world.playerPda
    )) as any;
    const startEnergy: number = before.availableEnergy;
    const startLifetime = BigInt(before.lifetimePixels.toString());

    const paints = [
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ];
    expect(startEnergy).to.be.greaterThanOrEqual(paints.length);

    const loopRefs = worldAccountRefs(world);
    const loopBefore = await snapshotAccounts(erSession.program, loopRefs);

    const signatures: string[] = [];
    for (const { x, y } of paints) {
      const signature = await paintWithSession(
        erSession.program,
        {
          wallet: world.playerWallet.publicKey,
          season: world.seasonPda,
          canvas: world.canvasKeypair.publicKey,
          sessionToken,
        },
        x,
        y,
        1
      );
      signatures.push(signature);
    }

    const [player, seasonProfile, canvas] = (await Promise.all([
      erSession.program.account.player.fetch(world.playerPda),
      erSession.program.account.seasonProfile.fetch(world.seasonProfilePda),
      fetchCanvasAccount(
        erSession.provider.connection,
        world.canvasKeypair.publicKey
      ),
    ])) as any;

    logDiff(
      "paint_pixel (session loop)",
      loopBefore,
      await snapshotAccounts(erSession.program, loopRefs),
      "ER"
    );

    logSection("paint_pixel (session loop)", {
      sessionSigner: sessionKeypair.publicKey.toBase58(),
      sessionToken: sessionToken.toBase58(),
      paints: paints.length,
      signatures,
      erRpcUrl: world.erRpcUrl,
    });

    for (const { x, y } of paints) {
      expect(canvas.pixels[y * canvas.width + x]).to.equal(1);
    }
    expect(player.availableEnergy).to.equal(startEnergy - paints.length);
    expect(BigInt(player.lifetimePixels.toString())).to.equal(
      startLifetime + BigInt(paints.length)
    );
    expect(seasonProfile.pixelsPainted.toString()).to.equal("4"); // 1 (prev test) + 3
  });

  it("commit_gameplay_state: admin checkpoints ER canvas + stats to L1", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    const config = getMagicBlockConfig();
    const erAdmin = getAdminContext(world.erRpcUrl!);
    const paintedIndex = 1 * 4 + 1; // (y=1, x=1) on the 4x4 test canvas

    const l1BeforeInfo = await admin.provider.connection.getAccountInfo(
      world.canvasKeypair.publicKey,
      "confirmed"
    );
    expect(l1BeforeInfo?.owner.equals(DELEGATION_PROGRAM_ID)).to.equal(true);

    const commitL1Refs: AccountRef[] = [
      {
        label: "canvas",
        kind: "canvas",
        address: world.canvasKeypair.publicKey,
      },
      {
        label: "seasonStats",
        kind: "seasonStats",
        address: world.seasonStatsPda,
      },
    ];
    const commitL1Before = await snapshotAccounts(admin.program, commitL1Refs);

    const signature = await (erAdmin.program.methods as any)
      .commitGameplayState(false)
      .accounts({
        payer: admin.provider.wallet.publicKey,
        season: world.seasonPda,
        seasonStats: world.seasonStatsPda,
        canvas: world.canvasKeypair.publicKey,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .rpc();

    await waitForL1CanvasPixel(
      admin.provider.connection,
      world.canvasKeypair.publicKey,
      paintedIndex,
      1,
      "committed canvas pixel on L1"
    );

    const l1AfterInfo = await admin.provider.connection.getAccountInfo(
      world.canvasKeypair.publicKey,
      "confirmed"
    );

    logDiff(
      "commit_gameplay_state (L1 catching up to ER)",
      commitL1Before,
      await snapshotAccounts(admin.program, commitL1Refs),
      "L1"
    );

    logSection("commit_gameplay_state", {
      signature,
      canvas: world.canvasKeypair.publicKey.toBase58(),
      paintedIndex,
    });

    expect(l1AfterInfo?.owner.equals(DELEGATION_PROGRAM_ID)).to.equal(true);
  });

  it("commit_gameplay_state(undelegate=true): checkpoints canvas, returns stats to L1", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    await waitUntilSeasonCanEnd(world);

    const config = getMagicBlockConfig();
    const erAdmin = getAdminContext(world.erRpcUrl!);

    const sharedL1Refs: AccountRef[] = [
      {
        label: "seasonStats",
        kind: "seasonStats",
        address: world.seasonStatsPda,
      },
      {
        label: "canvas",
        kind: "canvas",
        address: world.canvasKeypair.publicKey,
      },
    ];
    const sharedL1Before = await snapshotAccounts(admin.program, sharedL1Refs);

    const signature = await (erAdmin.program.methods as any)
      .commitGameplayState(true)
      .accounts({
        payer: admin.provider.wallet.publicKey,
        season: world.seasonPda,
        seasonStats: world.seasonStatsPda,
        canvas: world.canvasKeypair.publicKey,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .rpc();

    await waitForAccountOwner(
      admin.provider.connection,
      world.seasonStatsPda,
      admin.program.programId,
      "season_stats back under program on L1"
    );

    const canvas = await fetchCanvasAccount(
      admin.provider.connection,
      world.canvasKeypair.publicKey
    );
    const seasonStats = (await admin.program.account.seasonStats.fetch(
      world.seasonStatsPda
    )) as any;

    logDiff(
      "commit_gameplay_state(undelegate=true) (L1: stats undelegated, canvas snapshot only)",
      sharedL1Before,
      await snapshotAccounts(admin.program, sharedL1Refs),
      "L1"
    );

    logSection("commit_gameplay_state(undelegate=true)", {
      signature,
      seasonStatsOwnerIsProgram: true,
      totalPixelsPainted: seasonStats.totalPixelsPainted.toString(),
    });

    expect(canvas.pixels[1 * 4 + 1]).to.equal(1);
    expect(seasonStats.totalPixelsPainted.toString()).to.equal("4");
  });

  it("commit_and_undelegate_player: player returns their accounts to L1", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    await waitUntilSeasonCanEnd(world);

    const config = getMagicBlockConfig();
    const erPlayer = getWalletContext(world.erRpcUrl!, world.playerWallet);

    const playerL1Refs: AccountRef[] = [
      { label: "player", kind: "player", address: world.playerPda },
      {
        label: "seasonProfile",
        kind: "seasonProfile",
        address: world.seasonProfilePda,
      },
    ];
    const playerL1Before = await snapshotAccounts(admin.program, playerL1Refs);

    const signature = await (erPlayer.program.methods as any)
      .commitAndUndelegatePlayer()
      .accounts({
        payer: world.playerWallet.publicKey,
        season: world.seasonPda,
        player: world.playerPda,
        seasonProfile: world.seasonProfilePda,
        magicContext: MAGIC_CONTEXT_ID,
        magicProgram: MAGIC_PROGRAM_ID,
      })
      .rpc();

    await waitForAccountOwner(
      admin.provider.connection,
      world.playerPda,
      admin.program.programId,
      "player back under program on L1"
    );
    await waitForAccountOwner(
      admin.provider.connection,
      world.seasonProfilePda,
      admin.program.programId,
      "season_profile back under program on L1"
    );

    const player = (await admin.program.account.player.fetch(
      world.playerPda
    )) as any;
    const seasonProfile = (await admin.program.account.seasonProfile.fetch(
      world.seasonProfilePda
    )) as any;

    logDiff(
      "commit_and_undelegate_player (L1 after undelegate)",
      playerL1Before,
      await snapshotAccounts(admin.program, playerL1Refs),
      "L1"
    );

    logSection("commit_and_undelegate_player", {
      signature,
      lifetimePixels: player.lifetimePixels.toString(),
      pixelsPainted: seasonProfile.pixelsPainted.toString(),
    });

    expect(player.lifetimePixels.toString()).to.equal("4");
    expect(seasonProfile.pixelsPainted.toString()).to.equal("4");
  });

  it("end_season: admin finalizes the delegated season on L1", async function () {
    if (!hasMagicBlockEnv()) {
      this.skip();
    }
    if (!world.canvasKeypair) {
      this.skip();
    }

    await waitUntilSeasonCanEnd(world);

    const signature = await withAccountDiff(
      {
        title: "end_season (delegated lifecycle)",
        program: admin.program,
        refs: [
          { label: "game", kind: "game", address: world.gamePda },
          { label: "season", kind: "season", address: world.seasonPda },
          {
            label: "canvas",
            kind: "canvas",
            address: world.canvasKeypair.publicKey,
          },
        ],
        source: "L1",
      },
      () =>
        (admin.program.methods as any)
          .endSeason()
          .accounts({
            authority: admin.provider.wallet.publicKey,
            game: world.gamePda,
            season: world.seasonPda,
            canvas: null,
          })
          .rpc()
    );

    const [game, season, canvas] = (await Promise.all([
      admin.program.account.game.fetch(world.gamePda),
      admin.program.account.season.fetch(world.seasonPda),
      fetchCanvasAccount(
        admin.provider.connection,
        world.canvasKeypair.publicKey
      ),
    ])) as any;

    logSection("end_season (delegated lifecycle)", {
      signature,
      season: world.seasonPda.toBase58(),
    });

    expect(game.currentSeason.equals(PublicKey.default)).to.equal(true);
    expect(season.completed).to.equal(true);
    expect(canvas.pixels[1 * 4 + 1]).to.equal(1);
  });

  it("end_season: admin finalizes a non-delegated season on L1", async () => {
    const args = buildSeasonArgs({ durationSeconds: 10 });
    const { seasonPda, seasonStatsPda } = deriveSeasonAddressSet(
      admin.program.programId,
      args.seasonId
    );
    const canvasKeypair = Keypair.generate();

    await createCanvasAccount(
      admin.provider,
      admin.program.programId,
      canvasKeypair,
      args.canvasWidth ?? 4,
      args.canvasHeight ?? 4
    );

    await (admin.program.methods as any)
      .startSeason(args)
      .accounts({
        authority: admin.provider.wallet.publicKey,
        game: world.gamePda,
        season: seasonPda,
        seasonStats: seasonStatsPda,
        canvas: canvasKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await waitUntilSeasonCanEnd({
      ...world,
      seasonEndTime: args.endTime.toNumber(),
    } as TestWorld);

    let signature: string;
    try {
      signature = await withAccountDiff(
        {
          title: "end_season (non-delegated)",
          program: admin.program,
          refs: [
            { label: "game", kind: "game", address: world.gamePda },
            { label: "season", kind: "season", address: seasonPda },
            {
              label: "canvas",
              kind: "canvas",
              address: canvasKeypair.publicKey,
            },
          ],
          source: "L1",
        },
        () =>
          (admin.program.methods as any)
            .endSeason()
            .accounts({
              authority: admin.provider.wallet.publicKey,
              game: world.gamePda,
              season: seasonPda,
              canvas: canvasKeypair.publicKey,
            })
            .rpc({ skipPreflight: false, commitment: "confirmed" })
      );
    } catch (err: any) {
      console.error("\n[endSeason RAW ERROR]", err?.message);
      const logs =
        err?.logs ??
        (err?.getLogs ? await err.getLogs(admin.provider.connection) : []);
      console.error("[endSeason LOGS]", JSON.stringify(logs, null, 2));
      throw err;
    }

    const [game, season, canvas] = (await Promise.all([
      admin.program.account.game.fetch(world.gamePda),
      admin.program.account.season.fetch(seasonPda),
      fetchCanvasAccount(admin.provider.connection, canvasKeypair.publicKey),
    ])) as any;

    logSection("end_season", {
      signature,
      season: seasonPda.toBase58(),
      canvasFrozen: canvas.frozen,
    });

    expect(game.currentSeason.equals(PublicKey.default)).to.equal(true);
    expect(game.currentSeasonId).to.equal(0);
    expect(season.completed).to.equal(true);
    expect(canvas.frozen).to.equal(true);
  });
});
