# Rollback Guide

This guide covers how to recover from a bad contract deployment on Stellar/Soroban.
See also [`rollback-deploy.md`](rollback-deploy.md) for the full strategy reference.

---

## 1. Identify a Bad Deploy

Signs of a bad deploy:

- Transactions against the new contract fail with unexpected error codes
- Admin or user-facing calls revert unexpectedly
- On-chain state is inconsistent with what the contract should have initialised
- Monitoring alerts fire on the new contract ID shortly after deployment
- The deployment script exited non-zero, or the post-deploy smoke test failed

Gather the following before acting:

```bash
# Confirm which contract ID is currently live
cat config/addresses.json | python3 -m json.tool | grep -A6 '"mainnet"'

# Retrieve the transaction hash of the deploy
stellar contract info --id <CONTRACT_ID> --network mainnet
```

Record the broken contract ID, the deployment timestamp, and the exact error.

---

## 2. Options

| Option | When to Use | User-State Impact |
|---|---|---|
| Re-point `config/addresses.json` to previous ID | No user txns on new contract | None — previous contract is untouched |
| Redeploy previous WASM as a new instance | Previous ID unusable (factory pattern) | None if migrated before cutover |
| Admin pause / freeze new contract | Users already transacted; state must be preserved | Paused; requires contract pause support |

Full command sequences for each option are in [`rollback-deploy.md`](rollback-deploy.md).

---

## 3. Step-by-Step Rollback Commands

### Option A — Re-point to previous contract ID (fastest)

```bash
# 1. Find the previous contract ID from git history
git log --oneline -- config/addresses.json
git show <PREV_COMMIT>:config/addresses.json | python3 -m json.tool | grep -A6 '"mainnet"'

# 2. Edit config/addresses.json to restore the previous IDs
#    (muxAccount, muxBatcher, muxPermissions, etc.)

# 3. Regenerate TypeScript bindings
bash scripts/generate-bindings.sh --network mainnet --skip-build
cd bindings && npm run build && npm test

# 4. Open a PR, merge, publish a new bindings patch release
```

### Option B — Redeploy previous WASM

```bash
# 1. Check out the last known-good release tag
git checkout v<PREVIOUS_VERSION>

# 2. Build the old WASM
cargo build --target wasm32-unknown-unknown --release --workspace

# 3. Dry-run first
MUX_DEPLOYER_SECRET=S... bash scripts/deploy-testnet.sh --dry-run --network mainnet

# 4. Deploy
MUX_DEPLOYER_SECRET=S... bash scripts/deploy.sh --network mainnet

# 5. Record new contract IDs in config/addresses.json and open a PR
```

### Option C — Admin pause (state-preserving)

```bash
# Pause the broken contract (mux-account implements pause())
stellar contract invoke \
  --id <BROKEN_CONTRACT_ID> \
  --network mainnet \
  --source <ADMIN_SECRET_KEY> \
  -- pause

# Deploy the fixed version, migrate state, re-enable
```

---

## 4. Verify the Rollback Succeeded

After restoring the previous contract or redeploying:

```bash
# Confirm each contract responds
stellar contract invoke \
  --id <RESTORED_CONTRACT_ID> \
  --network mainnet \
  -- version

# Confirm admin address is correct
stellar contract invoke \
  --id <RESTORED_CONTRACT_ID> \
  --network mainnet \
  -- get_admin

# Run bindings smoke tests
cd bindings && npm test
```

All three checks must pass before the rollback is considered complete.

---

## 5. Who to Notify

| Audience | Channel | Timing |
|---|---|---|
| On-call engineer | Incident channel / PagerDuty | Immediately on detection |
| Core team | Team Slack / Signal | Before executing rollback |
| Dependent service owners | Direct message or shared incident thread | After rollback is confirmed |
| Mux Labs multisig holders | Out-of-band (required for mainnet upgrade authority) | If admin action is required |

Post a brief incident report after the rollback is stable:
- What failed and why
- How it was detected
- Which rollback strategy was used
- Follow-up issue link for the root-cause fix

Then record the completed checklist in
[`ops/rollback-log.md`](../ops/rollback-log.md) (see
[rollback-deploy.md § Tracking Completion](rollback-deploy.md#tracking-completion)).
A rollback isn't done until this entry exists — CI checks the log's format
on every PR.

---

## Related Documents

- [`rollback-deploy.md`](rollback-deploy.md) — full rollback strategy reference
- [`mainnet-deploy-checklist.md`](mainnet-deploy-checklist.md) — pre-deploy checklist
- [`deployer-key.md`](deployer-key.md) — deployer key setup
- [`BREAKING_CHANGES.md`](BREAKING_CHANGES.md) — record of breaking changes
- [`../scripts/deploy.sh`](../scripts/deploy.sh) — deployment script
- [`../ops/rollback-log.md`](../ops/rollback-log.md) — completion record for the rollback checklists
