use anchor_lang::prelude::*;
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

use crate::{
    constants::{PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_STATS_SEED},
    events::PlayerJoined,
    state::{Player, Season, SeasonProfile, SeasonStats},
    PixlError,
};

/// ER-layer instruction: marks a delegated profile as joined and increments
/// `season_stats.participant_count`. Signed by a session key (not the wallet)
/// because wallets reject the ER validator blockhash; the wallet can sign
/// directly (session_token = None) when it is the payer.
#[derive(Accounts, Session)]
pub struct JoinSeason<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [PLAYER_SEED, player.wallet.as_ref()],
        bump = player.bump,
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
        mut,
        seeds = [SEASON_PROFILE_SEED, season.key().as_ref(), player.wallet.as_ref()],
        bump = season_profile.bump,
        constraint = season_profile.season == season.key() @ PixlError::WrongSeason,
        constraint = season_profile.player == player.key() @ PixlError::SeasonProfileNotInitialized
    )]
    pub season_profile: Account<'info, SeasonProfile>,

    #[session(
        signer = payer,
        authority = player.wallet
    )]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[session_auth_or(
    ctx.accounts.player.wallet == ctx.accounts.payer.key(),
    SessionError::InvalidToken
)]
pub fn handle_join_season(ctx: Context<JoinSeason>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &ctx.accounts.player;
    let season_stats = &mut ctx.accounts.season_stats;
    let season_profile = &mut ctx.accounts.season_profile;

    require!(
        now >= season.start_time && now < season.end_time,
        PixlError::SeasonNotActive
    );

    // Idempotency guard: profiles start at joined_at == 0, so a repeat join can't
    // inflate participant_count.
    require!(season_profile.joined_at == 0, PixlError::AlreadyJoined);

    season_profile.joined_at = now;

    season_stats.participant_count = season_stats
        .participant_count
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;

    emit!(PlayerJoined {
        season: season.key(),
        player: player.key(),
        wallet: player.wallet,
        joined_at: now,
        timestamp: now,
    });

    Ok(())
}
