use anchor_lang::prelude::*;

use crate::{constants::GAME_SEED, errors::PixlError, events::GameInitialized, state::Game};

#[derive(Accounts)]
pub struct InitGame<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space =  Game::SPACE,
        seeds = [GAME_SEED],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(
        constraint = this_program.programdata_address()? == Some(program_data.key())
            @ PixlError::InvalidAccountState
    )]
    pub this_program: Program<'info, crate::program::Pixl>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(admin.key())
            @ PixlError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_game(ctx: Context<InitGame>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let game = &mut ctx.accounts.game;

    game.set_inner(Game {
        authority: ctx.accounts.admin.key(),
        current_season: Pubkey::default(),
        current_season_id: 0,
        total_registered_players: 0,
        bump: ctx.bumps.game,
    });

    emit!(GameInitialized {
        game: game.key(),
        authority: game.authority,
        current_season_id: game.current_season_id,
        timestamp: now,
    });

    Ok(())
}
