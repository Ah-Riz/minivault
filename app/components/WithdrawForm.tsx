"use client";

import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { FormEvent, useState } from "react";
import { withdraw } from "../lib/vault";
import { TxState, TxStatus } from "./TxStatus";

function toRaw(amount: string, decimals: number): BN {
  const [whole, frac = ""] = amount.trim().split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return new BN(whole || "0").mul(new BN(10).pow(new BN(decimals))).add(new BN(padded || "0"));
}

export function WithdrawForm({
  decimals = 6,
  disabled,
  onDone,
}: {
  decimals?: number;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState("0.5");
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;
    try {
      setTx({ status: "pending" });
      const sig = await withdraw(connection, wallet as never, toRaw(amount, decimals));
      setTx({ status: "success", signature: sig });
      onDone?.();
    } catch (err) {
      setTx({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-400">Withdraw amount</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-100"
          disabled={disabled || !wallet.connected}
        />
      </label>
      <button
        type="submit"
        disabled={disabled || !wallet.connected || tx.status === "pending"}
        className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 disabled:opacity-50"
      >
        Withdraw
      </button>
      <TxStatus state={tx} />
    </form>
  );
}
