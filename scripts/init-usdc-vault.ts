/**
 * Initialize MiniVault for classic Devnet USDC (no mint creation).
 * Writes deployments/devnet.json.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { MiniVault } from "../target/types/mini_vault";

/** Classic SPL USDC on Solana Devnet. */
const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });

  const walletPath = (
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`
  ).replace(/^~/, process.env.HOME ?? "");
  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8")) as number[];
  const authority = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secret));
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "mini_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl as MiniVault, provider) as Program<MiniVault>;

  const mint = DEVNET_USDC;
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config"), mint.toBuffer()],
    program.programId
  );
  const vaultTokenAccount = getAssociatedTokenAddressSync(mint, vaultConfig, true);

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Program:  ", program.programId.toBase58());
  console.log("Mint:     ", mint.toBase58(), "(Devnet USDC)");
  console.log("Config:   ", vaultConfig.toBase58());

  let initializeSignature = "";
  const existing = await connection.getAccountInfo(vaultConfig);
  if (existing) {
    console.log("Vault already initialized for this mint — skipping initialize.");
  } else {
    console.log("Initializing USDC vault…");
    initializeSignature = await program.methods
      .initialize()
      .accounts({
        authority: authority.publicKey,
        mint,
        vaultConfig,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Initialize tx:", initializeSignature);
  }

  const config = await program.account.vaultConfig.fetch(vaultConfig);
  const prevPath = path.join(__dirname, "..", "deployments", "devnet.json");
  let frontendUrl = "https://minivault.ahmadrizkimaulana666.workers.dev";
  if (fs.existsSync(prevPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, "utf8")) as { frontendUrl?: string };
      if (prev.frontendUrl) frontendUrl = prev.frontendUrl;
    } catch {
      /* ignore */
    }
  }

  const out = {
    cluster: "devnet",
    tokenSymbol: "USDC",
    programId: program.programId.toBase58(),
    mint: mint.toBase58(),
    vaultConfig: vaultConfig.toBase58(),
    vaultTokenAccount: vaultTokenAccount.toBase58(),
    authority: authority.publicKey.toBase58(),
    initializeSignature: initializeSignature || "(already initialized)",
    paused: config.paused,
    totalDeposits: config.totalDeposits.toString(),
    rpc,
    frontendUrl,
    faucet: "https://faucet.circle.com/",
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "devnet.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
