import type { Metadata } from "next";
import { WalletProviders } from "../components/WalletProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiniVault",
  description: "Solana SPL token vault protocol",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
