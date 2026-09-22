import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? idl.address
);

/** Set NEXT_PUBLIC_MINT in .env.local / wrangler vars after creating a mint. */
const mintEnv = process.env.NEXT_PUBLIC_MINT?.trim();
export const MINT = new PublicKey(
  mintEnv && mintEnv.length > 0
    ? mintEnv
    : "So11111111111111111111111111111111111111112"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const CLUSTER = "devnet" as const;

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${CLUSTER}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

export { idl };
