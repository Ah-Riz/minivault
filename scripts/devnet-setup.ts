/**
 * Deploy-ready setup for MiniVault on Solana devnet.
 * Assumes: `anchor deploy --provider.cluster devnet` already ran (or run via npm script).
 *
 * Creates a demo SPL mint, mints tokens to the authority, initializes the vault,
 * and writes deployments/devnet.json.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { MiniVault } from "../target/types/mini_vault";

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const walletPath = (
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`
  ).replace(/^~/, process.env.HOME ?? "");
  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8")) as number[];
  const authority = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secret));
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "..", "target", "idl", "mini_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl as MiniVault, provider) as Program<MiniVault>;

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Program:  ", program.programId.toBase58());

  const decimals = 6;
  console.log("Creating mint…");
  const mint = await createMint(
    connection,
    authority,
    authority.publicKey,
    null,
    decimals
  );
  console.log("Mint:     ", mint.toBase58());

  const userAta = await createAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey
  );
  const mintAmount = 1_000_000_000_000n; // 1_000_000 tokens * 10^6
  await mintTo(connection, authority, mint, userAta, authority, mintAmount);
  console.log("Minted tokens to", userAta.toBase58());

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config"), mint.toBuffer()],
    program.programId
  );
  const vaultTokenAccount = getAssociatedTokenAddressSync(mint, vaultConfig, true);

  console.log("Initializing vault…");
  const sig = await program.methods
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
  console.log("Initialize tx:", sig);

  const config = await program.account.vaultConfig.fetch(vaultConfig);
  const out = {
    cluster: "devnet",
    programId: program.programId.toBase58(),
    mint: mint.toBase58(),
    vaultConfig: vaultConfig.toBase58(),
    vaultTokenAccount: vaultTokenAccount.toBase58(),
    authority: authority.publicKey.toBase58(),
    initializeSignature: sig,
    paused: config.paused,
    totalDeposits: config.totalDeposits.toString(),
    rpc,
    frontendUrl: "",
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
