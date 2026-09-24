/**
 * batcher-events.ts — TypeScript helpers for consuming mux-batcher
 * Soroban events.
 *
 * Every state-mutating batcher entrypoint emits structured contract events
 * with a two-element topic vector:
 *
 *   topics[0]  "mux_bat"   — contract-family tag (Symbol)
 *   topics[1]  action name  — one of BATCHER_EVENT_TOPICS (Symbol)
 *
 * Data payloads per action:
 *
 *   init        →  admin: Address
 *   bat_start   →  (caller: Address, op_count: u32)
 *   executed    →  (caller: Address, success_count: u32, failure_count: u32)
 *   bat_ok      →  (caller: Address, success_count: u32)
 *   bat_abort   →  caller: Address
 *   sim_done    →  (caller: Address, success_count: u32)
 *
 * See docs/audit-events.md and docs/event-topic-conventions.md for the
 * canonical event catalog.
 *
 * @module batcher-events
 */

// ── Topic constants ────────────────────────────────────────────────────────────

/**
 * The contract-family tag emitted as `topics[0]` in every mux-batcher
 * event. Use this when constructing Soroban RPC `getEvents` filters.
 */
export const BATCHER_CONTRACT_TAG = "mux_bat" as const;

/**
 * Action names emitted as `topics[1]` in mux-batcher events.
 * Values are stable ABI — renaming requires a breaking-change doc update.
 */
export const BATCHER_EVENT_TOPICS = {
  /** Emitted by `initialize`. */
  init: "init",
  /** Emitted by `execute_batch` at start. */
  bat_start: "bat_start",
  /** Emitted by `execute_batch` on completion. */
  executed: "executed",
  /** Emitted by `execute_batch` with zero failures. */
  bat_ok: "bat_ok",
  /** Emitted by `execute_batch` on require_success failure. */
  bat_abort: "bat_abort",
  /** Emitted by `simulate_batch` on completion. */
  sim_done: "sim_done",
} as const;

export type BatcherEventAction = (typeof BATCHER_EVENT_TOPICS)[keyof typeof BATCHER_EVENT_TOPICS];

// ── Parsed event types ─────────────────────────────────────────────────────────

export interface BatcherInitEvent {
  action: "init";
  admin: string;
}

export interface BatcherBatStartEvent {
  action: "bat_start";
  caller: string;
  opCount: string;
}

export interface BatcherExecutedEvent {
  action: "executed";
  caller: string;
  successCount: string;
  failureCount: string;
}

export interface BatcherBatOkEvent {
  action: "bat_ok";
  caller: string;
  successCount: string;
}

export interface BatcherBatAbortEvent {
  action: "bat_abort";
  caller: string;
}

export interface BatcherSimDoneEvent {
  action: "sim_done";
  caller: string;
  successCount: string;
}

export type BatcherEvent =
  | BatcherInitEvent
  | BatcherBatStartEvent
  | BatcherExecutedEvent
  | BatcherBatOkEvent
  | BatcherBatAbortEvent
  | BatcherSimDoneEvent;

// ── Raw Soroban event shape (minimal — avoids importing the full SDK) ──────────

// Import shared RawSorobanEvent from factory-events to avoid duplication
import type { RawSorobanEvent } from "./factory-events";

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parse a raw Soroban RPC event into a typed {@link BatcherEvent}.
 *
 * Returns `null` when the event does not match the batcher's contract tag or
 * when the action is unrecognised.
 *
 * @example
 * ```ts
 * import { parseBatcherEvent, BATCHER_CONTRACT_TAG } from "./batcher-events";
 *
 * const rawEvents = await server.getEvents({ startLedger, filters: [...] });
 * const batcherEvents = rawEvents.records
 *   .map(parseBatcherEvent)
 *   .filter((e): e is BatcherEvent => e !== null);
 * ```
 */
export function parseBatcherEvent(event: RawSorobanEvent): BatcherEvent | null {
  const [tag, action] = event.topic ?? [];

  if (tag !== BATCHER_CONTRACT_TAG) return null;

  const data = normaliseData(event.value);
  if (!data) return null;

  switch (action as BatcherEventAction) {
    case BATCHER_EVENT_TOPICS.init: {
      const admin = resolveAddress(data[0]);
      if (!admin) return null;
      return { action: "init", admin };
    }

    case BATCHER_EVENT_TOPICS.bat_start: {
      const caller = resolveAddress(data[0]);
      const opCount = resolveU32(data[1]);
      if (!caller || !opCount) return null;
      return { action: "bat_start", caller, opCount };
    }

    case BATCHER_EVENT_TOPICS.executed: {
      const caller = resolveAddress(data[0]);
      const successCount = resolveU32(data[1]);
      const failureCount = resolveU32(data[2]);
      if (!caller || !successCount || !failureCount) return null;
      return { action: "executed", caller, successCount, failureCount };
    }

    case BATCHER_EVENT_TOPICS.bat_ok: {
      const caller = resolveAddress(data[0]);
      const successCount = resolveU32(data[1]);
      if (!caller || !successCount) return null;
      return { action: "bat_ok", caller, successCount };
    }

    case BATCHER_EVENT_TOPICS.bat_abort: {
      const caller = resolveAddress(data[0]);
      if (!caller) return null;
      return { action: "bat_abort", caller };
    }

    case BATCHER_EVENT_TOPICS.sim_done: {
      const caller = resolveAddress(data[0]);
      const successCount = resolveU32(data[1]);
      if (!caller || !successCount) return null;
      return { action: "sim_done", caller, successCount };
    }

    default:
      return null;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function normaliseData(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw as unknown[];

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj["vec"])) return obj["vec"] as unknown[];
    if (Array.isArray(obj["_value"])) return obj["_value"] as unknown[];
  }

  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as unknown[];
    } catch {
      // Not JSON — fall through.
    }
  }

  return null;
}

function resolveAddress(raw: unknown): string | null {
  if (typeof raw === "string" && raw.startsWith("C")) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["address"] === "string") return obj["address"];
  }
  return null;
}

function resolveU32(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj["u32"] === "string") return obj["u32"];
    if (typeof obj["u32"] === "number") return String(obj["u32"]);
  }
  return null;
}
