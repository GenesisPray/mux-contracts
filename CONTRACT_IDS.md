# Contract IDs

This document explains the structure and lifecycle of `config/addresses.json` — the canonical source for deployed Mux Protocol contract addresses.

## File location

[`config/addresses.json`](config/addresses.json)

## Structure

```json
{
  "localnet": {
    "muxAccount": "", "muxBatcher": "", "muxDelegation": "",
    "muxPermissions": "", "muxWalletRegistry": "",
    "muxAccountFactory": "", "muxRegistry": "", "muxPolicy": ""
  },
  "testnet": { "...same eight keys...": "" },
  "mainnet": { "...same eight keys...": "" }
}
```

This key set mirrors the `MuxContractIds` TypeScript interface in
[`bindings/src/types.ts`](bindings/src/types.ts), which is what
`bindings/src/addresses.ts` actually validates against. `scripts/check-contract-ids-sync.sh`
enforces that this file, `docs/contract-ids.md`, and `config/addresses.json`
all track that same set — see [`docs/contract-ids.md`](docs/contract-ids.md#how-drift-is-caught).

### Contracts

| Key | Contract | Purpose |
|---|---|---|
| `muxAccount` | `contracts/mux-account` | Account abstraction: owner management, delegates, spend limits |
| `muxBatcher` | `contracts/mux-batcher` | Atomic multi-op batching with per-op failure handling |
| `muxDelegation` | `contracts/mux-delegation` | Delegated permission grants, separate from account delegates |
| `muxPermissions` | `contracts/mux-permissions` | RBAC registry — roles, grant/revoke |
| `muxWalletRegistry` | `contracts/mux-wallet-registry` | Wallet discovery/registry for client lookups |
| `muxAccountFactory` | `contracts/mux-account-factory` | Deploys and indexes `mux-account` instances per owner |
| `muxRegistry` | `contracts/mux-registry` | Generic version/metadata registry for deployed contracts |
| `muxPolicy` | `contracts/mux-policy` | Per-wallet daily spend policy limits |

Two more contract crates are deployed by `scripts/deploy.sh` (`mux-recovery`,
`mux-spending-policy`) but do not yet have a key in `MuxContractIds` or an
entry in `addresses.json` — their deployed addresses currently have to be
tracked out-of-band. Adding them is tracked as a follow-up; it touches
`bindings/src/types.ts`, `addresses.ts`, `network.ts`, and
`addresses-config.ts` together, which is out of scope for this doc/config
sync fix.

### Networks

| Key | Network | Notes |
|---|---|---|
| `localnet` | Local Docker node | Populated after `stellar contract deploy` against the Docker Compose node |
| `testnet` | Stellar testnet | Populated by CI or a manual testnet deploy |
| `mainnet` | Stellar mainnet | Populated after an audited mainnet release; treat as immutable once set |

## How IDs are updated

1. Build the WASM: `cargo build --target wasm32-unknown-unknown --release --workspace`
2. Deploy via `stellar contract deploy --wasm <path>.wasm --network <network>`
3. Copy the returned contract ID into the appropriate key in `config/addresses.json`
4. Commit the updated file on a release branch — IDs are intentionally tracked in VCS

## Environment variable overrides

Runtime overrides follow the pattern `{NETWORK}_MUX_*_ID` and take precedence over `addresses.json`:

```bash
SOROBAN_NETWORK=testnet
TESTNET_MUX_ACCOUNT_ID=C...
TESTNET_MUX_BATCHER_ID=C...
TESTNET_MUX_DELEGATION_ID=C...
TESTNET_MUX_PERMISSIONS_ID=C...
TESTNET_MUX_WALLET_REGISTRY_ID=C...
TESTNET_MUX_ACCOUNT_FACTORY_ID=C...
TESTNET_MUX_REGISTRY_ID=C...
TESTNET_MUX_POLICY_ID=C...
```

See [`.env.deploy.example`](.env.deploy.example) for the full variable reference.

## Upgrade authority

Contract upgrades require the deployer keypair that owns the upgrade authority.  
Store the corresponding secret key in `SOROBAN_SECRET_KEY` (never commit it).  
Mainnet upgrade authority is held by the Mux Labs multisig; contact the core team before deploying to mainnet.
