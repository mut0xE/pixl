use anchor_lang::prelude::*;

#[error_code]
pub enum PixlError {
    #[msg("Unauthorized action for the provided authority.")]
    Unauthorized,
    #[msg("The provided season id is invalid.")]
    InvalidSeasonId,
    #[msg("The provided season time range is invalid.")]
    InvalidSeasonTime,
    #[msg("The provided season title is invalid.")]
    InvalidTitle,
    #[msg("The provided season description is invalid.")]
    InvalidDescription,
    #[msg("The provided image reference is invalid.")]
    InvalidImageReference,
    #[msg("The provided palette is invalid.")]
    InvalidPalette,
    #[msg("The provided canvas dimensions are invalid.")]
    InvalidCanvasDimensions,
    #[msg("The provided coordinate is outside the canvas bounds.")]
    InvalidCoordinate,
    #[msg("The provided color index is invalid.")]
    InvalidColor,
    #[msg("The season is not active.")]
    SeasonNotActive,
    #[msg("A season is already active.")]
    SeasonAlreadyActive,
    #[msg("The season has already been completed.")]
    SeasonAlreadyCompleted,
    #[msg("The season has not ended yet.")]
    SeasonNotEnded,
    #[msg("The canvas is frozen.")]
    CanvasFrozen,
    #[msg("The player is already registered.")]
    AlreadyRegistered,
    #[msg("The player has already joined this season.")]
    AlreadyJoined,
    #[msg("The player account has not been initialized.")]
    PlayerNotInitialized,
    #[msg("The season profile account has not been initialized.")]
    SeasonProfileNotInitialized,
    #[msg("The player does not have enough energy.")]
    NotEnoughEnergy,
    #[msg("The pixel is already painted with that color.")]
    SameColor,
    #[msg("The provided game account does not match the expected game.")]
    WrongGame,
    #[msg("The provided season account does not match the expected season.")]
    WrongSeason,
    #[msg("The provided canvas account does not match the expected canvas.")]
    WrongCanvas,
    #[msg("Arithmetic overflow occurred.")]
    MathOverflow,
    #[msg("The account state is invalid for this operation.")]
    InvalidAccountState,
}
