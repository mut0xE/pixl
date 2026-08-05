use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::delegate, cpi::DelegateConfig};

use crate::{
    constants::{PLAYER_SEED, SEASON_PROFILE_SEED, SEASON_STATS_SEED},
    state::{Canvas, Game, Season},
    PixlError,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Player { wallet: Pubkey },
    SeasonProfile { season: Pubkey, wallet: Pubkey },
    SeasonStats { season: Pubkey },
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateAny<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated manually per account type
    #[account(mut, del)]
    pub target_account: AccountInfo<'info>,

    /// CHECK: used for season/profile/stats/canvas validation
    pub season: UncheckedAccount<'info>,

    /// CHECK: used for admin-controlled stats/canvas delegation validation
    pub game: UncheckedAccount<'info>,

    /// CHECK: checked by delegation program
    pub validator: Option<AccountInfo<'info>>,
}

pub fn delegate_any(ctx: Context<DelegateAny>, account_type: AccountType) -> Result<()> {
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());

    match account_type {
        AccountType::Player { wallet } => {
            require_keys_eq!(wallet, ctx.accounts.payer.key(), PixlError::Unauthorized);

            let (expected, _bump) =
                Pubkey::find_program_address(&[PLAYER_SEED, wallet.as_ref()], ctx.program_id);
            require_keys_eq!(
                expected,
                ctx.accounts.target_account.key(),
                PixlError::InvalidAccountState
            );

            ctx.accounts.delegate_target_account(
                &ctx.accounts.payer,
                &[PLAYER_SEED, wallet.as_ref()],
                DelegateConfig {
                    validator,
                    ..Default::default()
                },
            )?;
        }

        AccountType::SeasonProfile { season, wallet } => {
            require_keys_eq!(wallet, ctx.accounts.payer.key(), PixlError::Unauthorized);
            let season_data = load_season(&ctx.accounts.season, ctx.program_id)?;

            require_keys_eq!(season, ctx.accounts.season.key(), PixlError::WrongSeason);
            require_keys_eq!(
                season_data.game,
                ctx.accounts.game.key(),
                PixlError::WrongGame
            );

            let expected = Pubkey::find_program_address(
                &[SEASON_PROFILE_SEED, season.as_ref(), wallet.as_ref()],
                ctx.program_id,
            )
            .0;

            require_keys_eq!(
                expected,
                ctx.accounts.target_account.key(),
                PixlError::InvalidAccountState
            );

            ctx.accounts.delegate_target_account(
                &ctx.accounts.payer,
                &[SEASON_PROFILE_SEED, season.as_ref(), wallet.as_ref()],
                DelegateConfig {
                    validator,
                    ..Default::default()
                },
            )?;
        }

        AccountType::SeasonStats { season } => {
            let season_data = load_season(&ctx.accounts.season, ctx.program_id)?;
            let game_data = load_game(&ctx.accounts.game, ctx.program_id)?;

            require_keys_eq!(season, ctx.accounts.season.key(), PixlError::WrongSeason);
            require_keys_eq!(
                season_data.game,
                ctx.accounts.game.key(),
                PixlError::WrongGame
            );
            require_keys_eq!(
                game_data.authority,
                ctx.accounts.payer.key(),
                PixlError::Unauthorized
            );

            let expected =
                Pubkey::find_program_address(&[SEASON_STATS_SEED, season.as_ref()], ctx.program_id)
                    .0;

            require_keys_eq!(
                expected,
                ctx.accounts.target_account.key(),
                PixlError::InvalidAccountState
            );

            ctx.accounts.delegate_target_account(
                &ctx.accounts.payer,
                &[SEASON_STATS_SEED, season.as_ref()],
                DelegateConfig {
                    validator,
                    ..Default::default()
                },
            )?;
        }

    }

    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateCanvas<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: This is the pre-initialized canvas account stored on `season`.
    /// It must be owned by this program, match `season.canvas`, belong to the
    /// supplied season, and sign because it is a standalone keypair-backed
    /// account rather than a PDA. Those checks are enforced in `delegate_canvas`.
    #[account(mut, signer, del)]
    pub canvas: AccountInfo<'info>,

    pub season: Account<'info, Season>,
    pub game: Account<'info, Game>,

    /// CHECK: checked by delegation program
    pub validator: Option<AccountInfo<'info>>,
}

pub fn delegate_canvas(ctx: Context<DelegateCanvas>) -> Result<()> {
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    let canvas = load_canvas(&ctx.accounts.canvas, ctx.program_id)?;

    require_keys_eq!(
        ctx.accounts.season.game,
        ctx.accounts.game.key(),
        PixlError::WrongGame
    );
    require_keys_eq!(
        ctx.accounts.game.authority,
        ctx.accounts.payer.key(),
        PixlError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.season.canvas,
        ctx.accounts.canvas.key(),
        PixlError::WrongCanvas
    );
    require_keys_eq!(canvas.season, ctx.accounts.season.key(), PixlError::WrongCanvas);

    ctx.accounts.delegate_canvas(
        &ctx.accounts.payer,
        &[],
        DelegateConfig {
            validator,
            ..Default::default()
        },
    )?;

    Ok(())
}

fn load_season<'info>(season: &UncheckedAccount<'info>, program_id: &Pubkey) -> Result<Season> {
    require_keys_eq!(*season.owner, *program_id, PixlError::InvalidAccountState);
    Season::try_deserialize(&mut &season.data.borrow()[..])
}

fn load_game<'info>(game: &UncheckedAccount<'info>, program_id: &Pubkey) -> Result<Game> {
    require_keys_eq!(*game.owner, *program_id, PixlError::InvalidAccountState);
    Game::try_deserialize(&mut &game.data.borrow()[..])
}

fn load_canvas<'info>(canvas: &AccountInfo<'info>, program_id: &Pubkey) -> Result<Canvas> {
    require_keys_eq!(*canvas.owner, *program_id, PixlError::InvalidAccountState);
    Canvas::try_deserialize(&mut &canvas.data.borrow()[..])
}
