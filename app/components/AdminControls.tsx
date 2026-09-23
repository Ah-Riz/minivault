"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import {
  initializeVault,
  pauseVault,
  unpauseVault,
  type VaultView,
} from "../lib/vault";
import { TxState, TxStatus } from "./TxStatus";

export function AdminControls({
  vault,
  onDone,
}: {
  vault: VaultView | null;
  onDone?: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  const isAdmin =
    wallet.publicKey &&
    vault?.exists &&
    vault.authority === wallet.publicKey.toBase58();

  async function run(action: () => Promise<string>) {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    try {
      setTx({ status: "pending" });
      const sig = await action();
      setTx({ status: "success", signature: sig });
      onDone?.();
    } catch (err) {
      setTx({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!wallet.connected) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted">Admin</p>
      <div className="flex flex-wrap gap-2">
        {!vault?.exists && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={tx.status === "pending"}
            onClick={() => run(() => initializeVault(connection, wallet as never))}
          >
            Initialize vault
          </button>
        )}
        {isAdmin && vault && !vault.paused && (
          <button
            type="button"
            className="btn btn-warning"
            disabled={tx.status === "pending"}
            onClick={() => run(() => pauseVault(connection, wallet as never))}
          >
            Pause
          </button>
        )}
        {isAdmin && vault?.paused && (
          <button
            type="button"
            className="btn btn-success"
            disabled={tx.status === "pending"}
            onClick={() => run(() => unpauseVault(connection, wallet as never))}
          >
            Unpause
          </button>
        )}
      </div>
      <TxStatus state={tx} />
    </div>
  );
}
