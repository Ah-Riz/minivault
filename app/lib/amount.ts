import { BN } from "@coral-xyz/anchor";

/** Parse a decimal token amount string into raw base units. */
export function toRaw(amount: string, decimals: number): BN {
  const [whole, frac = ""] = amount.trim().split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return new BN(whole || "0").mul(new BN(10).pow(new BN(decimals))).add(new BN(padded || "0"));
}

/** Format raw base units as a decimal string. */
export function formatRaw(raw: string, decimals = 6): string {
  const n = BigInt(raw || "0");
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
