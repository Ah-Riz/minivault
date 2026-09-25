"use client";

import type { PositionView, VaultView } from "../lib/vault";
import { formatRaw } from "../lib/amount";
import { TOKEN_DECIMALS, shortPk } from "../lib/constants";

export function VaultStatus({
  vault,
  position,
}: {
  vault: VaultView | null;
  position: PositionView | null;
}) {
  if (!vault) {
    return <p className="text-sm text-muted">Loading vault…</p>;
  }

  if (!vault.exists) {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>No vault found for this mint on the configured cluster.</p>
        <p className="font-mono text-xs">mint {shortPk(vault.mint)}</p>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-4 text-sm">
      <div className="rounded-md border border-[color:var(--border-subtle)] bg-secondary/60 px-3 py-2">
        <dt className="text-muted">Status</dt>
        <dd className={vault.paused ? "font-semibold text-warning" : "font-semibold text-success"}>
          {vault.paused ? "Paused" : "Active"}
        </dd>
      </div>
      <div className="rounded-md border border-[color:var(--border-subtle)] bg-secondary/60 px-3 py-2">
        <dt className="text-muted">Total deposits</dt>
        <dd className="nums font-mono font-semibold text-ink">
          {formatRaw(vault.totalDeposits, TOKEN_DECIMALS)}
        </dd>
      </div>
      <div className="rounded-md border border-[color:var(--border-subtle)] bg-secondary/60 px-3 py-2">
        <dt className="text-muted">Your balance</dt>
        <dd className="nums font-mono font-semibold text-ink">
          {formatRaw(position?.amount ?? "0", TOKEN_DECIMALS)}
        </dd>
      </div>
      <div className="rounded-md border border-[color:var(--border-subtle)] bg-secondary/60 px-3 py-2">
        <dt className="text-muted">Authority</dt>
        <dd className="font-mono text-ink">{shortPk(vault.authority)}</dd>
      </div>
      <div className="col-span-2 rounded-md border border-[color:var(--border-subtle)] bg-secondary/60 px-3 py-2">
        <dt className="text-muted">Mint</dt>
        <dd className="break-all font-mono text-xs text-ink">{vault.mint}</dd>
      </div>
    </dl>
  );
}
