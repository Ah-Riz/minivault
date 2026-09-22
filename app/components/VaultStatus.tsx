"use client";

import type { PositionView, VaultView } from "../lib/vault";

function short(pk: string) {
  if (!pk || pk.length < 8) return "—";
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function formatRaw(raw: string, decimals = 6): string {
  const n = BigInt(raw || "0");
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function VaultStatus({
  vault,
  position,
  decimals = 6,
}: {
  vault: VaultView | null;
  position: PositionView | null;
  decimals?: number;
}) {
  if (!vault) {
    return <p className="text-sm text-zinc-500">Loading vault…</p>;
  }

  if (!vault.exists) {
    return (
      <div className="space-y-2 text-sm text-zinc-400">
        <p>No vault found for this mint on the configured cluster.</p>
        <p className="font-mono text-xs text-zinc-500">mint {short(vault.mint)}</p>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-zinc-500">Status</dt>
        <dd className={vault.paused ? "text-amber-300" : "text-emerald-300"}>
          {vault.paused ? "Paused" : "Active"}
        </dd>
      </div>
      <div>
        <dt className="text-zinc-500">Total deposits</dt>
        <dd className="font-mono">{formatRaw(vault.totalDeposits, decimals)}</dd>
      </div>
      <div>
        <dt className="text-zinc-500">Your balance</dt>
        <dd className="font-mono">{formatRaw(position?.amount ?? "0", decimals)}</dd>
      </div>
      <div>
        <dt className="text-zinc-500">Authority</dt>
        <dd className="font-mono">{short(vault.authority)}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-zinc-500">Mint</dt>
        <dd className="break-all font-mono text-xs">{vault.mint}</dd>
      </div>
    </dl>
  );
}
