# Account design & PDAs

## Accounts

### `VaultConfig` (PDA)

Global vault configuration. One per vault mint.

| Field | Type | Notes |
|-------|------|-------|
| `bump` | `u8` | PDA bump |
| `authority` | `Pubkey` | Admin (pause / unpause / initialize signer) |
| `mint` | `Pubkey` | SPL mint accepted by vault |
| `vault_token_account` | `Pubkey` | ATA holding deposits |
| `paused` | `bool` | When true, deposit/withdraw reject |
| `total_deposits` | `u64` | Aggregate deposited amount |

**Seeds:** `[b"vault_config", mint.key().as_ref()]`

**Space:** `8 + 1 + 32 + 32 + 32 + 1 + 8`

### `UserPosition` (PDA)

Per-user balance for a given vault mint.

| Field | Type | Notes |
|-------|------|-------|
| `bump` | `u8` | PDA bump |
| `owner` | `Pubkey` | User wallet |
| `mint` | `Pubkey` | Vault mint |
| `amount` | `u64` | Deposited amount |

**Seeds:** `[b"user_position", mint.key().as_ref(), owner.key().as_ref()]`

**Space:** `8 + 1 + 32 + 32 + 8`

### Token accounts

- **User ATA** — source for deposit / destination for withdraw (`owner` = user wallet)
- **Vault ATA** — created in `initialize` with `associated_token::authority = vault_config` (PDA custody)

## PDA diagram

```
VaultConfig PDA
  seeds: ["vault_config", mint]
  └── signs for vault ATA on withdraw

UserPosition PDA
  seeds: ["user_position", mint, owner]
```

## Invariants

1. `sum(UserPosition.amount)` == `VaultConfig.total_deposits` (accounting)
2. Vault ATA balance >= `total_deposits` (custody)
3. Only `authority` may flip `paused`
4. Deposit/withdraw require `paused == false`
5. Deposit/withdraw verify vault ATA pubkey matches `VaultConfig.vault_token_account`
6. Empty positions may be closed (`close_position`); rent returns to owner
