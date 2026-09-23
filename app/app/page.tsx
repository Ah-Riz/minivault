"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useState } from "react";
import { AdminControls } from "../components/AdminControls";
import { DepositForm } from "../components/DepositForm";
import { NetworkBadge } from "../components/NetworkBadge";
import { VaultStatus } from "../components/VaultStatus";
import { WithdrawForm } from "../components/WithdrawForm";
import { CLUSTER, MINT, PROGRAM_ID, explorerAddressUrl } from "../lib/constants";
import { fetchPosition, fetchVault, type PositionView, type VaultView } from "../lib/vault";

function short(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export default function HomePage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [vault, setVault] = useState<VaultView | null>(null);
  const [position, setPosition] = useState<PositionView | null>(null);

  const refresh = useCallback(async () => {
    const v = await fetchVault(connection);
    setVault(v);
    if (publicKey) {
      setPosition(await fetchPosition(connection, publicKey));
    } else {
      setPosition(null);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  const programId = PROGRAM_ID.toBase58();
  const mint = MINT.toBase58();

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
            SPL token vault
          </p>
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Deposit and withdraw on Solana {CLUSTER}
          </h1>
          <p className="max-w-xl text-muted">
            Live protocol demo. Admin can pause the vault. This UI talks to{" "}
            <span className="font-mono font-semibold text-warning">{CLUSTER}</span> only —
            switch your wallet network to match.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <a
              className="font-mono underline underline-offset-2 hover:text-tosca-700"
              href={explorerAddressUrl(programId)}
              target="_blank"
              rel="noreferrer"
            >
              program {short(programId)}
            </a>
            <span aria-hidden>·</span>
            <a
              className="font-mono underline underline-offset-2 hover:text-tosca-700"
              href={explorerAddressUrl(mint)}
              target="_blank"
              rel="noreferrer"
            >
              mint {short(mint)}
            </a>
          </p>
        </section>

        <section className="elev space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Vault</h2>
            <NetworkBadge />
          </div>
          <VaultStatus vault={vault} position={position} />
          {connected && publicKey ? (
            <p className="font-mono text-xs text-muted">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </p>
          ) : (
            <p className="text-sm text-muted">Connect a wallet to deposit or withdraw.</p>
          )}
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div className="elev space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Deposit</h2>
            <DepositForm disabled={vault?.paused || !vault?.exists} onDone={refresh} />
          </div>
          <div className="elev space-y-4 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Withdraw</h2>
            <WithdrawForm disabled={vault?.paused || !vault?.exists} onDone={refresh} />
          </div>
        </section>

        <section className="elev p-6">
          <AdminControls vault={vault} onDone={refresh} />
        </section>
      </main>
    </div>
  );
}
