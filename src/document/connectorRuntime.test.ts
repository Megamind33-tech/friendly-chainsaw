import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { fetchOnce, ingest, parsePayload } from "./ConnectorRuntimeHost";
import { createConnector, EMPTY_AUTH } from "./connectors";
import { useDataStore } from "./dataSources";

/**
 * Connector transport behaviour.
 *
 * This is the code that decides what an operator sees when a feed misbehaves,
 * and whether a credential can end up in a stored error string. Both matter
 * more than the happy path, so that is where these tests aim.
 */

const signal = () => new AbortController().signal;

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchOnce — success", () => {
  it("flattens a JSON payload into binding keys", async () => {
    mockFetch(() => json({ weather: { temp: 24 } }));
    const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.values).toEqual({ "weather.temp": "24" });
  });

  it("sends configured credentials", async () => {
    const spy = mockFetch(() => json({ a: 1 }));
    await fetchOnce(
      createConnector({ url: "https://x/y", auth: { ...EMPTY_AUTH, kind: "bearer", token: "tok" } }),
      signal(),
    );
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("folds query-parameter auth into the URL", async () => {
    const spy = mockFetch(() => json({ a: 1 }));
    await fetchOnce(
      createConnector({
        url: "https://x/y",
        auth: { ...EMPTY_AUTH, kind: "query", name: "key", token: "s3cret" },
      }),
      signal(),
    );
    expect(String(spy.mock.calls[0][0])).toContain("key=s3cret");
  });
});

describe("fetchOnce — failure classification", () => {
  it("reports 401 and 403 as auth-failed, not a generic outage", async () => {
    for (const code of [401, 403]) {
      mockFetch(() => new Response("nope", { status: code }));
      const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.status).toBe("auth-failed");
    }
  });

  it("reports other HTTP errors as unreachable", async () => {
    for (const code of [404, 500, 503]) {
      mockFetch(() => new Response("boom", { status: code }));
      const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
      if (outcome.ok) throw new Error("expected failure");
      expect(outcome.status).toBe("unreachable");
    }
  });

  it("reports a network throw as unreachable rather than propagating", async () => {
    // An unhandled rejection here would take down the poll loop and the feed
    // would silently stop retrying.
    mockFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.status).toBe("unreachable");
    expect(outcome.error).toContain("ECONNREFUSED");
  });

  it("reports unparseable JSON as malformed, distinct from unreachable", async () => {
    // The endpoint answered — the payload is the problem. Telling an operator
    // "unreachable" would send them to check the network instead of the feed.
    mockFetch(() => new Response("<html>not json</html>", { status: 200 }));
    const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.status).toBe("malformed");
  });

  it("never returns live for any failure", async () => {
    for (const make of [
      () => new Response("", { status: 401 }),
      () => new Response("", { status: 500 }),
      () => new Response("nope", { status: 200 }),
    ]) {
      mockFetch(make);
      const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
      if (outcome.ok) throw new Error("expected failure");
      expect(outcome.status).not.toBe("live");
    }
  });
});

describe("fetchOnce — credential leakage", () => {
  it("scrubs a bearer token echoed back in an error body", async () => {
    // A 401 body routinely quotes the credential it rejected, and this string
    // is stored on the connector and rendered in the panel.
    mockFetch(() => new Response('{"rejected":"abc123"}', { status: 401 }));
    const outcome = await fetchOnce(
      createConnector({ url: "https://x/y", auth: { ...EMPTY_AUTH, kind: "bearer", token: "abc123" } }),
      signal(),
    );
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.error).not.toContain("abc123");
    expect(outcome.error).toContain("***");
  });

  it("scrubs a query key out of a network error naming the full URL", async () => {
    mockFetch(() => Promise.reject(new Error("failed to fetch https://x/y?key=s3cret")));
    const outcome = await fetchOnce(
      createConnector({
        url: "https://x/y",
        auth: { ...EMPTY_AUTH, kind: "query", name: "key", token: "s3cret" },
      }),
      signal(),
    );
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.error).not.toContain("s3cret");
  });

  it("scrubs a basic password", async () => {
    mockFetch(() => new Response("bad password hunter2", { status: 403 }));
    const outcome = await fetchOnce(
      createConnector({
        url: "https://x/y",
        auth: { ...EMPTY_AUTH, kind: "basic", username: "u", password: "hunter2" },
      }),
      signal(),
    );
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.error).not.toContain("hunter2");
  });

  it("truncates a huge error body instead of storing it whole", async () => {
    mockFetch(() => new Response("x".repeat(10_000), { status: 500 }));
    const outcome = await fetchOnce(createConnector({ url: "https://x/y" }), signal());
    if (outcome.ok) throw new Error("expected failure");
    expect(outcome.error.length).toBeLessThan(400);
  });
});

describe("ingest", () => {
  beforeEach(() => {
    useDataStore.setState({ weather: { id: "weather", name: "Weather", values: {} } });
  });

  it("applies the connector's target source and reports the key count", () => {
    const config = createConnector({ targetSource: "weather" });
    expect(ingest(config, { temp: "24", wind: "8" })).toBe(2);
    expect(useDataStore.getState().weather.values).toMatchObject({ temp: "24", wind: "8" });
  });

  it("applies a whole payload in ONE store write", () => {
    // A push feed can deliver at frame rate; one write per key would be one
    // full output bake per key (S1-4).
    let updates = 0;
    const unsubscribe = useDataStore.subscribe(() => {
      updates++;
    });
    ingest(createConnector({ targetSource: "weather" }), { a: "1", b: "2", c: "3", d: "4" });
    unsubscribe();
    expect(updates).toBe(1);
  });

  it("does not touch the store for an empty payload", () => {
    let updates = 0;
    const unsubscribe = useDataStore.subscribe(() => {
      updates++;
    });
    expect(ingest(createConnector({ targetSource: "weather" }), {})).toBe(0);
    unsubscribe();
    expect(updates).toBe(0);
  });

  it("honours the field map", () => {
    const config = createConnector({ targetSource: "weather", fieldMap: { t: "temp" } });
    ingest(config, { t: "31" });
    expect(useDataStore.getState().weather.values.temp).toBe("31");
  });
});

describe("parsePayload", () => {
  it("flattens nested JSON", () => {
    expect(parsePayload('{"a":{"b":1}}')).toEqual({ "a.b": "1" });
  });

  it("throws on invalid JSON so the caller can classify it as malformed", () => {
    expect(() => parsePayload("nope")).toThrow();
  });
});
