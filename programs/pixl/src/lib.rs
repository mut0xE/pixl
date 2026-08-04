use anchor_lang::prelude::*;

declare_id!("3xQjRQauFtSbMJHuUbrTzzYVP7h4W163BYT8zZxNEu2m");
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

#[program]
pub mod pixl {
    use super::*;

    pub fn init_game(ctx: Context<InitGame>) -> Result<()> {
        instructions::init_game::handle_init_game(ctx)
    }

    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        instructions::init_player::handle_init_player(ctx)
    }

    pub fn end_season(ctx: Context<EndSeason>) -> Result<()> {
        instructions::end_season::handle_end_season(ctx)
    }

    pub fn join_season(ctx: Context<JoinSeason>) -> Result<()> {
        instructions::join_season::handle_join_season(ctx)
    }

    pub fn start_season(ctx: Context<StartSeason>, args: StartSeasonArgs) -> Result<()> {
        instructions::start_season::handle_start_season(ctx, args)
    }
}
