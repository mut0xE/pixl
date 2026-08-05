use anchor_lang::prelude::*;

use crate::{
    constants::{GAME_SEED, PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_SEED, SEASON_STATS_SEED},
    events::PixelPainted,
    state::{Canvas, Game, Player, Season, SeasonProfile, SeasonStats},
    PixlError,
};

#[derive(Accounts)]
pub struct PaintPixel<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        seeds = [GAME_SEED],
        bump = game.bump,
    )]
    pub game: Account<'info, Game>,

    #[account(
        seeds = [SEASON_SEED, &season.id.to_le_bytes()],
        bump = season.bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        constraint = season.canvas == canvas.key() @ PixlError::WrongCanvas,
        constraint = canvas.season == season.key() @ PixlError::WrongCanvas
    )]
    pub canvas: Account<'info, Canvas>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, wallet.key().as_ref()],
        bump = player.bump,
        constraint = player.wallet == wallet.key() @ PixlError::PlayerNotInitialized
    )]
    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds = [SEASON_PROFILE_SEED, season.key().as_ref(), wallet.key().as_ref()],
        bump = season_profile.bump,
        constraint = season_profile.season == season.key() @ PixlError::WrongSeason,
        constraint = season_profile.player == player.key() @ PixlError::SeasonProfileNotInitialized
    )]
    pub season_profile: Account<'info, SeasonProfile>,

    #[account(
        mut,
        seeds = [SEASON_STATS_SEED, season.key().as_ref()],
        bump = season_stats.bump,
        constraint = season_stats.season == season.key() @ PixlError::WrongSeason
    )]
    pub season_stats: Account<'info, SeasonStats>,
}

pub fn handle_paint_pixel(
    ctx: Context<PaintPixel>,
    x: u16,
    y: u16,
    color_index: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let game = &ctx.accounts.game;
    let season = &ctx.accounts.season;

    // Establish the full game -> season relationship before touching mutable state.
    require!(season.game == game.key(), PixlError::WrongGame);
    require!(game.current_season == season.key(), PixlError::WrongSeason);
    require!(
        now >= season.start_time && now < season.end_time && !season.completed,
        PixlError::SeasonNotActive
    );

    let canvas = &mut ctx.accounts.canvas;
    // Bound and palette checks happen before energy is consumed.
    require!(!canvas.frozen, PixlError::CanvasFrozen);
    require!(x < canvas.width, PixlError::InvalidCoordinate);
    require!(y < canvas.height, PixlError::InvalidCoordinate);
    require!(
        usize::from(color_index) < season.palette.len(),
        PixlError::InvalidColor
    );

    let player = &mut ctx.accounts.player;
    // Regenerate any accrued energy first so the placement check uses fresh state.
    player.refresh_energy(now)?;
    require!(player.available_energy > 0, PixlError::NotEnoughEnergy);

    // Canvas pixels are stored row-major in a flat byte array.
    let index = usize::from(y)
        .checked_mul(usize::from(canvas.width))
        .and_then(|row_offset| row_offset.checked_add(usize::from(x)))
        .ok_or(PixlError::MathOverflow)?;

    let old_color_index = *canvas
        .pixels
        .get(index)
        .ok_or(error!(PixlError::InvalidCoordinate))?;
    require!(old_color_index != color_index, PixlError::InvalidAccountState);

    // A successful paint updates the pixel first, then consumes one energy and credits stats.
    canvas.pixels[index] = color_index;
    player.available_energy = player
        .available_energy
        .checked_sub(1)
        .ok_or(PixlError::MathOverflow)?;
    player.lifetime_pixels = player
        .lifetime_pixels
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;
    player.last_pixel_at = now;

    let season_profile = &mut ctx.accounts.season_profile;
    season_profile.pixels_painted = season_profile
        .pixels_painted
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;

    let season_stats = &mut ctx.accounts.season_stats;
    season_stats.total_pixels_painted = season_stats
        .total_pixels_painted
        .checked_add(1)
        .ok_or(PixlError::MathOverflow)?;

    emit!(PixelPainted {
        player: player.key(),
        season: season.key(),
        x,
        y,
        old_color_index,
        new_color_index: color_index,
        timestamp: now,
    });

    Ok(())
}
