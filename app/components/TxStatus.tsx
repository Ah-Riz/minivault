"use client";

import { explorerTxUrl } from "../lib/constants";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; message?: string }
  | { status: "success"; signature: string }
  | { status: "error"; message: string };

export function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;

  if (state.status === "pending") {
    return (
      <p
        className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-warning"
        role="status"
      >
        {state.message ?? "Confirm in your wallet…"}
      </p>
    );
  }

  if (state.status === "success") {
    return (
      <p
        className="rounded-md border border-success/35 bg-success/10 px-3 py-2 text-sm text-success"
        role="status"
      >
        Confirmed.{" "}
        <a
          className="font-semibold underline underline-offset-2"
          href={explorerTxUrl(state.signature)}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer
        </a>
      </p>
    );
  }

  return (
    <p
      className="rounded-md border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {state.message}
    </p>
  );
}
