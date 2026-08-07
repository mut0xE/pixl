import type { Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { Pixl } from "../../target/types/pixl";

export type PixlProgram = Program<Pixl>;

export function fetchGame(program: PixlProgram, address: PublicKey) {
  return program.account.game.fetch(address);
}

export function fetchSeason(program: PixlProgram, address: PublicKey) {
  return program.account.season.fetch(address);
}

export function fetchSeasonStats(program: PixlProgram, address: PublicKey) {
  return program.account.seasonStats.fetch(address);
}

export function fetchPlayer(program: PixlProgram, address: PublicKey) {
  return program.account.player.fetch(address);
}

export function fetchSeasonProfile(program: PixlProgram, address: PublicKey) {
  return program.account.seasonProfile.fetch(address);
}
