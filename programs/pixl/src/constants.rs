pub const GAME_SEED: &[u8] = b"game";
pub const SEASON_SEED: &[u8] = b"season";
pub const SEASON_STATS_SEED: &[u8] = b"season_stats";
pub const PLAYER_SEED: &[u8] = b"player";
pub const SEASON_PROFILE_SEED: &[u8] = b"season_profile";

pub const CANVAS_WIDTH: u16 = 512;
pub const CANVAS_HEIGHT: u16 = 512;
pub const MAX_CANVAS_PIXELS: usize = 1024 * 1024;
pub const DEFAULT_COLOR_INDEX: u8 = 0;
pub const MAX_PALETTE_COLORS: usize = 64;
pub const MAX_TITLE_LENGTH: usize = 64;
pub const MAX_DESCRIPTION_LENGTH: usize = 256;
pub const MAX_REFERENCE_LENGTH: usize = 200;
pub const MAX_REFERENCE_URI_LENGTH: usize = MAX_REFERENCE_LENGTH;
pub const DEFAULT_MAX_ENERGY: u8 = 6;
pub const DEFAULT_ENERGY_COOLDOWN_SECONDS: i64 = 30;
