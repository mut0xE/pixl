use anchor_lang::prelude::*;

declare_id!("3xQjRQauFtSbMJHuUbrTzzYVP7h4W163BYT8zZxNEu2m");

#[program]
pub mod pixl {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
