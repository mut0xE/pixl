use anchor_lang::prelude::*;

use crate::constants::{
    MAX_CANVAS_PIXELS, MAX_DESCRIPTION_LENGTH, MAX_PALETTE_COLORS, MAX_REFERENCE_URI_LENGTH,
    MAX_TITLE_LENGTH,
};
use crate::PixlError;

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
    pub canvas: Pubkey,
    pub id: u32,
    #[max_len(MAX_TITLE_LENGTH)]
    pub title: String,
    #[max_len(MAX_DESCRIPTION_LENGTH)]
    pub description: String,
    #[max_len(MAX_PALETTE_COLORS)]
    pub palette: Vec<u32>,
    #[max_len(MAX_REFERENCE_URI_LENGTH)]
    pub image_uri: String,
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
    #[max_len(MAX_CANVAS_PIXELS)]
    pub pixels: Vec<u8>,
    pub frozen: bool,
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

    pub(crate) fn refresh_energy(&mut self, now: i64) -> Result<()> {
        if now < self.last_energy_refresh {
            return err!(PixlError::InvalidAccountState);
        }

        if self.available_energy >= self.max_energy {
            self.available_energy = self.max_energy;
            self.last_energy_refresh = now;
            return Ok(());
        }

        let cooldown = i64::from(self.energy_cooldown_seconds);
        if cooldown <= 0 {
            return err!(PixlError::InvalidAccountState);
        }

        let elapsed = now
            .checked_sub(self.last_energy_refresh)
            .ok_or(PixlError::MathOverflow)?;
        let regenerated = elapsed / cooldown;

        if regenerated <= 0 {
            return Ok(());
        }

        let regenerated_u8 = u8::try_from(regenerated).unwrap_or(u8::MAX);
        let updated_energy = self.available_energy.saturating_add(regenerated_u8);
        self.available_energy = updated_energy.min(self.max_energy);

        let missing_energy = self
            .max_energy
            .checked_sub(self.available_energy)
            .ok_or(PixlError::MathOverflow)?;

        if missing_energy == 0 {
            self.last_energy_refresh = now;
            return Ok(());
        }

        let consumed_intervals = regenerated
            .checked_mul(cooldown)
            .ok_or(PixlError::MathOverflow)?;
        self.last_energy_refresh = self
            .last_energy_refresh
            .checked_add(consumed_intervals)
            .ok_or(PixlError::MathOverflow)?;

        Ok(())
    }
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

/// A program-owned PDA used as the delegated fee payer for uncapped ER commits.
/// It is delegated like gameplay accounts and funded on base layer via
/// `lamportsDelegatedTransferIx`; the Magic program debits it and credits the
/// validator `magic_fee_vault` on each paid commit.
#[account]
#[derive(InitSpace)]
pub struct FeePayer {
    pub authority: Pubkey,
    pub bump: u8,
}

impl FeePayer {
    pub const SPACE: usize = DISCRIMINATOR_SIZE + Self::INIT_SPACE;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player_with_energy(
        available_energy: u8,
        max_energy: u8,
        energy_cooldown_seconds: u32,
        last_energy_refresh: i64,
    ) -> Player {
        Player {
            wallet: Pubkey::default(),
            available_energy,
            max_energy,
            energy_cooldown_seconds,
            last_energy_refresh,
            lifetime_pixels: 0,
            joined_at: 0,
            last_pixel_at: 0,
            bump: 0,
        }
    }

    #[test]
    fn refresh_energy_keeps_state_when_no_time_elapsed() {
        let mut player = player_with_energy(2, 6, 30, 100);

        player.refresh_energy(100).unwrap();

        assert_eq!(player.available_energy, 2);
        assert_eq!(player.last_energy_refresh, 100);
    }

    #[test]
    fn refresh_energy_keeps_state_when_less_than_one_interval_elapsed() {
        let mut player = player_with_energy(2, 6, 30, 100);

        player.refresh_energy(129).unwrap();

        assert_eq!(player.available_energy, 2);
        assert_eq!(player.last_energy_refresh, 100);
    }

    #[test]
    fn refresh_energy_adds_one_energy_at_exact_interval() {
        let mut player = player_with_energy(2, 6, 30, 100);

        player.refresh_energy(130).unwrap();

        assert_eq!(player.available_energy, 3);
        assert_eq!(player.last_energy_refresh, 130);
    }

    #[test]
    fn refresh_energy_adds_multiple_intervals() {
        let mut player = player_with_energy(1, 6, 30, 100);

        player.refresh_energy(190).unwrap();

        assert_eq!(player.available_energy, 4);
        assert_eq!(player.last_energy_refresh, 190);
    }

    #[test]
    fn refresh_energy_caps_at_maximum_when_reached() {
        let mut player = player_with_energy(4, 6, 30, 100);

        player.refresh_energy(160).unwrap();

        assert_eq!(player.available_energy, 6);
        assert_eq!(player.last_energy_refresh, 160);
    }

    #[test]
    fn refresh_energy_keeps_energy_capped_when_already_full() {
        let mut player = player_with_energy(6, 6, 30, 100);

        player.refresh_energy(250).unwrap();

        assert_eq!(player.available_energy, 6);
        assert_eq!(player.last_energy_refresh, 250);
    }

    #[test]
    fn refresh_energy_preserves_partial_interval_progress() {
        let mut player = player_with_energy(2, 6, 30, 100);

        player.refresh_energy(175).unwrap();

        assert_eq!(player.available_energy, 4);
        assert_eq!(player.last_energy_refresh, 160);
    }

    #[test]
    fn refresh_energy_rejects_backward_timestamps() {
        let mut player = player_with_energy(2, 6, 30, 100);

        let error = player.refresh_energy(99).unwrap_err();

        assert_eq!(error, error!(PixlError::InvalidAccountState));
        assert_eq!(player.available_energy, 2);
        assert_eq!(player.last_energy_refresh, 100);
    }
}
