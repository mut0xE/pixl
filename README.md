# Pixl

A collaborative pixel-canvas game on Solana, built with Anchor and MagicBlock Ephemeral Rollups. Players join a season, paint pixels on a shared canvas in real time via a delegated ephemeral rollup, and results settle back to L1 when the season ends.

## How it works

- **Seasons**: an admin creates and starts a season, initializing a shared canvas and fee payer.
- **Delegation**: canvas and player accounts are delegated to an Ephemeral Rollup for low-latency, gasless gameplay.
- **Gameplay**: players paint pixels (`paint_pixel`) at high frequency inside the ER.
- **Settlement**: gameplay state is committed and undelegated back to the base layer when a season ends.
- **Leaderboards**: player rankings are read directly on-chain from the ER, with an L1 fallback.
- **PWA**: the web app is installable, with a manifest, icons, and an offline-capable service worker.

## Project layout

```
programs/pixl/        Anchor program (Rust)
  src/instructions/    init_game, init_player, init_fee_payer, join_season, paint_pixel, delegate_gameplay, commit_gameplay, end_season, ...
packages/sdk/          TypeScript client SDK (seasons, session keys, converter, admin, fee payer, leaderboard, status)
app/web/               Next.js frontend (canvas, wallet, admin dashboard, leaderboard, PWA)
tests/                 End-to-end Anchor/Mocha tests
docs/                  Architecture overview
```

## Prerequisites

- Rust + [Anchor](https://www.anchor-lang.com/) (toolchain pinned in `rust-toolchain.toml`)
- Node.js and Yarn
- Solana CLI, with a wallet at `~/.config/solana/id.json`

## Setup

```bash
yarn install
anchor build
```

## Testing

```bash
yarn test         # end-to-end program tests
yarn test:sdk      # SDK unit tests
```

## Web app

```bash
yarn web:dev        # start the Next.js dev server
yarn web:build       # production build
```

## Linting & type checking

```bash
yarn lint
yarn typecheck
```

## Program

- Program ID: `A7fbbwXrM1zSUbqEBzF7MvXKaNGqnZjpNVBAA8Fb6GyQ`
- Cluster: devnet (see `Anchor.toml`)
