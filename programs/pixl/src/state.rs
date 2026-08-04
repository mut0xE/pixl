use anchor_lang::prelude::*;

use crate::constants::{
    CANVAS_PIXELS, MAX_DESCRIPTION_LENGTH, MAX_PALETTE_COLORS, MAX_REFERENCE_URI_LENGTH,
    MAX_TITLE_LENGTH,
};

pub const DISCRIMINATOR_SIZE: usize = 8;

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub authority: Pubkey,
    pub current_season: Pubkey,
    pub current_season_id: u32,
    pub total_registered_players: u64,
    pub bump: u8,
}

impl Game {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct Season {
    pub game: Pubkey,
    pub id: u32,
    #[max_len(MAX_TITLE_LENGTH)]
    pub title: String,
    #[max_len(MAX_DESCRIPTION_LENGTH)]
    pub description: String,
    #[max_len(MAX_PALETTE_COLORS)]
    pub palette: Vec<u32>,
    #[max_len(MAX_REFERENCE_URI_LENGTH)]
    pub blueprint_uri: String,
    pub blueprint_hash: [u8; 32],
    pub start_time: i64,
    pub end_time: i64,
    pub completed: bool,
    pub bump: u8,
}

impl Season {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct Canvas {
    pub season: Pubkey,
    pub width: u16,
    pub height: u16,
    #[max_len(CANVAS_PIXELS)]
    pub pixels: Vec<u8>,
    pub frozen: bool,
    pub bump: u8,
}

impl Canvas {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct SeasonStats {
    pub season: Pubkey,
    pub total_pixels_painted: u64,
    pub participant_count: u64,
    pub bump: u8,
}

impl SeasonStats {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub wallet: Pubkey,
    pub available_energy: u8,
    pub max_energy: u8,
    pub energy_cooldown_seconds: u32,
    pub last_energy_refresh: i64,
    pub lifetime_pixels: u64,
    pub joined_at: i64,
    pub last_pixel_at: i64,
    pub bump: u8,
}

impl Player {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct SeasonProfile {
    pub season: Pubkey,
    pub player: Pubkey,
    pub pixels_painted: u64,
    pub joined_at: i64,
    pub bump: u8,
}

impl SeasonProfile {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}
