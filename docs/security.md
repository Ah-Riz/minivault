# Security considerations

Not a formal audit — a production-oriented checklist for this vault MVP.

## Access control

- [x] Only `VaultConfig.authority` can `pause` / `unpause` (`has_one = authority`)
- [x] Only position `owner` can deposit/withdraw for that PDA (seeds + `has_one = owner`)
- [x] PDA seeds bind mint + owner (no cross-user position hijack)

## Validation

- [x] Reject `amount == 0`
- [x] Reject withdraw when `amount > user_position.amount`
- [x] Verify mint matches `VaultConfig.mint` on deposit/withdraw
- [x] Verify user ATA owner + mint; vault ATA matches config + mint
- [x] Checked arithmetic on credit/debit (`MathOverflow`)

## Pause

- [x] Deposit and withdraw both check `paused`
- [x] Pause does not brick admin `unpause`
- [x] No protocol fees in MVP — pause only stops user flows

## Token / CPI

- [x] Vault ATA authority is the `VaultConfig` PDA (created in `initialize`)
- [x] Withdraw uses `CpiContext::new_with_signer` with config PDA seeds
- [x] Deposit uses user as transfer authority
- [x] ATA derivation for vault custody

## Testing

- [x] Happy path: initialize → deposit → withdraw
- [x] Pause blocks deposit/withdraw
- [x] Unauthorized pause fails
- [x] Over-withdraw fails
- [x] Zero amount fails

## Explicit non-goals

No reentrancy across programs beyond SPL CPI, no flash-loan patterns, no oracle trust assumptions, no Token-2022 extensions.
