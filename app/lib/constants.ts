import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

/** Classic SPL USDC on Solana Devnet. */
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? idl.address
);

const mintEnv = process.env.NEXT_PUBLIC_MINT?.trim();
export const MINT = new PublicKey(
  mintEnv && mintEnv.length > 0 ? mintEnv : DEVNET_USDC_MINT
);

export const TOKEN_SYMBOL = "USDC";
export const TOKEN_DECIMALS = 6;

/** Circle / community Devnet USDC faucet. */
export const USDC_FAUCET_URL = "https://faucet.circle.com/";

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
