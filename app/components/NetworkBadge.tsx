"use client";

import { CLUSTER } from "../lib/constants";

/** Always-visible Solana cluster chip — reads from CLUSTER constant. */
export function NetworkBadge() {
  const label = CLUSTER.toUpperCase();

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-warning"
      title={`Connected cluster: ${CLUSTER}`}
      aria-label={`Network ${label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
      {label}
    </span>
  );
}
