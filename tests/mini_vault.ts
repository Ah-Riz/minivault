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

  function initAccounts() {
    return {
      authority: authority.publicKey,
      mint,
      vaultConfig,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  function depositAccounts(owner: PublicKey, userTokenAccount: PublicKey, userPos: PublicKey) {
    return {
      owner,
      mint,
      vaultConfig,
      userPosition: userPos,
      userTokenAccount,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  function withdrawAccounts(owner: PublicKey, userTokenAccount: PublicKey, userPos: PublicKey) {
    return {
      owner,
      mint,
      vaultConfig,
      userPosition: userPos,
      userTokenAccount,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  async function expectAnchorError(
    fn: () => Promise<unknown>,
    code: string | string[]
  ): Promise<void> {
    try {
      await fn();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorError);
      const got = (err as AnchorError).error.errorCode.code;
      if (Array.isArray(code)) expect(code).to.include(got);
      else expect(got).to.equal(code);
    }
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

    userAta = await createAssociatedTokenAccount(conn, authority, mint, user.publicKey);
    await mintTo(conn, authority, mint, userAta, authority, 10_000_000);
  });

  it("initializes vault config and vault ATA", async () => {
    await program.methods.initialize().accounts(initAccounts()).rpc();

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
      .accounts(depositAccounts(user.publicKey, userAta, userPos))
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
    await expectAnchorError(
      () =>
        program.methods
          .deposit(new anchor.BN(0))
          .accounts(depositAccounts(user.publicKey, userAta, userPos))
          .signers([user])
          .rpc(),
      "InvalidAmount"
    );
  });

  it("rejects over-withdraw", async () => {
    const userPos = positionPda(user.publicKey);
    await expectAnchorError(
      () =>
        program.methods
          .withdraw(depositAmount.add(new anchor.BN(1)))
          .accounts(withdrawAccounts(user.publicKey, userAta, userPos))
          .signers([user])
          .rpc(),
      "InsufficientBalance"
    );
  });

  it("pause blocks deposit and withdraw; unpause restores", async () => {
    await program.methods
      .pause()
      .accounts({ authority: authority.publicKey, vaultConfig })
      .rpc();

    let config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.paused).to.equal(true);

    const userPos = positionPda(user.publicKey);

    await expectAnchorError(
      () =>
        program.methods
          .deposit(new anchor.BN(1))
          .accounts(depositAccounts(user.publicKey, userAta, userPos))
          .signers([user])
          .rpc(),
      "VaultPaused"
    );

    await expectAnchorError(
      () =>
        program.methods
          .withdraw(new anchor.BN(1))
          .accounts(withdrawAccounts(user.publicKey, userAta, userPos))
          .signers([user])
          .rpc(),
      "VaultPaused"
    );

    await program.methods
      .unpause()
      .accounts({ authority: authority.publicKey, vaultConfig })
      .rpc();

    config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.paused).to.equal(false);
  });

  it("unauthorized pause fails", async () => {
    await expectAnchorError(
      () =>
        program.methods
          .pause()
          .accounts({ authority: attacker.publicKey, vaultConfig })
          .signers([attacker])
          .rpc(),
      "Unauthorized"
    );
  });

  it("withdraw returns tokens", async () => {
    const userPos = positionPda(user.publicKey);
    const beforeUser = await getAccount(provider.connection, userAta);
    const withdrawAmt = new anchor.BN(400_000);

    await program.methods
      .withdraw(withdrawAmt)
      .accounts(withdrawAccounts(user.publicKey, userAta, userPos))
      .signers([user])
      .rpc();

    const position = await program.account.userPosition.fetch(userPos);
    expect(position.amount.toNumber()).to.equal(depositAmount.sub(withdrawAmt).toNumber());

    const config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.totalDeposits.toNumber()).to.equal(depositAmount.sub(withdrawAmt).toNumber());

    const afterUser = await getAccount(provider.connection, userAta);
    expect(Number(afterUser.amount - beforeUser.amount)).to.equal(withdrawAmt.toNumber());
  });

  it("rejects deposit with wrong mint on user ATA", async () => {
    const otherMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      decimals
    );
    const otherAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      otherMint,
      user.publicKey
    );
    await mintTo(provider.connection, authority, otherMint, otherAta, authority, 1_000_000);

    const userPos = positionPda(user.publicKey);
    await expectAnchorError(
      () =>
        program.methods
          .deposit(new anchor.BN(1))
          .accounts(depositAccounts(user.publicKey, otherAta, userPos))
          .signers([user])
          .rpc(),
      "MintMismatch"
    );
  });

  it("rejects deposit with wrong vault token account", async () => {
    const fakeVaultAta = await createAssociatedTokenAccount(
      provider.connection,
      authority,
      mint,
      attacker.publicKey
    );
    const userPos = positionPda(user.publicKey);
    await expectAnchorError(
      () =>
        program.methods
          .deposit(new anchor.BN(1))
          .accounts({
            ...depositAccounts(user.publicKey, userAta, userPos),
            vaultTokenAccount: fakeVaultAta,
          })
          .signers([user])
          .rpc(),
      "VaultTokenMismatch"
    );
  });

  it("rejects attacker withdraw on victim position", async () => {
    const victimPos = positionPda(user.publicKey);
    const attackerAta = getAssociatedTokenAddressSync(mint, attacker.publicKey);
    try {
      await getAccount(provider.connection, attackerAta);
    } catch {
      await createAssociatedTokenAccount(
        provider.connection,
        authority,
        mint,
        attacker.publicKey
      );
    }
    await expectAnchorError(
      () =>
        program.methods
          .withdraw(new anchor.BN(1))
          .accounts(withdrawAccounts(attacker.publicKey, attackerAta, victimPos))
          .signers([attacker])
          .rpc(),
      ["ConstraintSeeds", "Unauthorized"]
    );
  });

  it("rejects double initialize", async () => {
    try {
      await program.methods.initialize().accounts(initAccounts()).rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).to.not.equal(undefined);
    }
  });

  it("rejects close_position when balance remains", async () => {
    const userPos = positionPda(user.publicKey);
    await expectAnchorError(
      () =>
        program.methods
          .closePosition()
          .accounts({
            owner: user.publicKey,
            mint,
            vaultConfig,
            userPosition: userPos,
          })
          .signers([user])
          .rpc(),
      "PositionNotEmpty"
    );
  });

  it("closes empty position after full withdraw", async () => {
    const userPos = positionPda(user.publicKey);
    const pos = await program.account.userPosition.fetch(userPos);
    await program.methods
      .withdraw(pos.amount)
      .accounts(withdrawAccounts(user.publicKey, userAta, userPos))
      .signers([user])
      .rpc();

    await program.methods
      .closePosition()
      .accounts({
        owner: user.publicKey,
        mint,
        vaultConfig,
        userPosition: userPos,
      })
      .signers([user])
      .rpc();

    const info = await provider.connection.getAccountInfo(userPos);
    expect(info).to.equal(null);
  });

  it("transfer_authority rotates admin; unauthorized fails", async () => {
    await expectAnchorError(
      () =>
        program.methods
          .transferAuthority()
          .accounts({
            authority: attacker.publicKey,
            newAuthority: attacker.publicKey,
            vaultConfig,
          })
          .signers([attacker])
          .rpc(),
      "Unauthorized"
    );

    await program.methods
      .transferAuthority()
      .accounts({
        authority: authority.publicKey,
        newAuthority: attacker.publicKey,
        vaultConfig,
      })
      .rpc();

    let config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.authority.toBase58()).to.equal(attacker.publicKey.toBase58());

    await expectAnchorError(
      () =>
        program.methods
          .pause()
          .accounts({ authority: authority.publicKey, vaultConfig })
          .rpc(),
      "Unauthorized"
    );

    await program.methods
      .pause()
      .accounts({ authority: attacker.publicKey, vaultConfig })
      .signers([attacker])
      .rpc();

    config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.paused).to.equal(true);

    await program.methods
      .unpause()
      .accounts({ authority: attacker.publicKey, vaultConfig })
      .signers([attacker])
      .rpc();

    await program.methods
      .transferAuthority()
      .accounts({
        authority: attacker.publicKey,
        newAuthority: authority.publicKey,
        vaultConfig,
      })
      .signers([attacker])
      .rpc();

    config = await program.account.vaultConfig.fetch(vaultConfig);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.paused).to.equal(false);
  });
});
