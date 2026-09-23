"use client";

import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { FormEvent, useState } from "react";
import { deposit, formatTxError } from "../lib/vault";
import { TOKEN_SYMBOL } from "../lib/constants";
import { TxState, TxStatus } from "./TxStatus";

function toRaw(amount: string, decimals: number): BN {
  const [whole, frac = ""] = amount.trim().split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return new BN(whole || "0").mul(new BN(10).pow(new BN(decimals))).add(new BN(padded || "0"));
}

export function DepositForm({
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
  const [amount, setAmount] = useState("1");
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;
    try {
      setTx({ status: "pending" });
      const sig = await deposit(connection, wallet as never, toRaw(amount, decimals));
      setTx({ status: "success", signature: sig });
      onDone?.();
    } catch (err) {
      setTx({
        status: "error",
        message: await formatTxError(err, connection),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-muted">Deposit amount ({TOKEN_SYMBOL})</span>
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
