use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, SEASON_SEED},
    events::SeasonEnded,
    state::{Game, Season},
    PixlError,
};

#[derive(Accounts)]
pub struct EndSeason<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_SEED],
        bump = game.bump,
        constraint = game.authority == authority.key() @ PixlError::Unauthorized
    )]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [SEASON_SEED, &season.id.to_le_bytes()],
        bump = season.bump,
        constraint = season.game == game.key() @ PixlError::WrongGame
    )]
    pub season: Account<'info, Season>,
}

pub fn handle_end_season(ctx: Context<EndSeason>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let game = &mut ctx.accounts.game;
    let season = &mut ctx.accounts.season;

    require!(
        game.current_season == season.key(),
        PixlError::WrongSeason
    );
    require!(!season.completed, PixlError::SeasonAlreadyCompleted);
    require!(now >= season.end_time, PixlError::SeasonNotActive);

    season.completed = true;
    game.current_season = Pubkey::default();
    game.current_season_id = 0;

    emit!(SeasonEnded {
        game: game.key(),
        season: season.key(),
        season_id: season.id,
        authority: ctx.accounts.authority.key(),
        ended_at: now,
        timestamp: now,
    });

    Ok(())
}
