use anchor_lang::prelude::*;

#[event]
pub struct GameInitialized {
    pub game: Pubkey,
    pub authority: Pubkey,
    pub current_season_id: u32,
    pub timestamp: i64,
}

#[event]
pub struct SeasonStarted {
    pub game: Pubkey,
    pub season: Pubkey,
    pub season_id: u32,
    pub authority: Pubkey,
    pub title: String,
    pub start_time: i64,
    pub end_time: i64,
    pub timestamp: i64,
}

#[event]
pub struct CanvasInitialized {
    pub season: Pubkey,
    pub canvas: Pubkey,
    pub width: u16,
    pub height: u16,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PlayerInitialized {
    pub player: Pubkey,
    pub wallet: Pubkey,
    pub max_energy: u8,
    pub energy_cooldown_seconds: u32,
    pub timestamp: i64,
}

#[event]
pub struct PlayerJoined {
    pub season: Pubkey,
    pub player: Pubkey,
    pub wallet: Pubkey,
    pub joined_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct PixelPainted {
    pub player: Pubkey,
    pub season: Pubkey,
    pub x: u16,
    pub y: u16,
    pub old_color_index: u8,
    pub new_color_index: u8,
    pub timestamp: i64,
}

#[event]
pub struct SeasonEnded {
    pub game: Pubkey,
    pub season: Pubkey,
    pub season_id: u32,
    pub authority: Pubkey,
    pub ended_at: i64,
    pub timestamp: i64,
}
