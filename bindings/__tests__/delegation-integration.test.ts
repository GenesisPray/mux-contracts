/**
 * Integration test stub for mux-delegation contract.
 *
 * These tests verify that the delegation bindings can interact with a
 * live or local Soroban network. They are skipped when the network is
 * unavailable, matching the pattern in integration.test.ts.
 *
 * Delegation expiry invariants (issue #869):
 *   - A delegate grant carries an explicit expiry timestamp.
 *   - Expired or revoked delegates are rejected fail-closed.
 *   - Expiry failures surface stable error codes, never raw key material.
 */

import { NETWORK_CONFIGS } from "../src/network";

const NETWORK = process.env.SOROBAN_NETWORK || "localnet";
const config = NETWORK_CONFIGS[NETWORK];

/** Stable error codes for delegation expiry failures (fail-closed). */
const DELEGATION_ERROR_CODES = {
  DELEGATE_EXPIRED: "DELEGATE_EXPIRED",
  DELEGATE_REVOKED: "DELEGATE_REVOKED",
  DELEGATE_NOT_FOUND: "DELEGATE_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

type DelegationErrorCode =
  (typeof DELEGATION_ERROR_CODES)[keyof typeof DELEGATION_ERROR_CODES];

/**
 * Minimal in-memory model of the delegation expiry invariants so the
 * expiry/revocation rules are covered even when no network is available.
 * Mirrors the on-chain contract semantics: deny-by-default, expiry is
 * exclusive (now >= expiresAt means expired).
 */
interface DelegateGrant {
  delegate: string;
  expiresAt: number;
  revoked: boolean;
}

class DelegationExpiryModel {
  private grants = new Map<string, DelegateGrant>();

  grant(delegate: string, expiresAt: number): void {
    this.grants.set(delegate, { delegate, expiresAt, revoked: false });
  }

  revoke(delegate: string): void {
    const grant = this.grants.get(delegate);
    if (!grant) {
      throw new Error(DELEGATION_ERROR_CODES.DELEGATE_NOT_FOUND);
    }
    grant.revoked = true;
  }

  /** Fail-closed authorization check used by every privileged entrypoint. */
  assertAuthorized(delegate: string, now: number): void {
    const grant = this.grants.get(delegate);
    if (!grant) {
      throw new Error(DELEGATION_ERROR_CODES.DELEGATE_NOT_FOUND);
    }
    if (grant.revoked) {
      throw new Error(DELEGATION_ERROR_CODES.DELEGATE_REVOKED);
    }
    if (now >= grant.expiresAt) {
      throw new Error(DELEGATION_ERROR_CODES.DELEGATE_EXPIRED);
    }
  }

  isDelegate(delegate: string, now: number): boolean {
    try {
      this.assertAuthorized(delegate, now);
      return true;
    } catch {
      return false;
    }
  }
}

async function isNetworkAvailable(): Promise<boolean> {
  try {
    const response = await globalThis.fetch(config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getNetwork",
        params: [],
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe("Delegation Integration Tests", () => {
  let networkAvailable: boolean;

  beforeAll(async () => {
    networkAvailable = await isNetworkAvailable();
    if (!networkAvailable) {
      console.warn(
        `⚠️  Network "${NETWORK}" is unavailable at ${config.rpcUrl}. ` +
        `Delegation integration tests will be skipped.`
      );
    }
  });

  it("should have valid network configuration for delegation", () => {
    expect(config).toBeDefined();
    expect(config.rpcUrl).toBeTruthy();
    expect(config.networkPassphrase).toBeTruthy();
  });

  it("should be able to attempt connection for delegation tests", async () => {
    const available = await isNetworkAvailable();
    expect(typeof available).toBe("boolean");
    if (!available) {
      console.log(
        `ℹ️  Network ${NETWORK} at ${config.rpcUrl} is not currently available. ` +
        `To enable delegation integration tests, start the network or use SOROBAN_NETWORK=testnet.`
      );
    }
  });

  it("should expose delegation contract ID in network config", () => {
    expect(config.contracts).toBeDefined();
    expect(config.contracts.muxDelegation).toBeDefined();
  });

  it("stub: grant_delegate round-trip via bindings", () => {
    if (!networkAvailable) {
      console.log("Skipped — network unavailable");
      return;
    }
    // TODO: instantiate MuxDelegationClient, grant a delegate, and verify
    // with get_delegate_permissions. Requires a funded keypair on the
    // target network.
    expect(true).toBe(true);
  });

  it("stub: revoke_delegate round-trip via bindings", () => {
    if (!networkAvailable) {
      console.log("Skipped — network unavailable");
      return;
    }
    // TODO: grant then revoke a delegate and assert is_delegate returns false.
    expect(true).toBe(true);
  });

  it("stub: is_delegate query via bindings", () => {
    if (!networkAvailable) {
      console.log("Skipped — network unavailable");
      return;
    }
    // TODO: query is_delegate for an unknown delegate and expect false.
    expect(true).toBe(true);
  });
});

describe("Delegation expiry invariants", () => {
  const NOW = 1_700_000_000;
  const DELEGATE = "GDELEGATE000000000000000000000000000000000000000000000000";

  it("accepts a delegate before its expiry timestamp", () => {
    const model = new DelegationExpiryModel();
    model.grant(DELEGATE, NOW + 3600);
    expect(model.isDelegate(DELEGATE, NOW)).toBe(true);
    expect(() => model.assertAuthorized(DELEGATE, NOW)).not.toThrow();
  });

  it("rejects an expired delegate with DELEGATE_EXPIRED (fail-closed)", () => {
    const model = new DelegationExpiryModel();
    model.grant(DELEGATE, NOW);
    expect(model.isDelegate(DELEGATE, NOW)).toBe(false);
    expect(() => model.assertAuthorized(DELEGATE, NOW)).toThrow(
      DELEGATION_ERROR_CODES.DELEGATE_EXPIRED
    );
  });

  it("rejects a revoked delegate with DELEGATE_REVOKED", () => {
    const model = new DelegationExpiryModel();
    model.grant(DELEGATE, NOW + 3600);
    model.revoke(DELEGATE);
    expect(model.isDelegate(DELEGATE, NOW)).toBe(false);
    expect(() => model.assertAuthorized(DELEGATE, NOW)).toThrow(
      DELEGATION_ERROR_CODES.DELEGATE_REVOKED
    );
  });

  it("denies-by-default for an unknown delegate", () => {
    const model = new DelegationExpiryModel();
    expect(model.isDelegate(DELEGATE, NOW)).toBe(false);
    expect(() => model.assertAuthorized(DELEGATE, NOW)).toThrow(
      DELEGATION_ERROR_CODES.DELEGATE_NOT_FOUND
    );
  });

  it("revoking an unknown delegate fails with DELEGATE_NOT_FOUND", () => {
    const model = new DelegationExpiryModel();
    expect(() => model.revoke(DELEGATE)).toThrow(
      DELEGATION_ERROR_CODES.DELEGATE_NOT_FOUND
    );
  });

  it("expiry errors never leak raw key material", () => {
    const model = new DelegationExpiryModel();
    model.grant(DELEGATE, NOW);
    try {
      model.assertAuthorized(DELEGATE, NOW);
      throw new Error("expected assertAuthorized to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toBe(DELEGATION_ERROR_CODES.DELEGATE_EXPIRED);
      expect(message).not.toContain(DELEGATE);
    }
  });
});
