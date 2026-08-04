use anchor_lang::prelude::*;

use crate::{
    constants::{PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_STATS_SEED},
    events::PlayerJoined,
    state::{Player, Season, SeasonProfile, SeasonStats},
    PixlError,
};

#[derive(Accounts)]
pub struct JoinSeason<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        seeds = [PLAYER_SEED, wallet.key().as_ref()],
        bump = player.bump,
        constraint = player.wallet == wallet.key() @ PixlError::PlayerNotInitialized
    )]
    pub player: Account<'info, Player>,

    #[account(
        constraint = season.completed == false @ PixlError::SeasonAlreadyCompleted
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [SEASON_STATS_SEED, season.key().as_ref()],
        bump = season_stats.bump,
        constraint = season_stats.season == season.key() @ PixlError::WrongSeason
    )]
    pub season_stats: Account<'info, SeasonStats>,

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

pub fn handle_join_season(ctx: Context<JoinSeason>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let season_stats = &mut ctx.accounts.season_stats;
    let season_profile = &mut ctx.accounts.season_profile;

    require!(
        now >= season.start_time && now < season.end_time,
        PixlError::SeasonNotActive
    );

    season_profile.set_inner(SeasonProfile {
        season: season.key(),
        player: ctx.accounts.player.key(),
        pixels_painted: 0,
        joined_at: now,
        bump: ctx.bumps.season_profile,
    });

    season_stats.participant_count = season_stats
        .participant_count
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;

    emit!(PlayerJoined {
        season: season.key(),
        player: ctx.accounts.player.key(),
        wallet: ctx.accounts.wallet.key(),
        joined_at: now,
        timestamp: now,
    });

    Ok(())
}
