"use client";

import { useConnection, useWallet, type AnchorWallet } from "@solana/wallet-adapter-react";
import { FormEvent, useState } from "react";
import { formatRaw, toRaw } from "../lib/amount";
import { TOKEN_SYMBOL } from "../lib/constants";
import { deposit, formatTxError } from "../lib/vault";
import { TxState, TxStatus } from "./TxStatus";

export function DepositForm({
  decimals = 6,
  disabled,
  walletBalanceRaw,
  onDone,
}: {
  decimals?: number;
  disabled?: boolean;
  walletBalanceRaw?: string | null;
  onDone?: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("1");
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;
    try {
      setTx({ status: "pending" });
      const sig = await deposit(connection, wallet as AnchorWallet, toRaw(amount, decimals));
      setTx({ status: "success", signature: sig });
      onDone?.();
    } catch (err) {
      setTx({
        status: "error",
        message: await formatTxError(err, connection),
      });
    }
  }

  const bal = walletBalanceRaw ?? "0";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span className="flex items-center justify-between gap-2 font-medium text-muted">
          <span>Deposit amount ({TOKEN_SYMBOL})</span>
          <span className="font-mono text-xs font-normal">
            Wallet {formatRaw(bal, decimals)}
            <button
              type="button"
              className="ml-2 font-semibold text-tosca-700 underline underline-offset-2"
              disabled={disabled || !wallet.connected}
              onClick={() => setAmount(formatRaw(bal, decimals))}
            >
              Max
            </button>
          </span>
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="field-input"
          disabled={disabled || !wallet.connected}
        />
      </label>
      <button
        type="submit"
        disabled={disabled || !wallet.connected || tx.status === "pending"}
        className="btn btn-primary"
      >
        Deposit
      </button>
      <TxStatus state={tx} />
    </form>
  );
}
