# Spending Policy Contract Semantics

This document describes the design, data model, and behavioral guarantees of the `mux-spending-policy` contract.

## Overview

`mux-spending-policy` stores per-account spend limits per asset and validates spend requests against them. It is a lightweight enforcement contract that can be queried by other contracts (such as `mux-account`) before executing a spend operation.

The contract enforces a maximum-spendable-amount check per rolling period window: each `SpendLimit` record tracks the amount spent in the current window (`spent`) and the ledger at which the window expires (`reset_ledger`). `check_spend` is currently read-only and does not debit the counter — callers that persist a debit must do so themselves (see `mux-policy` for a cumulative daily-limit contract).

## Data Model

### `SpendLimit`

```rust
pub struct SpendLimit {
    pub asset: Address,      // Asset identifier (the token)
    pub limit: i128,         // Maximum amount spendable per period window
    pub spent: i128,         // Amount spent in the current period window
    pub reset_ledger: u32,   // Ledger at which the window expires and `spent` resets
    pub period_ledgers: u32, // Length of one period window in ledgers (> 0)
}
```

Storage key: `DataKey::SpendLimit(account: Address, asset: Address)` — instance storage, one record per (account, asset) pair.

## Functions

### `initialize(admin)`

- One-time setup. Stores the admin address.
- Fails with `AlreadyInitialized` if called more than once.
- Emits `init` event.

### `set_policy(account, asset, limit, period_ledgers)` — admin only

- Creates or replaces the spend limit for `account`/`asset`.
- `limit` must be strictly positive (> 0); fails with `InvalidInput` if `limit <= 0`.
- `period_ledgers` sets the rolling window length and must be > 0; fails with
  `InvalidPeriod` if `period_ledgers == 0`. The admin auth gate runs **before**
  either validation (fail-closed: unauthenticated callers cannot probe
  validation state).
- Fails with `NotInitialized` if called before `initialize`.
- Resets the `spent` counter to 0 and sets `reset_ledger` to the current ledger
  on every call (including updates to an existing policy).
- Emits `lmt_set` event.

### `get_policy(account, asset)`

- Returns the stored `SpendLimit` record.
- Fails with `PolicyNotFound` if no policy is configured for the pair.
- Read-only — no auth required, no event emitted.

### `check_spend(account, asset, amount)`

- Checks whether `amount` is within the configured spend limit.
- `amount` must be non-negative.
- Fails with `InvalidInput` if `amount < 0`.
- Fails with `PolicyNotFound` if no policy is configured.
- Fails with `SpendLimitExceeded` if `amount > policy.limit`.
- Emits events:
  - `chk_ok` when the spend is within the limit.
  - `chk_ex` when the spend exceeds the limit or policy is not found.

## Error Codes

| Code | Variant | Meaning |
|---|---|---|
| 1 | `NotInitialized` | Contract not yet initialized |
| 2 | `AlreadyInitialized` | `initialize` called more than once |
| 3 | `Unauthorized` | Caller is not the admin |
| 4 | `PolicyNotFound` | No policy configured for account/asset pair |
| 5 | `SpendLimitExceeded` | Spend exceeds the configured limit |
| 6 | `InvalidInput` | Limit ≤ 0 or spend amount negative |
| 7 | `InvalidPeriod` | `period_ledgers` is zero |

## Events

All state-mutating operations emit a structured event with topics `[mux_spend, action]`:

| Action | Emitted by | Data |
|---|---|---|
| `init` | `initialize` | `admin: Address` |
| `lmt_set` | `set_policy` | `(account: Address, asset: Address, limit: i128)` |
| `chk_ok` | `check_spend` (within limit) | `(account: Address, asset: Address, amount: i128)` |
| `chk_ex` | `check_spend` (exceeds limit / no policy) | `(account: Address, asset: Address, amount: i128, limit_or_reason: i128 \| Symbol)` |

## Authorization Requirements

| Function | Auth check | Who can call |
|---|---|---|
| `initialize` | `admin.require_auth()` | Deployer (once) |
| `set_policy` | `require_admin()` → `admin.require_auth()` | Admin only |
| `get_policy` | None | Anyone (read-only) |
| `check_spend` | None | Anyone (read-only) |

## Storage TTL

Instance storage TTL is extended on every write (`TTL_THRESHOLD = 17 280`, `TTL_EXTEND_TO = 518 400` ledgers ≈ 30 days). Deployers should run a keeper job to extend TTL proactively.

## Key Invariants

- Policy records are keyed by (account, asset) — each account can have separate limits per asset.
- Limits are absolute maximums, not cumulative per time window.
- `check_spend` is a pure read-only check and does **not** modify state.
- There is no storage griefing concern: each set_policy call replaces the single record for that (account, asset) pair.

