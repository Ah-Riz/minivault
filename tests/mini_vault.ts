import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { MiniVault } from "../target/types/mini_vault";

describe("mini_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MiniVault as Program<MiniVault>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let mint: PublicKey;
  let vaultConfig: PublicKey;
  let vaultTokenAccount: PublicKey;
  let userAta: PublicKey;

  const user = Keypair.generate();
  const attacker = Keypair.generate();

  const decimals = 6;
  const depositAmount = new anchor.BN(1_000_000); // 1 token

  function positionPda(owner: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), mint.toBuffer(), owner.toBuffer()],
      program.programId
    )[0];
  }

  before(async () => {
    const conn = provider.connection;
    const sigs = await Promise.all([
      conn.requestAirdrop(user.publicKey, 2e9),
      conn.requestAirdrop(attacker.publicKey, 1e9),
    ]);
    await Promise.all(sigs.map((s) => conn.confirmTransaction(s, "confirmed")));

    mint = await createMint(conn, authority, authority.publicKey, null, decimals);

    [vaultConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_config"), mint.toBuffer()],
      program.programId
    );
    vaultTokenAccount = getAssociatedTokenAddressSync(mint, vaultConfig, true);

    userAta = await createAssociatedTokenAccount(
      conn,
      authority,
      mint,
      user.publicKey
    );
    await mintTo(conn, authority, mint, userAta, authority, 10_000_000);
  });

  it("initializes vault config and vault ATA", async () => {
    await program.methods
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

    const config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.mint.toBase58()).to.equal(mint.toBase58());
    expect(config.vaultTokenAccount.toBase58()).to.equal(vaultTokenAccount.toBase58());
    expect(config.paused).to.equal(false);
    expect(config.totalDeposits.toNumber()).to.equal(0);

    const vaultAta = await getAccount(provider.connection, vaultTokenAccount);
    expect(vaultAta.owner.toBase58()).to.equal(vaultConfig.toBase58());
    expect(vaultAta.mint.toBase58()).to.equal(mint.toBase58());
  });

  it("deposit credits user position and moves tokens", async () => {
    const userPos = positionPda(user.publicKey);
    const beforeUser = await getAccount(provider.connection, userAta);

    await program.methods
      .deposit(depositAmount)
      .accounts({
        owner: user.publicKey,
        mint,
        vaultConfig,
        userPosition: userPos,
        userTokenAccount: userAta,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const position = await program.account.userPosition.fetch(userPos);
    expect(position.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(position.amount.toNumber()).to.equal(depositAmount.toNumber());

    const config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.totalDeposits.toNumber()).to.equal(depositAmount.toNumber());

    const afterUser = await getAccount(provider.connection, userAta);
    const vaultBal = await getAccount(provider.connection, vaultTokenAccount);
    expect(Number(beforeUser.amount - afterUser.amount)).to.equal(depositAmount.toNumber());
    expect(Number(vaultBal.amount)).to.equal(depositAmount.toNumber());
  });

  it("rejects zero amount deposit", async () => {
    const userPos = positionPda(user.publicKey);
    try {
      await program.methods
        .deposit(new anchor.BN(0))
        .accounts({
          owner: user.publicKey,
          mint,
          vaultConfig,
          userPosition: userPos,
          userTokenAccount: userAta,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.equal("InvalidAmount");
    }
  });

  it("rejects over-withdraw", async () => {
    const userPos = positionPda(user.publicKey);
    try {
      await program.methods
        .withdraw(depositAmount.add(new anchor.BN(1)))
        .accounts({
          owner: user.publicKey,
          mint,
          vaultConfig,
          userPosition: userPos,
          userTokenAccount: userAta,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.equal("InsufficientBalance");
    }
  });

  it("pause blocks deposit and withdraw; unpause restores", async () => {
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        vaultConfig,
      })
      .rpc();

    let config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.paused).to.equal(true);

    const userPos = positionPda(user.publicKey);

    try {
      await program.methods
        .deposit(new anchor.BN(1))
        .accounts({
          owner: user.publicKey,
          mint,
          vaultConfig,
          userPosition: userPos,
          userTokenAccount: userAta,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.equal("VaultPaused");
    }

    try {
      await program.methods
        .withdraw(new anchor.BN(1))
        .accounts({
          owner: user.publicKey,
          mint,
          vaultConfig,
          userPosition: userPos,
          userTokenAccount: userAta,
          vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.equal("VaultPaused");
    }

    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        vaultConfig,
      })
      .rpc();

    config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.paused).to.equal(false);
  });

  it("unauthorized pause fails", async () => {
    try {
      await program.methods
        .pause()
        .accounts({
          authority: attacker.publicKey,
          vaultConfig,
        })
        .signers([attacker])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      expect((err as AnchorError).error.errorCode.code).to.equal("Unauthorized");
    }
  });

  it("withdraw returns tokens", async () => {
    const userPos = positionPda(user.publicKey);
    const beforeUser = await getAccount(provider.connection, userAta);
    const withdrawAmt = new anchor.BN(400_000);

    await program.methods
      .withdraw(withdrawAmt)
      .accounts({
        owner: user.publicKey,
        mint,
        vaultConfig,
        userPosition: userPos,
        userTokenAccount: userAta,
        vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const position = await program.account.userPosition.fetch(userPos);
    expect(position.amount.toNumber()).to.equal(
      depositAmount.sub(withdrawAmt).toNumber()
    );

    const config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.totalDeposits.toNumber()).to.equal(
      depositAmount.sub(withdrawAmt).toNumber()
    );

    const afterUser = await getAccount(provider.connection, userAta);
    expect(Number(afterUser.amount - beforeUser.amount)).to.equal(withdrawAmt.toNumber());
  });
});
