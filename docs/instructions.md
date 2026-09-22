# Instructions

| Instruction | Who | Behavior |
|-------------|-----|----------|
| `initialize` | Admin | Create `VaultConfig` PDA + vault ATA (authority = config PDA) |
| `deposit` | User | Transfer SPL user → vault; credit position + `total_deposits` |
| `withdraw` | User | Debit position; PDA-signed transfer vault → user |
| `pause` | Admin | Set `paused = true` |
| `unpause` | Admin | Set `paused = false` |

## Account metas

### `initialize`

| Account | Notes |
|---------|-------|
| `authority` | signer, payer |
| `mint` | SPL mint |
| `vault_config` | PDA init, seeds `["vault_config", mint]` |
| `vault_token_account` | ATA init, authority = `vault_config` |
| `token_program` | |
| `associated_token_program` | |
| `system_program` | |

### `deposit`

| Account | Notes |
|---------|-------|
| `owner` | signer, payer (position init-if-needed) |
| `mint` | must match config |
| `vault_config` | PDA, mut |
| `user_position` | PDA, `init_if_needed` |
| `user_token_account` | mut; owner + mint checked |
| `vault_token_account` | mut; must equal `config.vault_token_account` |
| `token_program` | |
| `system_program` | |

Requires: `!paused`, `amount > 0`

### `withdraw`

Same token accounts as deposit (no system program). Requires `amount <= user_position.amount` and `!paused`. Vault transfer uses PDA signer seeds.

### `pause` / `unpause`

| Account | Notes |
|---------|-------|
| `authority` | signer; must equal `vault_config.authority` |
| `vault_config` | mut PDA |

## Error codes

| Code | When |
|------|------|
| `VaultPaused` | Deposit/withdraw while paused |
| `Unauthorized` | Wrong admin or token/position owner |
| `InvalidAmount` | `amount == 0` |
| `InsufficientBalance` | Withdraw exceeds position |
| `MintMismatch` | Mint / token account mint mismatch |
| `VaultTokenMismatch` | Wrong vault ATA passed |
| `MathOverflow` | Checked add/sub failed |
