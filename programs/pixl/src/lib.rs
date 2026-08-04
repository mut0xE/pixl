use anchor_lang::prelude::*;

declare_id!("3xQjRQauFtSbMJHuUbrTzzYVP7h4W163BYT8zZxNEu2m");
mod constants;
mod enums;
mod errors;
mod events;
mod state;

pub use enums::*;
pub use errors::*;
pub use events::*;
pub use state::*;

#[program]
pub mod pixl {
    use super::*;
}
