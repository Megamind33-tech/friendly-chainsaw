import { useEffect, useState } from "react";

const STATUS_URL = "http://127.0.0.1:4977/status";
const POLL_INTERVAL_MS = 1000;

export type ProgramLivenessState = "live" | "stalled" | "no_consumer";

export interface NdiStatus {
  available: boolean;
  reason: string | null;
  connections: number | null;
}

export interface OutputStatus {
  programState: ProgramLivenessState;
  requestsPerSecond: number;
  expectedFps: number;
  healthPct: number;
  /** Honest proxy: expected pulls minus observed pulls over the rolling
   * window. NOT a count of dropped video frames — there is no real video
   * pipeline yet (that lands in Phase 8). */
  missedPullsProxy: number;
  ndi: NdiStatus;
}

/**
 * Polls the Rust sidecar's /status route, the only source of ON-AIR
 * truth — it reflects real /program + /program/tick request flow, never
 * a button. Polling (not push) matches the rest of the app until Phase 7's
 * control server owns real-time push.
 */
export function useOutputStatus(): OutputStatus | null {
  const [status, setStatus] = useState<OutputStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(STATUS_URL);
        const data: OutputStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch (err) {
        console.error("failed to fetch output status", err);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
