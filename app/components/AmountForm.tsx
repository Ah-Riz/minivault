"use client";

import { useConnection, useWallet, type AnchorWallet } from "@solana/wallet-adapter-react";
import { FormEvent, useState } from "react";
import { formatRaw, toRaw } from "../lib/amount";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, USDC_FAUCET_URL } from "../lib/constants";
import { deposit, formatTxError, withdraw } from "../lib/vault";
import { TxState, TxStatus } from "./TxStatus";

export function AmountForm({
  mode,
  disabled,
  balanceRaw,
  onDone,
}: {
  mode: "deposit" | "withdraw";
  disabled?: boolean;
  balanceRaw?: string | null;
  onDone?: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [amount, setAmount] = useState(mode === "deposit" ? "1" : "0.5");
  const [tx, setTx] = useState<TxState>({ status: "idle" });

  const isDeposit = mode === "deposit";
  const bal = balanceRaw ?? "0";
  const balRaw = BigInt(bal || "0");
  const empty = balRaw === 0n;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.signTransaction) return;

    const amountRaw = toRaw(amount, TOKEN_DECIMALS);
    if (amountRaw.isZero() || amountRaw.isNeg()) {
      setTx({ status: "error", message: "Amount must be greater than zero." });
      return;
    }
    if (BigInt(amountRaw.toString()) > balRaw) {
      setTx({
        status: "error",
        message: isDeposit
          ? `Not enough ${TOKEN_SYMBOL} in wallet. Balance: ${formatRaw(bal, TOKEN_DECIMALS)}. Get Devnet ${TOKEN_SYMBOL}: ${USDC_FAUCET_URL}`
          : `Not enough vault balance. Position: ${formatRaw(bal, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}.`,
      });
      return;
    }

    try {
      setTx({ status: "pending" });
      const send = isDeposit ? deposit : withdraw;
      const sig = await send(connection, wallet as AnchorWallet, amountRaw);
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
        <span className="flex items-center justify-between gap-2 font-medium text-muted">
          <span>
            {isDeposit ? "Deposit" : "Withdraw"} amount ({TOKEN_SYMBOL})
          </span>
          <span className="font-mono text-xs font-normal">
            {isDeposit ? "Wallet" : "Position"} {formatRaw(bal, TOKEN_DECIMALS)}
            <button
              type="button"
              className="ml-2 font-semibold text-tosca-700 underline underline-offset-2"
              disabled={disabled || !wallet.connected || empty}
              onClick={() => setAmount(formatRaw(bal, TOKEN_DECIMALS))}
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
      {isDeposit && empty && wallet.connected && (
        <p className="text-xs text-muted">
          Wallet has 0 {TOKEN_SYMBOL}.{" "}
          <a
            className="font-semibold text-tosca-700 underline underline-offset-2"
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
          >
            Get Devnet {TOKEN_SYMBOL}
          </a>
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || !wallet.connected || tx.status === "pending" || empty}
        className={`btn ${isDeposit ? "btn-primary" : "btn-secondary"}`}
      >
        {isDeposit ? "Deposit" : "Withdraw"}
      </button>
      <TxStatus state={tx} />
    </form>
  );
}
