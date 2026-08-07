use anchor_lang::prelude::*;

use crate::{
    constants::{PLAYER_SEED, SEASON_PROFILE_SEED},
    state::{Season, SeasonProfile},
    PixlError,
};

/// Base-layer instruction: allocates the per-season profile PDA. Does not touch
/// `season_stats`; the participant increment + "joined" marker happen in the ER
/// via `join_season`.
#[derive(Accounts)]
pub struct InitSeasonProfile<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    /// CHECK: address pinned to the canonical Player PDA via `seeds` + existence
    /// `constraint`. Ownership is intentionally not checked because the Player is
    /// delegated to the ER (owned by the delegation program on L1) after its first
    /// season; only its `key()` is read here, and `join_season` re-validates it.
    #[account(
        seeds = [PLAYER_SEED, wallet.key().as_ref()],
        bump,
        constraint = !player.data_is_empty() @ PixlError::PlayerNotInitialized
    )]
    pub player: UncheckedAccount<'info>,

    #[account(
        constraint = season.completed == false @ PixlError::SeasonAlreadyCompleted
    )]
    pub season: Account<'info, Season>,

    #[account(
        init,
        payer = wallet,
        space = SeasonProfile::SPACE,
        seeds = [SEASON_PROFILE_SEED, season.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub season_profile: Account<'info, SeasonProfile>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_season_profile(ctx: Context<InitSeasonProfile>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;

    require!(
        now >= season.start_time && now < season.end_time,
        PixlError::SeasonNotActive
    );

    // `joined_at == 0` = "created but not yet joined"; `join_season` (ER) flips it.
    ctx.accounts.season_profile.set_inner(SeasonProfile {
        season: season.key(),
        player: ctx.accounts.player.key(),
        pixels_painted: 0,
        joined_at: 0,
        bump: ctx.bumps.season_profile,
    });

    Ok(())
}
