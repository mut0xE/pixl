use anchor_lang::prelude::*;

use crate::{
    constants::{DEFAULT_ENERGY_COOLDOWN_SECONDS, DEFAULT_MAX_ENERGY, GAME_SEED, PLAYER_SEED},
    events::PlayerInitialized,
    state::{Game, Player},
    PixlError,
};

#[derive(Accounts)]
pub struct InitPlayer<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_SEED],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = wallet,
        space = Player::SPACE,
        seeds = [PLAYER_SEED, wallet.key().as_ref()],
        bump
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_player(ctx: Context<InitPlayer>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let game = &mut ctx.accounts.game;
    let player = &mut ctx.accounts.player;

    player.set_inner(Player {
        wallet: ctx.accounts.wallet.key(),
        available_energy: DEFAULT_MAX_ENERGY,
        max_energy: DEFAULT_MAX_ENERGY,
        energy_cooldown_seconds: u32::try_from(DEFAULT_ENERGY_COOLDOWN_SECONDS)
            .map_err(|_| error!(PixlError::InvalidAccountState))?,
        last_energy_refresh: now,
        lifetime_pixels: 0,
        joined_at: now,
        last_pixel_at: 0,
        bump: ctx.bumps.player,
    });

    game.total_registered_players = game
        .total_registered_players
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;

    emit!(PlayerInitialized {
        player: player.key(),
        wallet: player.wallet,
        max_energy: player.max_energy,
        energy_cooldown_seconds: player.energy_cooldown_seconds,
        timestamp: now,
    });

    Ok(())
}
