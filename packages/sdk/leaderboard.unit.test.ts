import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

import {
  sortRows,
  paginate,
  rankOfWallet,
  buildPlayerWalletMap,
  resolveContributorWallets,
  type LeaderboardRow,
} from "./leaderboard";

// Deterministic base58 pubkeys (ascending order: A < B < C by base58).
const WALLET_A = "11111111111111111111111111111111"; // system program, all-1s (smallest)
const WALLET_B = "So11111111111111111111111111111111111111112";
const WALLET_C = "Vote111111111111111111111111111111111111111";

describe("sortRows", () => {
  it("sorts by pixels desc", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_B, pixels: 5 },
      { wallet: WALLET_A, pixels: 10 },
    ];
    expect(sortRows(rows).map((r) => r.pixels)).to.deep.equal([10, 5]);
  });

  it("breaks pixel ties by wallet base58 ascending", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_C, pixels: 7 },
      { wallet: WALLET_A, pixels: 7 },
      { wallet: WALLET_B, pixels: 7 },
    ];
    expect(sortRows(rows).map((r) => r.wallet)).to.deep.equal([
      WALLET_A,
      WALLET_B,
      WALLET_C,
    ]);
  });

  it("does not mutate the input", () => {
    const rows: LeaderboardRow[] = [
      { wallet: WALLET_A, pixels: 1 },
      { wallet: WALLET_B, pixels: 2 },
    ];
    sortRows(rows);
    expect(rows[0].pixels).to.equal(1);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  it("returns the requested page and page count", () => {
    const r = paginate(rows, 2, 10);
    expect(r.rows).to.deep.equal([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.pageCount).to.equal(3);
    expect(r.total).to.equal(25);
    expect(r.page).to.equal(2);
  });

  it("returns the last partial page", () => {
    const r = paginate(rows, 3, 10);
    expect(r.rows).to.deep.equal([20, 21, 22, 23, 24]);
  });

  it("clamps out-of-range page up to the last page", () => {
    const r = paginate(rows, 99, 10);
    expect(r.page).to.equal(3);
    expect(r.rows).to.deep.equal([20, 21, 22, 23, 24]);
  });

  it("handles an empty list", () => {
    const r = paginate([] as number[], 1, 10);
    expect(r.rows).to.deep.equal([]);
    expect(r.pageCount).to.equal(1);
    expect(r.total).to.equal(0);
    expect(r.page).to.equal(1);
  });
});

describe("rankOfWallet", () => {
  const rows: LeaderboardRow[] = [
    { wallet: WALLET_A, pixels: 10 },
    { wallet: WALLET_B, pixels: 5 },
  ];
  it("returns 1-indexed rank", () => {
    expect(rankOfWallet(WALLET_B, rows)).to.equal(2);
  });
  it("returns null when absent", () => {
    expect(rankOfWallet(WALLET_C, rows)).to.equal(null);
  });
});

describe("buildPlayerWalletMap + resolveContributorWallets", () => {
  const pdaA = new PublicKey(WALLET_C); // reuse a valid pubkey as a fake PDA
  const pdaB = new PublicKey(WALLET_B);

  it("maps Player PDA to wallet and sorts", () => {
    const map = buildPlayerWalletMap([
      { publicKey: pdaA, wallet: new PublicKey(WALLET_A) },
      { publicKey: pdaB, wallet: new PublicKey(WALLET_B) },
    ]);
    const rows = resolveContributorWallets(
      [
        { player: pdaA.toBase58(), pixelsPainted: 3, joinedAt: 1 },
        { player: pdaB.toBase58(), pixelsPainted: 9, joinedAt: 1 },
      ],
      map
    );
    expect(rows).to.deep.equal([
      { wallet: WALLET_B, pixels: 9 },
      { wallet: WALLET_A, pixels: 3 },
    ]);
  });

  it("drops contributors whose PDA is not in the map", () => {
    const map = buildPlayerWalletMap([
      { publicKey: pdaA, wallet: new PublicKey(WALLET_A) },
    ]);
    const rows = resolveContributorWallets(
      [
        { player: pdaA.toBase58(), pixelsPainted: 3, joinedAt: 1 },
        { player: pdaB.toBase58(), pixelsPainted: 9, joinedAt: 1 },
      ],
      map
    );
    expect(rows).to.deep.equal([{ wallet: WALLET_A, pixels: 3 }]);
  });
});
