import {
  applyAuth,
  backoffMs,
  redactError,
  type ConnectorRuntime,
  type DataConnectorConfig,
} from "./connectors";

/**
 * Connector transport lifecycle — poll, SSE and WebSocket — as a plain
 * function with injectable network primitives.
 *
 * Extracted out of the React effect it used to live inside. Reconnect and
 * status behaviour is the part most worth testing and the part hardest to
 * reach through a component: it only shows itself across a *sequence* of
 * failures over time. Taking `EventSource`/`WebSocket`/`setTimeout` as
 * parameters lets a test drive that sequence deterministically instead of
 * waiting on real sockets and real clocks.
 */

/** The subset of `EventSource` this uses. */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  close(): void;
}

/** The subset of `WebSocket` this uses. */
export interface WebSocketLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  readyState: number;
  close(code?: number): void;
}

export interface TransportDeps {
  fetchOnce: (
    config: DataConnectorConfig,
    signal: AbortSignal,
  ) => Promise<
    { ok: true; values: Record<string, string> } | { ok: false; status: ConnectorRuntime["status"]; error: string }
  >;
  /** Applies a delivered payload; returns how many keys landed. */
  ingest: (config: DataConnectorConfig, values: Record<string, string>) => number;
  parsePayload: (text: string) => Record<string, string>;
  createEventSource: (url: string) => EventSourceLike;
  createWebSocket: (url: string) => WebSocketLike;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

export interface TransportCallbacks {
  setStatus: (patch: Partial<ConnectorRuntime>) => void;
}

/** `WebSocket.OPEN`/`CONNECTING` without depending on the global existing. */
const WS_CONNECTING = 0;
const WS_OPEN = 1;

/**
 * Start a connector. Returns a disposer that tears the transport down.
 *
 * A disposed transport must go completely quiet: a late socket event or a
 * pending retry firing after teardown would write status for a connector the
 * operator has already disabled, or reconnect to an endpoint they removed.
 */
export function startConnectorTransport(
  config: DataConnectorConfig,
  callbacks: TransportCallbacks,
  deps: TransportDeps,
): () => void {
  let cancelled = false;
  let timer: unknown = null;
  let source: EventSourceLike | null = null;
  let socket: WebSocketLike | null = null;
  const controller = new AbortController();
  let failures = 0;

  const succeed = (count: number) => {
    failures = 0;
    callbacks.setStatus({
      status: "live",
      lastSyncAt: deps.now(),
      lastError: null,
      failureCount: 0,
      lastKeyCount: count,
    });
  };

  const fail = (status: ConnectorRuntime["status"], error: string) => {
    failures += 1;
    // lastSyncAt is deliberately untouched: it records the last time real data
    // arrived, which is what an operator needs to know during an outage.
    callbacks.setStatus({ status, lastError: error, failureCount: failures });
  };

  const deliver = (text: string) => {
    if (cancelled) return;
    try {
      succeed(deps.ingest(config, deps.parsePayload(text)));
    } catch (err) {
      fail("malformed", redactError(err instanceof Error ? err.message : String(err), config.auth));
    }
  };

  const retryAfter = (ms: number, fn: () => void) => {
    timer = deps.setTimeout(() => {
      if (!cancelled) fn();
    }, ms);
  };

  // ---- poll ---------------------------------------------------------------
  const poll = async () => {
    if (cancelled) return;
    const outcome = await deps.fetchOnce(config, controller.signal);
    if (cancelled) return;
    if (outcome.ok) succeed(deps.ingest(config, outcome.values));
    else fail(outcome.status, outcome.error);
    // Back off after failures rather than hammering a dead endpoint at the
    // configured rate — but never slower than the configured interval, so a
    // recovered endpoint is picked up promptly.
    const base = config.pollIntervalSec * 1000;
    retryAfter(failures > 0 ? Math.max(base, backoffMs(failures)) : base, () => void poll());
  };

  // ---- SSE ----------------------------------------------------------------
  const openSse = () => {
    if (cancelled) return;
    callbacks.setStatus({ status: "connecting" });
    // EventSource cannot set request headers, so bearer/header auth is not
    // expressible on this transport. `applyAuth` still folds `query` auth into
    // the URL, which is how SSE endpoints normally authenticate.
    const { url } = applyAuth(config.url, config.auth);
    source = deps.createEventSource(url);
    source.onmessage = (event) => deliver(event.data);
    source.onerror = () => {
      if (cancelled) return;
      // EventSource reconnects itself and cannot report why it failed, so this
      // is reported as unreachable rather than guessing at auth.
      fail("unreachable", "SSE connection lost");
    };
  };

  // ---- WebSocket ----------------------------------------------------------
  const openSocket = () => {
    if (cancelled) return;
    callbacks.setStatus({ status: "connecting" });
    const { url } = applyAuth(config.url, config.auth);
    try {
      socket = deps.createWebSocket(url);
    } catch (err) {
      fail("unreachable", redactError(err instanceof Error ? err.message : String(err), config.auth));
      retryAfter(backoffMs(failures), openSocket);
      return;
    }
    socket.onmessage = (event) => deliver(typeof event.data === "string" ? event.data : "");
    socket.onerror = () => {
      if (!cancelled) fail("unreachable", "WebSocket error");
    };
    socket.onclose = (event) => {
      if (cancelled) return;
      if (event.code !== 1000 && event.code !== 1005) {
        // 1008 (policy violation) is what a server sends for a rejected token,
        // so it maps to auth-failed rather than a generic outage.
        fail(event.code === 1008 ? "auth-failed" : "unreachable", `WebSocket closed (${event.code})`);
      } else {
        // A clean close still counts toward backoff — a server that keeps
        // closing politely would otherwise be reconnected to in a tight loop.
        failures += 1;
      }
      retryAfter(backoffMs(failures), openSocket);
    };
  };

  if (config.transport === "poll") void poll();
  else if (config.transport === "sse") openSse();
  else openSocket();

  return () => {
    cancelled = true;
    controller.abort();
    if (timer !== null) deps.clearTimeout(timer);
    source?.close();
    source = null;
    // 1000 = normal closure, so the server sees an intentional disconnect
    // rather than logging a dropped client on every settings change.
    if (socket && (socket.readyState === WS_OPEN || socket.readyState === WS_CONNECTING)) {
      socket.close(1000);
    }
    socket = null;
  };
}
