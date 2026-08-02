import { describe, expect, it, beforeEach } from "vitest";
import {
  applyAuth,
  applyFieldMapping,
  backoffMs,
  clampPollSec,
  createConnector,
  DEFAULT_POLL_SEC,
  EMPTY_AUTH,
  IDLE_RUNTIME,
  isConnectorLive,
  isStale,
  MAX_POLL_SEC,
  MIN_POLL_SEC,
  migrateLegacyConnector,
  parseConnectors,
  redactError,
  statusForHttpCode,
  useConnectorStore,
  type ConnectorAuth,
  type ConnectorStatus,
} from "./connectors";

const auth = (over: Partial<ConnectorAuth> = {}): ConnectorAuth => ({ ...EMPTY_AUTH, ...over });

describe("applyAuth", () => {
  it("sends nothing when auth is none", () => {
    expect(applyAuth("https://x/y", auth())).toEqual({ url: "https://x/y", headers: {} });
  });

  it("builds a bearer header", () => {
    expect(applyAuth("https://x/y", auth({ kind: "bearer", token: "tok" })).headers).toEqual({
      Authorization: "Bearer tok",
    });
  });

  it("builds a custom header", () => {
    expect(applyAuth("https://x/y", auth({ kind: "header", name: "X-API-Key", token: "k" })).headers).toEqual({
      "X-API-Key": "k",
    });
  });

  it("base64-encodes basic credentials", () => {
    const { headers } = applyAuth("https://x/y", auth({ kind: "basic", username: "u", password: "p" }));
    expect(headers.Authorization).toBe(`Basic ${btoa("u:p")}`);
  });

  it("folds a query key into the URL and leaves headers empty", () => {
    const { url, headers } = applyAuth("https://x/y?a=1", auth({ kind: "query", name: "key", token: "s3cret" }));
    expect(url).toContain("key=s3cret");
    expect(url).toContain("a=1");
    expect(headers).toEqual({});
  });

  it("leaves a malformed URL untouched rather than inventing an error", () => {
    // The transport should report the real failure, not this helper.
    const { url } = applyAuth("not a url", auth({ kind: "query", name: "key", token: "s" }));
    expect(url).toBe("not a url");
  });

  it("omits incomplete credentials instead of sending empty ones", () => {
    expect(applyAuth("https://x/y", auth({ kind: "bearer", token: "" })).headers).toEqual({});
    expect(applyAuth("https://x/y", auth({ kind: "header", name: "X", token: "" })).headers).toEqual({});
  });
});

describe("redactError", () => {
  it("scrubs the token out of an error message", () => {
    // A 401 body routinely quotes back the credential it rejected.
    const msg = redactError('HTTP 401: {"rejected":"abc123"}', auth({ kind: "bearer", token: "abc123" }));
    expect(msg).not.toContain("abc123");
    expect(msg).toContain("***");
  });

  it("scrubs a basic password too", () => {
    expect(redactError("failed for hunter2", auth({ kind: "basic", password: "hunter2" }))).not.toContain("hunter2");
  });

  it("handles tokens containing regex metacharacters", () => {
    // Split/join rather than RegExp — a key like this would otherwise throw
    // or silently fail to match.
    const token = "a+b*c(d)[e]";
    expect(redactError(`bad key ${token} rejected`, auth({ kind: "bearer", token }))).not.toContain(token);
  });

  it("passes a message through untouched when there is no secret", () => {
    expect(redactError("connection refused", auth())).toBe("connection refused");
  });
});

describe("statusForHttpCode", () => {
  it("distinguishes auth failure from every other error", () => {
    // "Check the API key" and "the feed is down" are different operator
    // actions; collapsing them is why bad credentials get misdiagnosed.
    expect(statusForHttpCode(401)).toBe("auth-failed");
    expect(statusForHttpCode(403)).toBe("auth-failed");
    expect(statusForHttpCode(404)).toBe("unreachable");
    expect(statusForHttpCode(500)).toBe("unreachable");
  });

  it("never reports an error code as live", () => {
    for (const code of [400, 401, 403, 404, 418, 429, 500, 502, 503]) {
      expect(isConnectorLive(statusForHttpCode(code))).toBe(false);
    }
  });
});

describe("isConnectorLive", () => {
  it("is true only for live", () => {
    const all: ConnectorStatus[] = [
      "disabled",
      "idle",
      "connecting",
      "live",
      "stale",
      "auth-failed",
      "unreachable",
      "malformed",
    ];
    expect(all.filter(isConnectorLive)).toEqual(["live"]);
  });
});

describe("backoffMs", () => {
  it("doubles per failure and caps", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
    expect(backoffMs(99)).toBeLessThanOrEqual(30_000);
  });

  it("never returns a negative or zero delay", () => {
    expect(backoffMs(0)).toBeGreaterThan(0);
    expect(backoffMs(-5)).toBeGreaterThan(0);
  });
});

describe("applyFieldMapping", () => {
  it("namespaces keys under the target source", () => {
    expect(
      applyFieldMapping({ homeScore: "2" }, { fieldMap: {}, targetSource: "soccer" }),
    ).toEqual({ "soccer.homeScore": "2" });
  });

  it("renames through the field map before namespacing", () => {
    expect(
      applyFieldMapping({ hs: "2" }, { fieldMap: { hs: "homeScore" }, targetSource: "soccer" }),
    ).toEqual({ "soccer.homeScore": "2" });
  });

  it("treats an already-dotted mapped key as fully qualified", () => {
    // Lets one field escape the connector's prefix without disabling it
    // for every other field.
    expect(
      applyFieldMapping({ hs: "2" }, { fieldMap: { hs: "brand.panelBg" }, targetSource: "soccer" }),
    ).toEqual({ "brand.panelBg": "2" });
  });

  it("drops a field mapped to an empty string", () => {
    expect(applyFieldMapping({ junk: "x", keep: "y" }, { fieldMap: { junk: "" }, targetSource: "" })).toEqual({
      keep: "y",
    });
  });

  it("passes keys through untouched with no source and no map", () => {
    expect(applyFieldMapping({ "a.b": "1" }, { fieldMap: {}, targetSource: "" })).toEqual({ "a.b": "1" });
  });
});

describe("isStale", () => {
  const now = 1_000_000;

  it("ages a live connector out after its window", () => {
    const rt = { ...IDLE_RUNTIME, status: "live" as const, lastSyncAt: now - 31_000 };
    expect(isStale(rt, 30, now)).toBe(true);
    expect(isStale({ ...rt, lastSyncAt: now - 1000 }, 30, now)).toBe(false);
  });

  it("does not re-stale a connector that is already failing", () => {
    // An auth failure must keep saying auth failure, not decay into "stale",
    // which would hide the actual cause from the operator.
    const rt = { ...IDLE_RUNTIME, status: "auth-failed" as const, lastSyncAt: now - 99_000 };
    expect(isStale(rt, 30, now)).toBe(false);
  });

  it("does not stale a connector that has never delivered", () => {
    expect(isStale({ ...IDLE_RUNTIME, status: "live", lastSyncAt: null }, 30, now)).toBe(false);
  });
});

describe("clampPollSec", () => {
  it("bounds the interval and rejects non-finite input", () => {
    expect(clampPollSec(5)).toBe(5);
    expect(clampPollSec(0)).toBe(MIN_POLL_SEC);
    expect(clampPollSec(999_999)).toBe(MAX_POLL_SEC);
    expect(clampPollSec(Number.NaN)).toBe(DEFAULT_POLL_SEC);
  });
});

describe("parseConnectors", () => {
  it("returns nothing for junk instead of throwing", () => {
    expect(parseConnectors(null)).toEqual([]);
    expect(parseConnectors({})).toEqual([]);
    expect(parseConnectors("nope")).toEqual([]);
  });

  it("drops entries with no url rather than crashing the panel", () => {
    expect(parseConnectors([{ name: "broken" }, { url: "https://ok" }])).toHaveLength(1);
  });

  it("re-defaults every field read off disk", () => {
    const [c] = parseConnectors([{ url: "https://x", transport: "carrier-pigeon", pollIntervalSec: -4 }]);
    expect(c.transport).toBe("poll");
    expect(c.pollIntervalSec).toBe(MIN_POLL_SEC);
    expect(c.auth.kind).toBe("none");
    expect(c.fieldMap).toEqual({});
  });

  it("preserves a valid stored connector round-trip", () => {
    const original = createConnector({
      name: "Scores",
      url: "wss://feed/live",
      transport: "websocket",
      enabled: true,
      targetSource: "soccer",
      auth: { ...EMPTY_AUTH, kind: "bearer", token: "t" },
    });
    const [parsed] = parseConnectors(JSON.parse(JSON.stringify([original])));
    expect(parsed).toEqual(original);
  });
});

describe("migrateLegacyConnector", () => {
  it("carries the old single endpoint forward", () => {
    // An operator must not silently lose a configured feed on upgrade.
    const migrated = migrateLegacyConnector({ enabled: true, apiUrl: "https://old/api", pollIntervalSec: 9 });
    expect(migrated).not.toBeNull();
    expect(migrated!.url).toBe("https://old/api");
    expect(migrated!.enabled).toBe(true);
    expect(migrated!.pollIntervalSec).toBe(9);
    expect(migrated!.transport).toBe("poll");
  });

  it("ignores an empty or absent legacy setting", () => {
    expect(migrateLegacyConnector({ enabled: true, apiUrl: "" })).toBeNull();
    expect(migrateLegacyConnector({})).toBeNull();
    expect(migrateLegacyConnector(null)).toBeNull();
  });
});

describe("connector store", () => {
  beforeEach(() => useConnectorStore.getState().replaceAll([]));

  it("adds a connector in a non-live, disabled state", () => {
    // A brand-new connector must never start out claiming to be connected.
    const id = useConnectorStore.getState().addConnector();
    const c = useConnectorStore.getState().connectors[0];
    expect(c.enabled).toBe(false);
    expect(useConnectorStore.getState().runtime[id].status).toBe("idle");
    expect(isConnectorLive(useConnectorStore.getState().runtime[id].status)).toBe(false);
  });

  it("merges an auth patch without blanking the fields it did not set", () => {
    const id = useConnectorStore.getState().addConnector({
      auth: { ...EMPTY_AUTH, kind: "header", name: "X-Key", token: "secret" },
    });
    useConnectorStore.getState().updateConnector(id, { auth: { name: "X-Other" } });
    const c = useConnectorStore.getState().connectors[0];
    expect(c.auth.name).toBe("X-Other");
    expect(c.auth.token).toBe("secret");
    expect(c.auth.kind).toBe("header");
  });

  it("clamps a poll interval set through the store", () => {
    const id = useConnectorStore.getState().addConnector();
    useConnectorStore.getState().updateConnector(id, { pollIntervalSec: 100_000 });
    expect(useConnectorStore.getState().connectors[0].pollIntervalSec).toBe(MAX_POLL_SEC);
  });

  it("drops runtime state along with the connector", () => {
    const id = useConnectorStore.getState().addConnector();
    useConnectorStore.getState().removeConnector(id);
    expect(useConnectorStore.getState().runtime[id]).toBeUndefined();
    expect(useConnectorStore.getState().connectors).toHaveLength(0);
  });
});
