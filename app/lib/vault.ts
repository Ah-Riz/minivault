import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
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
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { idl, MINT } from "./constants";
import type { MiniVault } from "./mini_vault";
import {
  getProgram,
  getProvider,
  userPositionPda,
  vaultConfigPda,
  vaultTokenAta,
} from "./program";

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

function isBlockhashError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /blockhash not found|block height exceeded|expired/i.test(msg);
}

/** Format wallet/RPC errors for the UI (include logs when present). */
export async function formatTxError(err: unknown, connection?: Connection): Promise<string> {
  if (err instanceof SendTransactionError) {
    try {
      const logs = connection
        ? await err.getLogs(connection)
        : ((err as SendTransactionError & { logs?: string[] }).logs ?? []);
      if (logs?.length) return `${err.message}\nLogs:\n${logs.join("\n")}`;
    } catch {
      /* ignore */
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sign + send with a fresh blockhash from the same Connection used for confirms.
 * Retries once on blockhash / expiry races common on public Devnet RPCs.
 */
export async function sendTx(
  connection: Connection,
  wallet: AnchorWallet,
  ixs: TransactionInstruction[]
): Promise<string> {
  const attempt = async (): Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(...ixs);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    const signed = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    const conf = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    if (conf.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);
    }
    return sig;
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isBlockhashError(err)) throw err;
    return attempt();
  }
}

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
    preflightCommitment: "confirmed",
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

  const depositIx = await program.methods
    .deposit(amountRaw)
    .accountsPartial({
      owner,
      mint,
      vaultConfig,
      userPosition,
      userTokenAccount,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const ixs = createIx ? [createIx, depositIx] : [depositIx];
  return sendTx(connection, wallet, ixs);
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

  const withdrawIx = await program.methods
    .withdraw(amountRaw)
    .accountsPartial({
      owner,
      mint,
      vaultConfig,
      userPosition,
      userTokenAccount,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const ixs = createIx ? [createIx, withdrawIx] : [withdrawIx];
  return sendTx(connection, wallet, ixs);
}

export async function pauseVault(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  const ix = await program.methods
    .pause()
    .accountsPartial({ authority: wallet.publicKey, vaultConfig })
    .instruction();
  return sendTx(connection, wallet, [ix]);
}

export async function unpauseVault(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  const ix = await program.methods
    .unpause()
    .accountsPartial({ authority: wallet.publicKey, vaultConfig })
    .instruction();
  return sendTx(connection, wallet, [ix]);
}

export async function closePosition(
  connection: Connection,
  wallet: AnchorWallet,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const owner = wallet.publicKey;
  const [vaultConfig] = vaultConfigPda(mint);
  const [userPosition] = userPositionPda(owner, mint);
  const ix = await program.methods
    .closePosition()
    .accountsPartial({ owner, mint, vaultConfig, userPosition })
    .instruction();
  return sendTx(connection, wallet, [ix]);
}

export async function transferAuthority(
  connection: Connection,
  wallet: AnchorWallet,
  newAuthority: PublicKey,
  mint: PublicKey = MINT
): Promise<string> {
  const provider = getProvider(connection, wallet);
  const program = getProgram(provider);
  const [vaultConfig] = vaultConfigPda(mint);
  const ix = await program.methods
    .transferAuthority()
    .accountsPartial({
      authority: wallet.publicKey,
      newAuthority,
      vaultConfig,
    })
    .instruction();
  return sendTx(connection, wallet, [ix]);
}

export async function fetchUserAtaBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey = MINT
): Promise<string> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    const acct = await getAccount(connection, ata);
    return acct.amount.toString();
  } catch {
    return "0";
  }
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
  const ix = await program.methods
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
    .instruction();
  return sendTx(connection, wallet, [ix]);
}
