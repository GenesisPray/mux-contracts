import {
  BATCHER_CONTRACT_TAG,
  BATCHER_EVENT_TOPICS,
  parseBatcherEvent,
  type BatcherEvent,
} from "../src/batcher-events";
import type { RawSorobanEvent } from "../src/factory-events";

const ADMIN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4";
const CALLER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M";
const OP_COUNT = "5";
const SUCCESS_COUNT = "4";
const FAILURE_COUNT = "1";

function makeRawEvent(tag: string, action: string, data: unknown): RawSorobanEvent {
  return { topic: [tag, action], value: data };
}

describe("BATCHER_CONTRACT_TAG", () => {
  it("equals 'mux_bat'", () => {
    expect(BATCHER_CONTRACT_TAG).toBe("mux_bat");
  });
});

describe("BATCHER_EVENT_TOPICS", () => {
  it("contains all documented actions", () => {
    expect(BATCHER_EVENT_TOPICS.init).toBe("init");
    expect(BATCHER_EVENT_TOPICS.bat_start).toBe("bat_start");
    expect(BATCHER_EVENT_TOPICS.executed).toBe("executed");
    expect(BATCHER_EVENT_TOPICS.bat_ok).toBe("bat_ok");
    expect(BATCHER_EVENT_TOPICS.bat_abort).toBe("bat_abort");
    expect(BATCHER_EVENT_TOPICS.sim_done).toBe("sim_done");
  });

  it("all topic values are valid Soroban action names", () => {
    for (const v of Object.values(BATCHER_EVENT_TOPICS)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("parseBatcherEvent — init", () => {
  it("parses init event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.init, [ADMIN]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("init");
    expect((result as any)?.admin).toBe(ADMIN);
  });
});

describe("parseBatcherEvent — bat_start", () => {
  it("parses bat_start event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.bat_start, [
      CALLER,
      OP_COUNT,
    ]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("bat_start");
    expect((result as any)?.caller).toBe(CALLER);
  });
});

describe("parseBatcherEvent — executed", () => {
  it("parses executed event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.executed, [
      CALLER,
      SUCCESS_COUNT,
      FAILURE_COUNT,
    ]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("executed");
  });
});

describe("parseBatcherEvent — bat_ok", () => {
  it("parses bat_ok event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.bat_ok, [
      CALLER,
      SUCCESS_COUNT,
    ]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("bat_ok");
  });
});

describe("parseBatcherEvent — bat_abort", () => {
  it("parses bat_abort event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.bat_abort, [CALLER]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("bat_abort");
  });
});

describe("parseBatcherEvent — sim_done", () => {
  it("parses sim_done event", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.sim_done, [
      CALLER,
      SUCCESS_COUNT,
    ]);
    const result = parseBatcherEvent(event);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("sim_done");
  });
});

describe("parseBatcherEvent — returns null for non-batcher events", () => {
  it("returns null for different contract tag", () => {
    const event = makeRawEvent("mux_other", BATCHER_EVENT_TOPICS.init, [ADMIN]);
    expect(parseBatcherEvent(event)).toBeNull();
  });

  it("returns null for unknown action", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, "unknown", [ADMIN]);
    expect(parseBatcherEvent(event)).toBeNull();
  });

  it("returns null when data is null", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.init, null);
    expect(parseBatcherEvent(event)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const event = makeRawEvent(BATCHER_CONTRACT_TAG, BATCHER_EVENT_TOPICS.executed, [CALLER]);
    expect(parseBatcherEvent(event)).toBeNull();
  });
});
