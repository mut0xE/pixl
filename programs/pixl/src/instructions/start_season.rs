use anchor_lang::prelude::*;

use crate::{
    constants::{
        CANVAS_HEIGHT, CANVAS_WIDTH, DEFAULT_COLOR_INDEX, GAME_SEED, MAX_CANVAS_PIXELS,
        MAX_DESCRIPTION_LENGTH, MAX_PALETTE_COLORS, MAX_REFERENCE_URI_LENGTH, MAX_TITLE_LENGTH,
        SEASON_SEED, SEASON_STATS_SEED,
    },
    errors::PixlError,
    events::{CanvasInitialized, SeasonStarted},
    state::{Canvas, Game, Season, SeasonStats},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StartSeasonArgs {
    pub season_id: u32,
    pub title: String,
    pub description: String,
    pub palette: Vec<u32>,
    pub image_uri: String,
    pub canvas_width: Option<u16>,
    pub canvas_height: Option<u16>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Accounts)]
#[instruction(args: StartSeasonArgs)]
pub struct StartSeason<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GAME_SEED],
        bump = game.bump,
        constraint = game.authority == authority.key() @ PixlError::Unauthorized
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = authority,
        space = Season::SPACE,
        seeds = [SEASON_SEED, &args.season_id.to_le_bytes()],
        bump
    )]
    pub season: Account<'info, Season>,

    #[account(
        init,
        payer = authority,
        space = SeasonStats::SPACE,
        seeds = [SEASON_STATS_SEED, season.key().as_ref()],
        bump
    )]
    pub season_stats: Account<'info, SeasonStats>,

    /// CHECK: This account is pre-created client-side by the authority, must be
    /// owned by this program, large enough for the requested canvas dimensions,
    /// and still uninitialized when this instruction runs.
    #[account(
        mut,
        owner = crate::ID,
    )]
    pub canvas: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_start_season(ctx: Context<StartSeason>, args: StartSeasonArgs) -> Result<()> {
    require!(args.season_id != 0, PixlError::InvalidSeasonId);
    require!(
        args.end_time > args.start_time,
        PixlError::InvalidSeasonTime
    );
    require!(
        !args.title.is_empty() && args.title.len() <= MAX_TITLE_LENGTH,
        PixlError::InvalidTitle
    );
    require!(
        args.description.len() <= MAX_DESCRIPTION_LENGTH,
        PixlError::InvalidDescription
    );
    require!(
        !args.palette.is_empty() && args.palette.len() <= MAX_PALETTE_COLORS,
        PixlError::InvalidPalette
    );
    require!(
        is_valid_image_reference(&args.image_uri),
        PixlError::InvalidImageReference
    );

    let width = args.canvas_width.unwrap_or(CANVAS_WIDTH);
    let height = args.canvas_height.unwrap_or(CANVAS_HEIGHT);
    let total_pixels = calculate_canvas_pixels(width, height)?;

    require!(
        ctx.accounts.canvas.data_len() >= canvas_account_space_for(total_pixels),
        PixlError::InvalidAccountState
    );

    let now = Clock::get()?.unix_timestamp;
    let game = &mut ctx.accounts.game;
    let season = &mut ctx.accounts.season;
    let season_stats = &mut ctx.accounts.season_stats;

    require!(
        game.current_season == Pubkey::default(),
        PixlError::SeasonAlreadyActive
    );

    season.set_inner(Season {
        game: game.key(),
        id: args.season_id,
        title: args.title.clone(),
        description: args.description,
        palette: args.palette,
        image_uri: args.image_uri,
        start_time: args.start_time,
        end_time: args.end_time,
        completed: false,
        bump: ctx.bumps.season,
    });

    season_stats.set_inner(SeasonStats {
        season: season.key(),
        total_pixels_painted: 0,
        participant_count: 0,
        bump: ctx.bumps.season_stats,
    });

    {
        let canvas_data = ctx.accounts.canvas.try_borrow_data()?;
        require!(
            canvas_data[..8].iter().all(|byte| *byte == 0),
            PixlError::InvalidAccountState
        );
    }

    initialize_canvas_account(
        &ctx.accounts.canvas,
        season.key(),
        width,
        height,
        total_pixels,
    )?;

    game.current_season = season.key();
    game.current_season_id = args.season_id;

    emit!(SeasonStarted {
        game: game.key(),
        season: season.key(),
        season_id: args.season_id,
        authority: ctx.accounts.authority.key(),
        title: args.title,
        start_time: args.start_time,
        end_time: args.end_time,
        timestamp: now,
    });

    emit!(CanvasInitialized {
        season: season.key(),
        canvas: ctx.accounts.canvas.key(),
        width,
        height,
        authority: ctx.accounts.authority.key(),
        timestamp: now,
    });

    Ok(())
}

fn is_valid_image_reference(image_uri: &str) -> bool {
    !image_uri.is_empty() && image_uri.len() <= MAX_REFERENCE_URI_LENGTH
}

fn calculate_canvas_pixels(width: u16, height: u16) -> Result<usize> {
    require!(width > 0 && height > 0, PixlError::InvalidCanvasDimensions);

    let total_pixels = usize::from(width)
        .checked_mul(usize::from(height))
        .ok_or(PixlError::MathOverflow)?;

    require!(
        total_pixels <= MAX_CANVAS_PIXELS,
        PixlError::InvalidCanvasDimensions
    );

    Ok(total_pixels)
}

fn canvas_account_space_for(total_pixels: usize) -> usize {
    8 + 32 + 2 + 2 + 4 + total_pixels + 1 + 1
}

fn initialize_canvas_account(
    canvas: &UncheckedAccount,
    season: Pubkey,
    width: u16,
    height: u16,
    total_pixels: usize,
) -> Result<()> {
    let mut data = canvas.try_borrow_mut_data()?;
    let mut cursor = &mut data[..];

    cursor[..8].copy_from_slice(&Canvas::DISCRIMINATOR);
    cursor = &mut cursor[8..];

    cursor[..32].copy_from_slice(season.as_ref());
    cursor = &mut cursor[32..];

    cursor[..2].copy_from_slice(&width.to_le_bytes());
    cursor = &mut cursor[2..];

    cursor[..2].copy_from_slice(&height.to_le_bytes());
    cursor = &mut cursor[2..];

    cursor[..4].copy_from_slice(&(total_pixels as u32).to_le_bytes());
    cursor = &mut cursor[4..];

    let (pixels, rest) = cursor.split_at_mut(total_pixels);
    pixels.fill(DEFAULT_COLOR_INDEX);
    rest[0] = 0;
    rest[1] = 0;

    Ok(())
}
