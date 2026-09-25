use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("Eg1fXRg5AQ2P9834Lr2mTkjr9Zy5dMG6HGiqLLJmfoRd");

#[program]
pub mod mini_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.vault_config;
        config.bump = ctx.bumps.vault_config;
        config.authority = ctx.accounts.authority.key();
        config.mint = ctx.accounts.mint.key();
        config.vault_token_account = ctx.accounts.vault_token_account.key();
        config.paused = false;
        config.total_deposits = 0;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.vault_config.paused, VaultError::VaultPaused);
        require!(amount > 0, VaultError::InvalidAmount);

        let position = &mut ctx.accounts.user_position;
        if position.owner == Pubkey::default() {
            position.bump = ctx.bumps.user_position;
            position.owner = ctx.accounts.owner.key();
            position.mint = ctx.accounts.mint.key();
            position.amount = 0;
        }

        // Credit math before CPI so overflow cannot leave tokens in the vault unattributed.
        let new_position_amount = position
            .amount
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;
        let new_total_deposits = ctx
            .accounts
            .vault_config
            .total_deposits
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        position.amount = new_position_amount;
        ctx.accounts.vault_config.total_deposits = new_total_deposits;

        emit!(DepositEvent {
            owner: ctx.accounts.owner.key(),
            mint: ctx.accounts.mint.key(),
            amount,
            total_deposits: ctx.accounts.vault_config.total_deposits,
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.vault_config.paused, VaultError::VaultPaused);
        require!(amount > 0, VaultError::InvalidAmount);
        require!(
            ctx.accounts.user_position.amount >= amount,
            VaultError::InsufficientBalance
        );

        let mint_key = ctx.accounts.mint.key();
        let seeds = &[
            b"vault_config".as_ref(),
            mint_key.as_ref(),
            &[ctx.accounts.vault_config.bump],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault_config.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        ctx.accounts.user_position.amount = ctx
            .accounts
            .user_position
            .amount
            .checked_sub(amount)
            .ok_or(VaultError::MathOverflow)?;
        ctx.accounts.vault_config.total_deposits = ctx
            .accounts
            .vault_config
            .total_deposits
            .checked_sub(amount)
            .ok_or(VaultError::MathOverflow)?;

        emit!(WithdrawEvent {
            owner: ctx.accounts.owner.key(),
            mint: ctx.accounts.mint.key(),
            amount,
            total_deposits: ctx.accounts.vault_config.total_deposits,
        });

        Ok(())
    }

    pub fn pause(ctx: Context<AdminPause>) -> Result<()> {
        ctx.accounts.vault_config.paused = true;
        emit!(PauseEvent {
            authority: ctx.accounts.authority.key(),
            mint: ctx.accounts.vault_config.mint,
            paused: true,
        });
        Ok(())
    }

    pub fn unpause(ctx: Context<AdminPause>) -> Result<()> {
        ctx.accounts.vault_config.paused = false;
        emit!(PauseEvent {
            authority: ctx.accounts.authority.key(),
            mint: ctx.accounts.vault_config.mint,
            paused: false,
        });
        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        require!(
            ctx.accounts.user_position.amount == 0,
            VaultError::PositionNotEmpty
        );
        Ok(())
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        let config = &mut ctx.accounts.vault_config;
        config.authority = ctx.accounts.new_authority.key();
        emit!(AuthorityEvent {
            mint: config.mint,
            old_authority: ctx.accounts.authority.key(),
            new_authority: config.authority,
        });
        Ok(())
    }
}

#[event]
pub struct DepositEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct WithdrawEvent {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct PauseEvent {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub paused: bool,
}

#[event]
pub struct AuthorityEvent {
    pub mint: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[account]
pub struct VaultConfig {
    pub bump: u8,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub paused: bool,
    pub total_deposits: u64,
}

impl VaultConfig {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 32 + 1 + 8;
}

#[account]
pub struct UserPosition {
    pub bump: u8,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

impl UserPosition {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 8;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = VaultConfig::LEN,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault_config
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump = vault_config.bump,
        has_one = mint @ VaultError::MintMismatch,
        has_one = vault_token_account @ VaultError::VaultTokenMismatch
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        init_if_needed,
        payer = owner,
        space = UserPosition::LEN,
        seeds = [b"user_position", mint.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        constraint = user_token_account.owner == owner.key() @ VaultError::Unauthorized,
        constraint = user_token_account.mint == mint.key() @ VaultError::MintMismatch
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault_token_account.mint == mint.key() @ VaultError::MintMismatch
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault_config", mint.key().as_ref()],
        bump = vault_config.bump,
        has_one = mint @ VaultError::MintMismatch,
        has_one = vault_token_account @ VaultError::VaultTokenMismatch
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        mut,
        seeds = [b"user_position", mint.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner @ VaultError::Unauthorized,
        constraint = user_position.mint == mint.key() @ VaultError::MintMismatch
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        constraint = user_token_account.owner == owner.key() @ VaultError::Unauthorized,
        constraint = user_token_account.mint == mint.key() @ VaultError::MintMismatch
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = vault_token_account.mint == mint.key() @ VaultError::MintMismatch
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminPause<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault_config", vault_config.mint.as_ref()],
        bump = vault_config.bump,
        has_one = authority @ VaultError::Unauthorized
    )]
    pub vault_config: Account<'info, VaultConfig>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        seeds = [b"vault_config", mint.key().as_ref()],
        bump = vault_config.bump,
        has_one = mint @ VaultError::MintMismatch
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        mut,
        seeds = [b"user_position", mint.key().as_ref(), owner.key().as_ref()],
        bump = user_position.bump,
        has_one = owner @ VaultError::Unauthorized,
        constraint = user_position.mint == mint.key() @ VaultError::MintMismatch,
        close = owner
    )]
    pub user_position: Account<'info, UserPosition>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,
    /// CHECK: new admin pubkey only; no further constraints
    pub new_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault_config", vault_config.mint.as_ref()],
        bump = vault_config.bump,
        has_one = authority @ VaultError::Unauthorized
    )]
    pub vault_config: Account<'info, VaultConfig>,
}

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Vault token account mismatch")]
    VaultTokenMismatch,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Position still has a balance")]
    PositionNotEmpty,
}
