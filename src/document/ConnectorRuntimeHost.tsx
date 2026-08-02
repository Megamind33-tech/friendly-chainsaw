import { useEffect } from "react";
import { flattenJsonValues, mergeExternalValues } from "./externalConnector";
import {
  applyAuth,
  applyFieldMapping,
  backoffMs,
  isStale,
  redactError,
  statusForHttpCode,
  useConnectorStore,
  type ConnectorRuntime,
  type DataConnectorConfig,
} from "./connectors";

/**
 * Drives every enabled connector.
 *
 * One effect per connector, keyed on the fields that actually define the
 * connection, so editing a name or a field map does not tear down a live
 * socket mid-show.
 *
 * All three transports converge on the same two steps — flatten the JSON to
 * binding keys, then hand it to `mergeExternalValues`, which applies a whole
 * multi-source payload in a single store write (AUDIT-2026-08.md S1-4). A push
 * feed delivering 30 updates a second would otherwise be 30 full output bakes
 * a second.
 */

/** What a transport reports back, so the three share one status path. */
export type Outcome =
  | { ok: true; values: Record<string, string> }
  | { ok: false; status: ConnectorRuntime["status"]; error: string };

export function ingest(config: DataConnectorConfig, raw: Record<string, string>): number {
  const mapped = applyFieldMapping(raw, config);
  const count = Object.keys(mapped).length;
  if (count > 0) mergeExternalValues(mapped);
  return count;
}

export function parsePayload(text: string): Record<string, string> {
  return flattenJsonValues(JSON.parse(text) as unknown);
}

/**
 * One poll request, from URL construction through status classification.
 *
 * Exported and kept free of React so the transport's decision-making — which
 * failure becomes which operator-facing status, and whether a credential can
 * leak into a stored error — is testable without mounting a component.
 */
export async function fetchOnce(config: DataConnectorConfig, signal: AbortSignal): Promise<Outcome> {
  const { url, headers } = applyAuth(config.url, config.auth);
  let response: Response;
  try {
    response = await fetch(url, { headers, signal });
  } catch (err) {
    return {
      ok: false,
      status: "unreachable",
      error: redactError(err instanceof Error ? err.message : String(err), config.auth),
    };
  }
  if (!response.ok) {
    // Body is read for the operator-facing message but scrubbed first: a 401
    // response routinely quotes back the credential it rejected.
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      status: statusForHttpCode(response.status),
      error: redactError(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`, config.auth),
    };
  }
  try {
    return { ok: true, values: parsePayload(await response.text()) };
  } catch (err) {
    return {
      ok: false,
      status: "malformed",
      error: redactError(err instanceof Error ? err.message : String(err), config.auth),
    };
  }
}

function useOneConnector(config: DataConnectorConfig): void {
  const setRuntime = useConnectorStore((s) => s.setRuntime);

  // Only connection-defining fields are dependencies. `name`, `fieldMap` and
  // `targetSource` are read through a ref-like closure over `config` on each
  // delivery instead, so retitling a connector never drops its socket.
  const { id, enabled, transport, url, pollIntervalSec } = config;
  const authKey = JSON.stringify(config.auth);

  useEffect(() => {
    if (!enabled || !url.trim()) {
      setRuntime(id, { status: enabled ? "idle" : "disabled", lastError: null });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;
    let socket: WebSocket | null = null;
    const controller = new AbortController();
    let failures = 0;

    const succeed = (count: number) => {
      failures = 0;
      setRuntime(id, {
        status: "live",
        lastSyncAt: Date.now(),
        lastError: null,
        failureCount: 0,
        lastKeyCount: count,
      });
    };

    const fail = (status: ConnectorRuntime["status"], error: string) => {
      failures += 1;
      // lastSyncAt is deliberately left alone: it records the last time real
      // data arrived, which is what an operator needs during an outage.
      setRuntime(id, { status, lastError: error, failureCount: failures });
    };

    const deliver = (text: string) => {
      if (cancelled) return;
      try {
        succeed(ingest(config, parsePayload(text)));
      } catch (err) {
        fail("malformed", redactError(err instanceof Error ? err.message : String(err), config.auth));
      }
    };

    // ---- poll -----------------------------------------------------------
    const poll = async () => {
      if (cancelled) return;
      const outcome = await fetchOnce(config, controller.signal);
      if (cancelled) return;
      if (outcome.ok) succeed(ingest(config, outcome.values));
      else fail(outcome.status, outcome.error);
      // Back off after failures instead of hammering a dead endpoint at the
      // configured rate, but never slower than the cap so recovery is quick.
      const delay = failures > 0 ? Math.max(pollIntervalSec * 1000, backoffMs(failures)) : pollIntervalSec * 1000;
      timer = setTimeout(() => void poll(), delay);
    };

    // ---- SSE ------------------------------------------------------------
    const openSse = () => {
      if (cancelled) return;
      setRuntime(id, { status: "connecting" });
      // EventSource cannot send headers, so header/bearer auth is not
      // expressible on this transport — `applyAuth` still folds `query` auth
      // into the URL, which is how SSE endpoints normally authenticate.
      const { url: authedUrl } = applyAuth(url, config.auth);
      source = new EventSource(authedUrl);
      source.onmessage = (event) => deliver(event.data);
      source.onerror = () => {
        if (cancelled) return;
        // EventSource reconnects itself, but it cannot tell us why it failed,
        // so this is reported as unreachable rather than guessing auth.
        fail("unreachable", "SSE connection lost");
      };
    };

    // ---- WebSocket ------------------------------------------------------
    const openSocket = () => {
      if (cancelled) return;
      setRuntime(id, { status: "connecting" });
      const { url: authedUrl } = applyAuth(url, config.auth);
      try {
        socket = new WebSocket(authedUrl);
      } catch (err) {
        fail("unreachable", redactError(err instanceof Error ? err.message : String(err), config.auth));
        timer = setTimeout(openSocket, backoffMs(failures));
        return;
      }
      socket.onmessage = (event) => deliver(typeof event.data === "string" ? event.data : "");
      socket.onerror = () => {
        if (!cancelled) fail("unreachable", "WebSocket error");
      };
      socket.onclose = (event) => {
        if (cancelled) return;
        // 1000/1005 are clean closes; anything else is a fault worth showing.
        if (event.code !== 1000 && event.code !== 1005) {
          // 1008 (policy violation) is what servers send for a rejected token.
          fail(event.code === 1008 ? "auth-failed" : "unreachable", `WebSocket closed (${event.code})`);
        } else {
          failures += 1;
        }
        timer = setTimeout(openSocket, backoffMs(failures));
      };
    };

    if (transport === "poll") void poll();
    else if (transport === "sse") openSse();
    else openSocket();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      source?.close();
      // 1000 = normal closure, so the server sees an intentional disconnect
      // rather than logging a dropped client every time a setting changes.
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close(1000);
      }
    };
    // `config` itself is intentionally not a dependency — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled, transport, url, pollIntervalSec, authKey, setRuntime]);
}

/** Renders nothing; exists so each connector gets its own hook instance. */
function ConnectorRunner({ config }: { config: DataConnectorConfig }) {
  useOneConnector(config);
  return null;
}

/**
 * Mount once, near the app root. Runs every configured connector and ages live
 * ones into `stale` when their feed goes quiet — a connector that stopped
 * updating must stop claiming to be live, exactly as the AR data hub does.
 */
export function ConnectorRuntimeHost() {
  const connectors = useConnectorStore((s) => s.connectors);

  useEffect(() => {
    const timer = setInterval(() => {
      const { connectors: list, runtime, setRuntime } = useConnectorStore.getState();
      const now = Date.now();
      for (const c of list) {
        const rt = runtime[c.id];
        if (rt && isStale(rt, c.staleAfterSec, now)) {
          setRuntime(c.id, { status: "stale", lastError: "No update within stale window" });
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {connectors.map((config) => (
        <ConnectorRunner key={config.id} config={config} />
      ))}
    </>
  );
}
