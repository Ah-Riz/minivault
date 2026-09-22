import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { MINT } from "./constants";
import {
  getProgram,
  getProvider,
  userPositionPda,
  vaultConfigPda,
  vaultTokenAta,
} from "./program";
import type { MiniVault } from "./mini_vault";
import { idl } from "./constants";
import { Program } from "@coral-xyz/anchor";

export type VaultView = {
  authority: string;
  mint: string;
  vaultTokenAccount: string;
  paused: boolean;
  totalDeposits: string;
  exists: boolean;
};

export type PositionView = {
  amount: string;
  exists: boolean;
};

/** Read-only dummy wallet for account fetches (never signs). */
function readOnlyWallet(): AnchorWallet {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
  };
}

function readProgram(connection: Connection): Program<MiniVault> {
  const provider = new AnchorProvider(connection, readOnlyWallet(), {
    commitment: "confirmed",
  });
  return new Program(idl as MiniVault, provider);
}

export async function fetchVault(
  connection: Connection,
  mint: PublicKey = MINT
): Promise<VaultView> {
  const [vaultConfig] = vaultConfigPda(mint);
  const empty: VaultView = {
    authority: "",
    mint: mint.toBase58(),
    vaultTokenAccount: "",
    paused: false,
    totalDeposits: "0",
    exists: false,
  };
  try {
    const info = await connection.getAccountInfo(vaultConfig);
    if (!info) return empty;
    const program = readProgram(connection);
    const config = await program.account.vaultConfig.fetch(vaultConfig);
    return {
      authority: config.authority.toBase58(),
      mint: config.mint.toBase58(),
      vaultTokenAccount: config.vaultTokenAccount.toBase58(),
      paused: config.paused,
      totalDeposits: config.totalDeposits.toString(),
      exists: true,
    };
  } catch {
    return empty;
  }
}

export async function fetchPosition(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey = MINT
): Promise<PositionView> {
  const [userPosition] = userPositionPda(owner, mint);
  try {
    const info = await connection.getAccountInfo(userPosition);
    if (!info) return { amount: "0", exists: false };
    const program = readProgram(connection);
    const pos = await program.account.userPosition.fetch(userPosition);
    return { amount: pos.amount.toString(), exists: true };
  } catch {
    return { amount: "0", exists: false };
  }
}

async function ensureUserAta(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<{
  ata: PublicKey;
  createIx: ReturnType<typeof createAssociatedTokenAccountInstruction> | null;
}> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    await getAccount(connection, ata);
    return { ata, createIx: null };
  } catch {
    return {
      ata,
      createIx: createAssociatedTokenAccountInstruction(owner, ata, owner, mint),
    };
  }
}

export async function deposit(
  connection: Connection,
  wallet: AnchorWallet,
  amountRaw: BN,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const owner = wallet.publicKey;
  const [vaultConfig] = vaultConfigPda(mint);
  const [userPosition] = userPositionPda(owner, mint);
  const vaultTokenAccount = vaultTokenAta(mint);
  const { ata: userTokenAccount, createIx } = await ensureUserAta(connection, mint, owner);

  const builder = program.methods.deposit(amountRaw).accountsPartial({
    owner,
    mint,
    vaultConfig,
    userPosition,
    userTokenAccount,
    vaultTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  });

  if (createIx) {
    const tx = new Transaction().add(createIx).add(await builder.instruction());
    return provider.sendAndConfirm(tx);
  }
  return builder.rpc();
}

export async function withdraw(
  connection: Connection,
  wallet: AnchorWallet,
  amountRaw: BN,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const owner = wallet.publicKey;
  const [vaultConfig] = vaultConfigPda(mint);
  const [userPosition] = userPositionPda(owner, mint);
  const vaultTokenAccount = vaultTokenAta(mint);
  const { ata: userTokenAccount, createIx } = await ensureUserAta(connection, mint, owner);

  const builder = program.methods.withdraw(amountRaw).accountsPartial({
    owner,
    mint,
    vaultConfig,
    userPosition,
    userTokenAccount,
    vaultTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  if (createIx) {
    const tx = new Transaction().add(createIx).add(await builder.instruction());
    return provider.sendAndConfirm(tx);
  }
  return builder.rpc();
}

export async function pauseVault(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  return program.methods
    .pause()
    .accountsPartial({ authority: wallet.publicKey, vaultConfig })
    .rpc();
}

export async function unpauseVault(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  return program.methods
    .unpause()
    .accountsPartial({ authority: wallet.publicKey, vaultConfig })
    .rpc();
}

export async function initializeVault(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  const vaultTokenAccount = vaultTokenAta(mint);
  return program.methods
    .initialize()
    .accountsPartial({
      authority: wallet.publicKey,
      mint,
      vaultConfig,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
