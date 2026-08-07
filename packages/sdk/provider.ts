import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { Connection, type Commitment } from "@solana/web3.js";

export const MAGICBLOCK_DEVNET_ROUTER = "https://devnet.magicblock.app";

export type EndpointConfig = {
  l1Rpc: string;
  erRpc: string;
  commitment?: Commitment;
};

export type PixlConnections = {
  l1: Connection;
  er: Connection;
};

export function createConnections(config: EndpointConfig): PixlConnections {
  const commitment = config.commitment ?? "confirmed";
  return {
    l1: new Connection(config.l1Rpc, commitment),
    er: new Connection(config.erRpc, commitment),
  };
}

export type PixlProviders = {
  l1: AnchorProvider;
  er: AnchorProvider;
};

export function createProviders(
  connections: PixlConnections,
  wallet: Wallet,
  commitment: Commitment = "confirmed"
): PixlProviders {
  const opts = { commitment, preflightCommitment: commitment };
  return {
    l1: new AnchorProvider(connections.l1, wallet, opts),
    er: new AnchorProvider(connections.er, wallet, opts),
  };
}
