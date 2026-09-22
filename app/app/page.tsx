"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useState } from "react";
import { AdminControls } from "../components/AdminControls";
import { DepositForm } from "../components/DepositForm";
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
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-teal-400">MiniVault</p>
          <h1 className="text-3xl font-semibold tracking-tight">SPL token vault</h1>
          <p className="text-zinc-400">
            Deposit and withdraw SPL tokens. Admin can pause the protocol.
          </p>
          <p className="text-xs text-zinc-500">
            Cluster: <span className="font-mono text-zinc-400">{CLUSTER}</span>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-teal-300"
              href={explorerAddressUrl(programId)}
              target="_blank"
              rel="noreferrer"
            >
              program {short(programId)}
            </a>
            {" · "}
            <a
              className="underline underline-offset-2 hover:text-teal-300"
              href={explorerAddressUrl(mint)}
              target="_blank"
              rel="noreferrer"
            >
              mint {short(mint)}
            </a>
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Vault</h2>
        <VaultStatus vault={vault} position={position} />
        {connected && publicKey ? (
          <p className="font-mono text-xs text-zinc-500">
            {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Connect a wallet to deposit or withdraw.</p>
        )}
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-sm uppercase tracking-widest text-zinc-500">Deposit</h2>
          <DepositForm disabled={vault?.paused || !vault?.exists} onDone={refresh} />
        </div>
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-sm uppercase tracking-widest text-zinc-500">Withdraw</h2>
          <WithdrawForm disabled={vault?.paused || !vault?.exists} onDone={refresh} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <AdminControls vault={vault} onDone={refresh} />
      </section>
    </main>
  );
}
