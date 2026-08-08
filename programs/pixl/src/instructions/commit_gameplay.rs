use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::commit,
    ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder},
};

use crate::{
    constants::{FEE_PAYER_SEED, PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_SEED, SEASON_STATS_SEED},
    state::{Canvas, Player, Season, SeasonProfile, SeasonStats},
    PixlError,
};

#[commit]
#[derive(Accounts)]
pub struct CommitSharedState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Delegated fee payer PDA that pays the commit fee (lifts the 10-commit
    /// sponsored cap). Passed as raw AccountInfo since it is delegated; signed
    /// via seeds. CHECK: address verified against `[FEE_PAYER_SEED]` in handler.
    #[account(mut)]
    pub fee_payer: AccountInfo<'info>,

    /// Validator fee vault credited with each paid commit. The Magic program
    /// validates this destination. CHECK: validated by the Magic program.
    #[account(mut)]
    pub magic_fee_vault: AccountInfo<'info>,

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
    let fee_payer_bump = verify_fee_payer(&ctx.accounts.fee_payer, ctx.program_id)?;
    let payer_seeds: &[&[u8]] = &[FEE_PAYER_SEED, &[fee_payer_bump]];

    let fee_payer = ctx.accounts.fee_payer.to_account_info();
    let magic_fee_vault = ctx.accounts.magic_fee_vault.to_account_info();
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

        MagicIntentBundleBuilder::new(fee_payer, magic_context, magic_program)
            .magic_fee_vault(magic_fee_vault)
            .commit(&[canvas])
            .commit_and_undelegate(&[season_stats])
            .build_and_invoke_signed(&[payer_seeds])?;
    } else {
        MagicIntentBundleBuilder::new(fee_payer, magic_context, magic_program)
            .magic_fee_vault(magic_fee_vault)
            .commit(&[canvas, season_stats])
            .build_and_invoke_signed(&[payer_seeds])?;
    }
    Ok(())
}

/// Verifies the passed fee payer matches the program's `[FEE_PAYER_SEED]` PDA
/// and returns its bump for seed signing.
fn verify_fee_payer(fee_payer: &AccountInfo, program_id: &Pubkey) -> Result<u8> {
    let (expected, bump) = Pubkey::find_program_address(&[FEE_PAYER_SEED], program_id);
    require_keys_eq!(expected, fee_payer.key(), PixlError::InvalidAccountState);
    Ok(bump)
}

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegatePlayer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: address verified against `[FEE_PAYER_SEED]` in handler.
    #[account(mut)]
    pub fee_payer: AccountInfo<'info>,

    /// CHECK: validated by the Magic program.
    #[account(mut)]
    pub magic_fee_vault: AccountInfo<'info>,

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

    let fee_payer_bump = verify_fee_payer(&ctx.accounts.fee_payer, ctx.program_id)?;
    let payer_seeds: &[&[u8]] = &[FEE_PAYER_SEED, &[fee_payer_bump]];

    let fee_payer = ctx.accounts.fee_payer.to_account_info();
    let magic_fee_vault = ctx.accounts.magic_fee_vault.to_account_info();
    let magic_context = ctx.accounts.magic_context.to_account_info();
    let magic_program = ctx.accounts.magic_program.to_account_info();

    // The player PDA lives across seasons, so only commit it (kept delegated);
    // just the per-season profile is undelegated and finalized.
    MagicIntentBundleBuilder::new(fee_payer, magic_context, magic_program)
        .magic_fee_vault(magic_fee_vault)
        .commit(&[ctx.accounts.player.to_account_info()])
        .commit_and_undelegate(&[ctx.accounts.season_profile.to_account_info()])
        .build_and_invoke_signed(&[payer_seeds])?;

    Ok(())
}
