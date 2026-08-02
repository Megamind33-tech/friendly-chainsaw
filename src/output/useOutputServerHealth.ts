import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type OutputServerState = "starting" | "listening" | "bind_failed" | "crashed";

export interface OutputServerHealth {
  state: OutputServerState;
  addr: string;
  /** Operator-facing explanation; empty while healthy. */
  detail: string;
}

/** A dead sidecar is not a transient blip — no need to poll it hard. */
const POLL_MS = 2000;

/**
 * Whether the output sidecar is actually serving.
 *
 * Goes over Tauri IPC, not HTTP, on purpose: `useOutputStatus` polls
 * `/status`, which is served *by* the thing whose health is in question. When
 * the sidecar is down that request simply fails, which is indistinguishable
 * from a slow frame — so the Control Room used to show a perfectly healthy
 * window over a completely dead output plane (AUDIT-2026-08.md S2-12).
 */
export function useOutputServerHealth(): OutputServerHealth | null {
  const [health, setHealth] = useState<OutputServerHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await invoke<OutputServerHealth>("get_output_server_health");
        if (!cancelled) setHealth(next);
      } catch {
        // Outside Tauri (a browser-served Program window, a test harness)
        // there is no IPC. Staying null renders nothing rather than claiming
        // a failure that has not been observed.
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return health;
}

/** True when the output plane is down and the operator must act. */
export function isOutputServerDown(health: OutputServerHealth | null): boolean {
  return health?.state === "bind_failed" || health?.state === "crashed";
}
