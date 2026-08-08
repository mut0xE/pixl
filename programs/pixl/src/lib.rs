use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

declare_id!("A7fbbwXrM1zSUbqEBzF7MvXKaNGqnZjpNVBAA8Fb6GyQ");
mod constants;
mod enums;
mod errors;
mod events;
mod instructions;
mod state;

pub use enums::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

#[ephemeral]
#[program]
pub mod pixl {
    use super::*;

    pub fn init_game(ctx: Context<InitGame>) -> Result<()> {
        instructions::init_game::handle_init_game(ctx)
    }

    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        instructions::init_player::handle_init_player(ctx)
    }

    pub fn init_fee_payer(ctx: Context<InitFeePayer>) -> Result<()> {
        instructions::init_fee_payer::handle_init_fee_payer(ctx)
    }

    pub fn end_season(ctx: Context<EndSeason>) -> Result<()> {
        instructions::end_season::handle_end_season(ctx)
    }

    pub fn delegate_any(ctx: Context<DelegateAny>, account_type: AccountType) -> Result<()> {
        instructions::delegate_gameplay::handle_delegate_any(ctx, account_type)
    }

    pub fn delegate_canvas(ctx: Context<DelegateCanvas>) -> Result<()> {
        instructions::delegate_gameplay::handle_delegate_canvas(ctx)
    }

    pub fn init_season_profile(ctx: Context<InitSeasonProfile>) -> Result<()> {
        instructions::init_season_profile::handle_init_season_profile(ctx)
    }

    pub fn join_season(ctx: Context<JoinSeason>) -> Result<()> {
        instructions::join_season::handle_join_season(ctx)
    }

    pub fn start_season(ctx: Context<StartSeason>, args: StartSeasonArgs) -> Result<()> {
        instructions::start_season::handle_start_season(ctx, args)
    }

    pub fn paint_pixel(ctx: Context<PaintPixel>, x: u16, y: u16, color_index: u8) -> Result<()> {
        instructions::paint_pixel::handle_paint_pixel(ctx, x, y, color_index)
    }

    pub fn commit_gameplay_state(ctx: Context<CommitSharedState>, undelegate: bool) -> Result<()> {
        instructions::commit_gameplay::handle_commit_shared(ctx, undelegate)
    }

    pub fn commit_and_undelegate_player(ctx: Context<CommitAndUndelegatePlayer>) -> Result<()> {
        instructions::commit_gameplay::handle_commit_and_undelegate_player(ctx)
    }
}
