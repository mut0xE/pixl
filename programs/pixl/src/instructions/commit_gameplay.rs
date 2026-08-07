use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::commit,
    ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder},
};

use crate::{
    constants::{PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_SEED, SEASON_STATS_SEED},
    state::{Canvas, Player, Season, SeasonProfile, SeasonStats},
    PixlError,
};

#[commit]
#[derive(Accounts)]
pub struct CommitSharedState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [SEASON_SEED, &season.id.to_le_bytes()],
        bump = season.bump
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
        constraint = season.canvas == canvas.key() @ PixlError::WrongCanvas,
        constraint = canvas.season == season.key() @ PixlError::WrongCanvas
    )]
    pub canvas: Account<'info, Canvas>,
}

pub fn handle_commit_shared(ctx: Context<CommitSharedState>, undelegate: bool) -> Result<()> {
    let payer = ctx.accounts.payer.to_account_info();
    let magic_context = ctx.accounts.magic_context.to_account_info();
    let magic_program = ctx.accounts.magic_program.to_account_info();
    let canvas = ctx.accounts.canvas.to_account_info();
    let season_stats = ctx.accounts.season_stats.to_account_info();

    if undelegate {
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= ctx.accounts.season.end_time,
            PixlError::SeasonNotEnded
        );

        MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
            .commit(&[canvas])
            .commit_and_undelegate(&[season_stats])
            .build_and_invoke()?;
    } else {
        MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
            .commit(&[canvas, season_stats])
            .build_and_invoke()?;
    }
    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [SEASON_SEED, &season.id.to_le_bytes()],
        bump = season.bump
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, player.wallet.as_ref()],
        bump = player.bump
    )]
    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds = [SEASON_PROFILE_SEED, season.key().as_ref(), player.wallet.as_ref()],
        bump = season_profile.bump,
        constraint = season_profile.player == player.key() @ PixlError::SeasonProfileNotInitialized,
        constraint = season_profile.season == season.key() @ PixlError::WrongSeason
    )]
    pub season_profile: Account<'info, SeasonProfile>,
}

pub fn handle_commit_and_undelegate_player(ctx: Context<CommitAndUndelegatePlayer>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.season.end_time,
        PixlError::SeasonNotEnded
    );

    let payer = ctx.accounts.payer.to_account_info();
    let magic_context = ctx.accounts.magic_context.to_account_info();
    let magic_program = ctx.accounts.magic_program.to_account_info();

    // The player PDA lives across seasons, so only commit it (kept delegated);
    // just the per-season profile is undelegated and finalized.
    MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
        .commit(&[ctx.accounts.player.to_account_info()])
        .commit_and_undelegate(&[ctx.accounts.season_profile.to_account_info()])
        .build_and_invoke()?;

    Ok(())
}
