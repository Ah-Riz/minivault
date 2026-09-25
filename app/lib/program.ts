import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { idl, PROGRAM_ID, MINT } from "./constants";
import type { MiniVault } from "./mini_vault";

export function getProvider(connection: Connection, wallet: AnchorWallet): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

export function getProgram(provider: AnchorProvider): Program<MiniVault> {
  return new Program(idl as MiniVault, provider);
}

export function vaultConfigPda(mint: PublicKey = MINT): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config"), mint.toBuffer()],
    PROGRAM_ID
  );
}

export function userPositionPda(owner: PublicKey, mint: PublicKey = MINT): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_position"), mint.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function vaultTokenAta(mint: PublicKey = MINT): PublicKey {
  const [config] = vaultConfigPda(mint);
  return getAssociatedTokenAddressSync(mint, config, true);
}
