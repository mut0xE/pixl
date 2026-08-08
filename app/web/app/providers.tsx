"use client";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { ToastProvider } from "../components/Toast";

// Canonical Solana devnet (not MagicBlock's proxy) so wallets recognize the
// network from the blockhash genesis and don't warn about a network mismatch.
const RPC = process.env.NEXT_PUBLIC_L1_RPC ?? "https://api.devnet.solana.com";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
