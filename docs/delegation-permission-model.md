# Delegation Permission Model

This document defines how delegation works in Mux contracts: who can delegate,
what a delegate may do, and — critically — when a delegation stops being valid.

## Roles

- **Owner** — the account that owns the smart wallet. The owner is the only
  role that can create, extend, or revoke a delegation.
- **Delegate** — an address granted a scoped, time-bounded permission by the
  owner. A delegate can never escalate its own scope.
- **Guardian** — a recovery role. Guardians can revoke delegations but cannot
  create or extend them.

## Delegation record

A delegation is stored as a typed record:

```
Delegation {
    owner: Address,
    delegate: Address,
    scope: Scope,          // e.g. Transfer { max_amount }, Call { target }
    expires_at: u64,       // ledger timestamp; 0 means "no expiry" is NOT allowed
    revoked: bool,
    nonce: u64,            // monotonic, for idempotency / replay protection
}
```

`expires_at` is mandatory. A delegation with `expires_at == 0` is rejected at
creation time so that "no expiry" can never be expressed by accident.

## Expiry invariants

These invariants are enforced on-chain and are the source of truth. Clients
(API, SDK, wallet UI) must not be trusted to enforce them.

1. **Fail-closed on expiry.** A delegation is valid only while
   `now < expires_at`. At `now >= expires_at` the delegation is expired and
   every privileged action through it MUST be rejected.
2. **Revocation is immediate.** Setting `revoked = true` invalidates the
   delegation for all future actions, regardless of `expires_at`.
3. **Expiry is not extendable by the delegate.** Only the owner may extend
   `expires_at`, and only forward in time. Extending a revoked delegation is
   rejected.
4. **No resurrection.** An expired or revoked delegation cannot be re-enabled;
   the owner must create a new delegation with a fresh `nonce`.
5. **Deny-by-default.** Any action that does not match an active, unexpired,
   unrevoked delegation is rejected. There is no implicit or wildcard grant.

## Authorization checks

Every entrypoint that consumes a delegation performs, in order:

1. Resolve the delegation by `(owner, delegate, nonce)`.
2. Reject if not found → `DelegationNotFound`.
3. Reject if `revoked` → `DelegationRevoked`.
4. Reject if `now >= expires_at` → `DelegationExpired`.
5. Reject if the requested action is outside `scope` → `ScopeViolation`.
6. Reject if the caller is not the recorded `delegate` → `Unauthorized`.

Steps 3–4 are the expiry gate. They run before any state mutation so that a
failed check cannot leave partial effects (fail-closed on writes).

## Stable error codes

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `Unauthorized` | Caller is not the delegate/owner/guardian for this action. |
| 2 | `DelegationNotFound` | No delegation matches the given key. |
| 3 | `DelegationExpired` | `now >= expires_at`. |
| 4 | `DelegationRevoked` | Delegation was explicitly revoked. |
| 5 | `ScopeViolation` | Action is outside the delegated scope. |
| 6 | `InvalidExpiry` | `expires_at` is zero or not in the future at creation. |
| 7 | `ReplayDetected` | `nonce` was already consumed. |

Error codes are stable and part of the public contract. Do not renumber them.

## Idempotency and replay

- Each delegation carries a monotonic `nonce`. Consuming a delegation for an
action advances the nonce; replaying the same `(owner, delegate, nonce)` is
rejected with `ReplayDetected`.
- Concurrent requests that race on the same nonce resolve to exactly one
  success; the loser receives `ReplayDetected`.
- Expiry is evaluated against the ledger timestamp at execution, not at
  submission, so a request that expires in-flight is rejected.

## Observability

Expiry-related events are emitted without leaking secrets or raw key material:

- `delegation_created` — `{ owner, delegate, expires_at, nonce }`
- `delegation_revoked` — `{ owner, delegate, nonce }`
- `delegation_expired_rejected` — `{ owner, delegate, nonce, now }`
- `delegation_scope_rejected` — `{ owner, delegate, nonce }`

Addresses are logged as-is (they are public); no private keys, signatures, or
JWTs are ever logged. Metrics count rejections by error code so operators can
alert on spikes in `DelegationExpired` / `DelegationRevoked`.

## Failure modes

- **Dependency outage (RPC/DB/Horizon).** Writes fail closed: if the current
  ledger time or delegation state cannot be read, the action is rejected rather
  than assumed valid.
- **Auth expiry / wrong role / revoked delegate.** All map to the stable error
  codes above; none fall through to a permissive default.
- **Adversarial input.** Oversized batches, spoofed webhooks, and griefing
  attempts are rejected by scope and nonce checks before any state change.
- **Testnet vs mainnet misconfig.** `expires_at` is compared against the
  network's ledger time; a delegation created for one network is not valid on
  another because owner/delegate addresses and nonces are network-scoped.

## Kill switch

Any change to expiry semantics on a money path ships behind a feature flag.
When the flag is off, the previous (stricter) behavior applies. Rollback is
flipping the flag; no migration is required because expired delegations are
already inert.

## References

- `SECURITY.md` — threat model and disclosure process.
- `docs/aa-milestone-roadmap.md` — AA milestone exit criteria.
- `docs/developer_onboarding.md` — contributor setup and test patterns.
