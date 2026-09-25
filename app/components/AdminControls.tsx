"use client";

import { useConnection, useWallet, type AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import {
  closePosition,
  formatTxError,
  initializeVault,
  pauseVault,
  transferAuthority,
  unpauseVault,
  type PositionView,
  type VaultView,
} from "../lib/vault";
import { TxState, TxStatus } from "./TxStatus";

export function AdminControls({
  vault,
  position,
  onDone,
}: {
  vault: VaultView | null;
  position?: PositionView | null;
  onDone?: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [newAuth, setNewAuth] = useState("");

  const isAdmin =
    wallet.publicKey &&
    vault?.exists &&
    vault.authority === wallet.publicKey.toBase58();

  const canClose =
    wallet.connected && position?.exists && position.amount === "0";

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
        message: await formatTxError(err, connection),
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
            onClick={() => run(() => initializeVault(connection, wallet as AnchorWallet))}
          >
            Initialize vault
          </button>
        )}
        {isAdmin && vault && !vault.paused && (
          <button
            type="button"
            className="btn btn-warning"
            disabled={tx.status === "pending"}
            onClick={() => run(() => pauseVault(connection, wallet as AnchorWallet))}
          >
            Pause
          </button>
        )}
        {isAdmin && vault?.paused && (
          <button
            type="button"
            className="btn btn-success"
            disabled={tx.status === "pending"}
            onClick={() => run(() => unpauseVault(connection, wallet as AnchorWallet))}
          >
            Unpause
          </button>
        )}
        {canClose && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={tx.status === "pending"}
            onClick={() => run(() => closePosition(connection, wallet as AnchorWallet))}
          >
            Close empty position
          </button>
        )}
      </div>
      {isAdmin && vault?.exists && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[16rem] flex-1 space-y-1.5 text-sm">
            <span className="font-medium text-muted">New authority</span>
            <input
              type="text"
              value={newAuth}
              onChange={(e) => setNewAuth(e.target.value)}
              className="field-input font-mono text-xs"
              placeholder="Base58 pubkey"
              disabled={tx.status === "pending"}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={tx.status === "pending" || !newAuth.trim()}
            onClick={() =>
              run(() =>
                transferAuthority(
                  connection,
                  wallet as AnchorWallet,
                  new PublicKey(newAuth.trim())
                )
              )
            }
          >
            Transfer authority
          </button>
        </div>
      )}
      <TxStatus state={tx} />
    </div>
  );
}
