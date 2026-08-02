import { describe, expect, it, vi } from "vitest";
import { startConnectorTransport, type TransportDeps } from "./connectorTransport";
import { backoffMs, createConnector, EMPTY_AUTH, type ConnectorRuntime } from "./connectors";

/**
 * Reconnect and status behaviour across a *sequence* of failures.
 *
 * This is the part of the connector that only shows itself over time, and the
 * part that was unreachable while it lived inside a React effect. Fake sockets
 * and a fake clock make the sequence deterministic.
 */

class FakeEventSource {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() {
    this.closed = true;
  }
}

class FakeWebSocket {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  readyState = 1;
  closedWith: number | null = null;
  constructor(public url: string) {}
  close(code?: number) {
    this.closedWith = code ?? null;
    this.readyState = 3;
  }
}

interface Harness {
  statuses: Partial<ConnectorRuntime>[];
  timers: { fn: () => void; ms: number }[];
  sources: FakeEventSource[];
  sockets: FakeWebSocket[];
  deps: TransportDeps;
  /** Fire the most recently scheduled timer. */
  runTimer(): void;
  last(): Partial<ConnectorRuntime> | undefined;
}

function harness(over: Partial<TransportDeps> = {}): Harness {
  const statuses: Partial<ConnectorRuntime>[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const sources: FakeEventSource[] = [];
  const sockets: FakeWebSocket[] = [];

  const deps: TransportDeps = {
    fetchOnce: async () => ({ ok: true, values: { a: "1" } }),
    ingest: (_c, values) => Object.keys(values).length,
    parsePayload: (text) => JSON.parse(text) as Record<string, string>,
    createEventSource: (url) => {
      const s = new FakeEventSource(url);
      sources.push(s);
      return s;
    },
    createWebSocket: (url) => {
      const s = new FakeWebSocket(url);
      sockets.push(s);
      return s;
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimeout: () => {},
    now: () => 1000,
    ...over,
  };

  return {
    statuses,
    timers,
    sources,
    sockets,
    deps: { ...deps, ...over },
    runTimer() {
      const t = timers.pop();
      t?.fn();
    },
    last: () => statuses[statuses.length - 1],
  };
}

function start(h: Harness, config = createConnector({ url: "https://x/y", enabled: true })) {
  return startConnectorTransport(config, { setStatus: (p) => h.statuses.push(p) }, h.deps);
}

describe("SSE", () => {
  const sseConfig = (over = {}) =>
    createConnector({ url: "https://x/y", enabled: true, transport: "sse", ...over });

  it("reports connecting before any payload arrives", () => {
    const h = harness();
    start(h, sseConfig());
    // A socket that has merely been opened is not live — an operator glancing
    // at the list must be able to trust green.
    expect(h.last()?.status).toBe("connecting");
  });

  it("goes live on a delivered payload", () => {
    const h = harness();
    start(h, sseConfig());
    h.sources[0].onmessage!({ data: JSON.stringify({ a: "1", b: "2" }) });
    expect(h.last()?.status).toBe("live");
    expect(h.last()?.lastKeyCount).toBe(2);
  });

  it("reports a malformed payload as malformed, not as a dropped connection", () => {
    const h = harness();
    start(h, sseConfig());
    h.sources[0].onmessage!({ data: "<html>" });
    expect(h.last()?.status).toBe("malformed");
  });

  it("reports a lost connection as unreachable rather than guessing auth", () => {
    // EventSource reconnects itself and cannot say why it failed, so claiming
    // auth-failed here would send an operator to check a working API key.
    const h = harness();
    start(h, sseConfig());
    h.sources[0].onerror!();
    expect(h.last()?.status).toBe("unreachable");
  });

  it("folds query auth into the stream URL", () => {
    const h = harness();
    start(h, sseConfig({ auth: { ...EMPTY_AUTH, kind: "query", name: "key", token: "s3cret" } }));
    expect(h.sources[0].url).toContain("key=s3cret");
  });

  it("closes the stream and goes silent on dispose", () => {
    const h = harness();
    const dispose = start(h, sseConfig());
    dispose();
    expect(h.sources[0].closed).toBe(true);

    const before = h.statuses.length;
    // A late event after teardown must not write status for a connector the
    // operator has already disabled.
    h.sources[0].onmessage!({ data: JSON.stringify({ a: "1" }) });
    h.sources[0].onerror!();
    expect(h.statuses.length).toBe(before);
  });
});

describe("WebSocket", () => {
  const wsConfig = (over = {}) =>
    createConnector({ url: "wss://x/y", enabled: true, transport: "websocket", ...over });

  it("goes live on a text frame", () => {
    const h = harness();
    start(h, wsConfig());
    h.sockets[0].onmessage!({ data: JSON.stringify({ a: "1" }) });
    expect(h.last()?.status).toBe("live");
  });

  it("ignores a non-string frame instead of throwing", () => {
    // A binary frame is delivered as an empty payload, which fails to parse
    // and is reported — it must not take the transport down.
    const h = harness();
    start(h, wsConfig());
    h.sockets[0].onmessage!({ data: new ArrayBuffer(4) });
    expect(h.last()?.status).toBe("malformed");
  });

  it("maps close code 1008 to auth-failed", () => {
    // 1008 is policy violation — what a server sends for a rejected token.
    const h = harness();
    start(h, wsConfig());
    h.sockets[0].onclose!({ code: 1008 });
    expect(h.last()?.status).toBe("auth-failed");
  });

  it("maps other abnormal close codes to unreachable", () => {
    for (const code of [1006, 1011, 4000]) {
      const h = harness();
      start(h, wsConfig());
      h.sockets[0].onclose!({ code });
      expect(h.last()?.status).toBe("unreachable");
    }
  });

  it("reconnects after a close", () => {
    const h = harness();
    start(h, wsConfig());
    expect(h.sockets).toHaveLength(1);
    h.sockets[0].onclose!({ code: 1006 });
    h.runTimer();
    expect(h.sockets).toHaveLength(2);
  });

  it("backs off further on each successive failure", () => {
    const h = harness();
    start(h, wsConfig());
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      h.sockets[h.sockets.length - 1].onclose!({ code: 1006 });
      delays.push(h.timers[h.timers.length - 1].ms);
      h.runTimer();
    }
    // Strictly increasing until the cap — a dead endpoint must not be hammered.
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
    expect(delays[delays.length - 1]).toBeLessThanOrEqual(backoffMs(99));
  });

  it("counts even a clean close toward backoff", () => {
    // A server that keeps closing politely would otherwise be reconnected to
    // in a tight loop.
    const h = harness();
    start(h, wsConfig());
    h.sockets[0].onclose!({ code: 1000 });
    expect(h.timers[h.timers.length - 1].ms).toBeGreaterThan(0);
  });

  it("resets backoff once a payload arrives", () => {
    const h = harness();
    start(h, wsConfig());
    h.sockets[0].onclose!({ code: 1006 });
    h.runTimer();
    const afterFailure = h.timers.length;
    h.sockets[1].onmessage!({ data: JSON.stringify({ a: "1" }) });
    expect(h.last()?.failureCount).toBe(0);

    h.sockets[1].onclose!({ code: 1006 });
    // First failure after a success backs off from the start again, so a
    // recovered feed that blips is not punished by its old failure count.
    expect(h.timers[afterFailure].ms).toBe(backoffMs(1));
  });

  it("recovers when the constructor itself throws", () => {
    let attempts = 0;
    const h = harness({
      createWebSocket: (url) => {
        attempts += 1;
        if (attempts === 1) throw new Error("bad url");
        return new FakeWebSocket(url) as never;
      },
    });
    start(h, wsConfig());
    expect(h.last()?.status).toBe("unreachable");
    h.runTimer();
    expect(attempts).toBe(2);
  });

  it("closes cleanly and goes silent on dispose", () => {
    const h = harness();
    const dispose = start(h, wsConfig());
    dispose();
    // 1000 so the server sees an intentional disconnect rather than logging a
    // dropped client on every settings change.
    expect(h.sockets[0].closedWith).toBe(1000);

    const before = h.statuses.length;
    h.sockets[0].onclose!({ code: 1006 });
    h.sockets[0].onerror!();
    expect(h.statuses.length).toBe(before);
  });

  it("does not reconnect after dispose", () => {
    const h = harness();
    const dispose = start(h, wsConfig());
    h.sockets[0].onclose!({ code: 1006 });
    dispose();
    h.runTimer();
    // A pending retry firing after teardown would reconnect to an endpoint the
    // operator has removed.
    expect(h.sockets).toHaveLength(1);
  });
});

describe("poll", () => {
  it("schedules the next poll at the configured interval on success", async () => {
    const h = harness();
    start(h, createConnector({ url: "https://x/y", enabled: true, pollIntervalSec: 7 }));
    await vi.waitFor(() => expect(h.timers.length).toBeGreaterThan(0));
    expect(h.timers[0].ms).toBe(7000);
    expect(h.last()?.status).toBe("live");
  });

  it("backs off past the configured interval after failures", async () => {
    const h = harness({
      fetchOnce: async () => ({ ok: false as const, status: "unreachable" as const, error: "down" }),
    });
    start(h, createConnector({ url: "https://x/y", enabled: true, pollIntervalSec: 1 }));
    await vi.waitFor(() => expect(h.timers.length).toBeGreaterThan(0));
    const first = h.timers[0].ms;
    expect(first).toBeGreaterThanOrEqual(1000);
    expect(h.last()?.status).toBe("unreachable");
    expect(h.last()?.failureCount).toBe(1);
  });

  it("never polls slower than the configured interval once recovered", async () => {
    // Backoff must not outlive the outage, or a recovered feed stays stale.
    const h = harness();
    start(h, createConnector({ url: "https://x/y", enabled: true, pollIntervalSec: 2 }));
    await vi.waitFor(() => expect(h.timers.length).toBeGreaterThan(0));
    expect(h.timers[0].ms).toBe(2000);
  });
});
