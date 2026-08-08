use anchor_lang::prelude::*;

use crate::{
    constants::{FEE_PAYER_SEED, GAME_SEED},
    errors::PixlError,
    state::{FeePayer, Game},
};

#[derive(Accounts)]
pub struct InitFeePayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [GAME_SEED],
        bump = game.bump,
        constraint = game.authority == authority.key() @ PixlError::Unauthorized
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = authority,
        space = FeePayer::SPACE,
        seeds = [FEE_PAYER_SEED],
        bump
    )]
    pub fee_payer: Account<'info, FeePayer>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_fee_payer(ctx: Context<InitFeePayer>) -> Result<()> {
    ctx.accounts.fee_payer.set_inner(FeePayer {
        authority: ctx.accounts.authority.key(),
        bump: ctx.bumps.fee_payer,
    });
    Ok(())
}
