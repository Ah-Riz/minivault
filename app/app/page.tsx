"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useState } from "react";
import { AdminControls } from "../components/AdminControls";
import { AmountForm } from "../components/AmountForm";
import { NetworkBadge } from "../components/NetworkBadge";
import { VaultStatus } from "../components/VaultStatus";
import {
  CLUSTER,
  MINT,
  PROGRAM_ID,
  TOKEN_SYMBOL,
  USDC_FAUCET_URL,
  explorerAddressUrl,
  shortPk,
} from "../lib/constants";
import {
  fetchPosition,
  fetchUserAtaBalance,
  fetchVault,
  type PositionView,
  type VaultView,
} from "../lib/vault";

export default function HomePage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [vault, setVault] = useState<VaultView | null>(null);
  const [position, setPosition] = useState<PositionView | null>(null);
  const [walletBal, setWalletBal] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const v = await fetchVault(connection);
    setVault(v);
    if (publicKey) {
      const [pos, bal] = await Promise.all([
        fetchPosition(connection, publicKey),
        fetchUserAtaBalance(connection, publicKey),
      ]);
      setPosition(pos);
      setWalletBal(bal);
    } else {
      setPosition(null);
      setWalletBal(null);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  const programId = PROGRAM_ID.toBase58();
  const mint = MINT.toBase58();
  const actionsDisabled = vault?.paused || !vault?.exists;

  return (
    <div className="min-h-screen">
      <header className="topbar">
        <div className="mx-auto flex max-w-desk items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <p className="truncate text-lg font-extrabold tracking-tight text-ink">MiniVault</p>
            <NetworkBadge />
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="mx-auto flex max-w-desk flex-col gap-8 px-6 py-10">
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-tosca-700">
            {TOKEN_SYMBOL} vault · Solana
          </p>
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Deposit and withdraw {TOKEN_SYMBOL} on {CLUSTER}
          </h1>
          <p className="max-w-xl text-muted">
            Live protocol demo using Devnet {TOKEN_SYMBOL}. Admin can pause the vault. Switch your
            wallet to{" "}
            <span className="font-mono font-semibold text-warning">{CLUSTER}</span>, then fund{" "}
            {TOKEN_SYMBOL} from the faucet before depositing.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <a
              className="font-semibold text-tosca-700 underline underline-offset-2"
              href={USDC_FAUCET_URL}
              target="_blank"
              rel="noreferrer"
            >
              Get Devnet {TOKEN_SYMBOL}
            </a>
            <span aria-hidden>·</span>
            <a
              className="font-mono underline underline-offset-2 hover:text-tosca-700"
              href={explorerAddressUrl(programId)}
              target="_blank"
              rel="noreferrer"
            >
              program {shortPk(programId)}
            </a>
            <span aria-hidden>·</span>
            <a
              className="font-mono underline underline-offset-2 hover:text-tosca-700"
              href={explorerAddressUrl(mint)}
              target="_blank"
              rel="noreferrer"
            >
              {TOKEN_SYMBOL} {shortPk(mint)}
            </a>
          </p>
        </section>

        <section className="elev space-y-4 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Vault</h2>
          <VaultStatus vault={vault} position={position} />
          {connected && publicKey ? (
            <p className="font-mono text-xs text-muted">{shortPk(publicKey.toBase58())}</p>
          ) : (
            <p className="text-sm text-muted">Connect a wallet to deposit or withdraw.</p>
          )}
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div className="elev space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Deposit</h2>
            <AmountForm
              mode="deposit"
              disabled={actionsDisabled}
              balanceRaw={walletBal}
              onDone={refresh}
            />
          </div>
          <div className="elev space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Withdraw</h2>
            <AmountForm
              mode="withdraw"
              disabled={actionsDisabled}
              balanceRaw={position?.amount}
              onDone={refresh}
            />
          </div>
        </section>

        <section className="elev p-6">
          <AdminControls vault={vault} position={position} onDone={refresh} />
        </section>
      </main>
    </div>
  );
}
