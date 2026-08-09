# Architecture

Diagrams describing Pixl's system architecture, request flow, and MagicBlock integration.

## System overview

```mermaid
flowchart LR
    subgraph Client["Client (app/web)"]
        UI[Canvas UI]
        Wallet[Wallet Adapter]
        SDK[packages/sdk]
    end

    subgraph L1["Solana L1 (devnet)"]
        Program[Pixl Anchor Program]
        Game[(Game)]
        Season[(Season)]
        FeePayer[(Fee Payer)]
    end

    subgraph ER["MagicBlock Ephemeral Rollup"]
        Validator[ER Validator]
        DCanvas[(Delegated Canvas)]
        DPlayer[(Delegated Player / Profile)]
    end

    UI --> SDK
    Wallet --> SDK
    SDK -->|admin: init/start/end season| Program
    SDK -->|gameplay: paint_pixel| Validator
    Program -->|delegate accounts| Validator
    Validator -->|commit / undelegate| Program
    Program --- Game
    Program --- Season
    Program --- FeePayer
    Validator --- DCanvas
    Validator --- DPlayer
```

## Season lifecycle

```mermaid
sequenceDiagram
    actor Admin
    participant L1 as Solana L1 (Pixl Program)
    participant ER as Ephemeral Rollup

    Admin->>L1: init_game / init_fee_payer
    Admin->>L1: start_season(args)
    L1-->>L1: create Season, Canvas, SeasonStats
    Admin->>L1: delegate_canvas / delegate_any(FeePayer, SeasonStats)
    L1->>ER: delegate accounts to validator
    Note over ER: Canvas + fee payer now live on the ER

    Admin->>L1: end_season
    ER->>L1: commit_gameplay_state(undelegate: true)
    Note over L1: canonical state settled back to L1
```

## Player gameplay flow

```mermaid
sequenceDiagram
    actor Player
    participant L1 as Solana L1
    participant ER as Ephemeral Rollup
    participant Canvas as Delegated Canvas

    Player->>L1: init_player (once)
    Player->>L1: join_season / init_season_profile
    Player->>L1: delegate_any(Player / SeasonProfile)
    L1->>ER: delegate player + profile accounts

    loop Real-time painting
        Player->>ER: paint_pixel(x, y, color_index)
        ER->>Canvas: update pixel state
        ER-->>Player: low-latency confirmation
    end

    Player->>ER: commit_and_undelegate_player
    ER->>L1: settle player state back to base layer
```

## MagicBlock integration points

```mermaid
flowchart TD
    subgraph Setup["1. Program setup"]
        A["#[ephemeral] macro on the Pixl program"]
    end

    subgraph Delegate["2. Delegation (delegate_gameplay.rs)"]
        B["#[delegate] account contexts:\nDelegateAny, DelegateCanvas"]
        C["delegate_target_account CPI\n→ Delegation Program"]
        B --> C
    end

    subgraph Live["3. Live on the ER"]
        D["Ownership moves to the ER validator"]
        E["paint_pixel + session-key txs\nrun on the ER"]
        D --> E
    end

    subgraph Commit["4. Commit / undelegate (commit_gameplay.rs)"]
        F["#[commit] contexts:\nCommitSharedState, CommitAndUndelegatePlayer"]
        G["FeePayer PDA + validator fee vault\ncover commit fees past the sponsored cap"]
        H["commit() → state snapshot to L1\ncommit_and_undelegate() → ownership returned"]
        F --> G --> H
    end

    A --> B
    C --> D
    E --> F
    H --> I["Pixl program owns canonical state on L1"]

    style A fill:#241b2f,stroke:#a892ff,color:#fff
    style C fill:#2b2b40,stroke:#8888ff,color:#fff
    style H fill:#2b2b40,stroke:#8888ff,color:#fff
    style I fill:#1f2f24,stroke:#7fd68a,color:#fff
```

Key accounts delegated to the Ephemeral Rollup: `Canvas`, `Player`, `SeasonProfile`, `SeasonStats`, and the shared `FeePayer`. Delegation and undelegation are handled by `programs/pixl/src/instructions/delegate_gameplay.rs` and `commit_gameplay.rs`, using the `ephemeral-rollups-sdk` Anchor macros (`#[ephemeral]`, `#[delegate]`, `#[commit]`).

Two other integration surfaces sit outside the program:

- **Session keys** (`packages/sdk`, used by `app/web/lib/usePainting.ts`'s `paintWithSession`): players sign a short-lived session key once, then `paint_pixel` calls on the ER are authorized without a wallet popup per pixel.
- **ER-first reads with L1 fallback** (`app/web/lib/useLeaderboard.ts`): the leaderboard and canvas state are read from the ER connection first; if that read fails, the client falls back to the last-committed state on L1 so the UI stays usable across delegation/undelegation windows.
