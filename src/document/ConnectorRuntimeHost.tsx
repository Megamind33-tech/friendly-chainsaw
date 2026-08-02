import { useEffect } from "react";
import { flattenJsonValues, mergeExternalValues } from "./externalConnector";
import {
  applyAuth,
  applyFieldMapping,
  isStale,
  redactError,
  statusForHttpCode,
  useConnectorStore,
  type ConnectorRuntime,
  type DataConnectorConfig,
} from "./connectors";
import {
  startConnectorTransport,
  type EventSourceLike,
  type TransportDeps,
  type WebSocketLike,
} from "./connectorTransport";

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

/** Real browser primitives. The transport takes these as parameters so tests
 * can drive reconnect sequences without real sockets or real clocks. */
const BROWSER_DEPS: TransportDeps = {
  fetchOnce,
  ingest,
  parsePayload,
  createEventSource: (url) => new EventSource(url) as unknown as EventSourceLike,
  createWebSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

function useOneConnector(config: DataConnectorConfig): void {
  const setRuntime = useConnectorStore((s) => s.setRuntime);

  // Only connection-defining fields are dependencies. `name`, `fieldMap` and
  // `targetSource` are read through the closure over `config` on each delivery
  // instead, so retitling a connector never drops its socket.
  const { id, enabled, transport, url, pollIntervalSec } = config;
  const authKey = JSON.stringify(config.auth);

  useEffect(() => {
    if (!enabled || !url.trim()) {
      setRuntime(id, { status: enabled ? "idle" : "disabled", lastError: null });
      return;
    }
    return startConnectorTransport(
      config,
      { setStatus: (patch) => setRuntime(id, patch) },
      BROWSER_DEPS,
    );
    // `config` is intentionally not a dependency — see the comment above.
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
