"use client";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; message?: string }
  | { status: "success"; signature: string }
  | { status: "error"; message: string };

export function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;

  if (state.status === "pending") {
    return (
      <p className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
        {state.message ?? "Confirm in your wallet…"}
      </p>
    );
  }

  if (state.status === "success") {
    const url = `https://explorer.solana.com/tx/${state.signature}?cluster=devnet`;
    return (
      <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
        Confirmed.{" "}
        <a className="underline underline-offset-2" href={url} target="_blank" rel="noreferrer">
          View on explorer
        </a>
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
      {state.message}
    </p>
  );
}
