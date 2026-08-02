/**
 * "live" is reserved for a source that has actually delivered a payload
 * asserting its own liveness. "simulated"/"sample" mark generated or demo
 * data, "unknown" an unattributed payload — all three must read differently
 * from "live" anywhere an operator can see them, so fabricated numbers can
 * never be mistaken for a real feed on air.
 */
export type DataPacketStatus =
  | "live"
  | "simulated"
  | "sample"
  | "stale"
  | "offline"
  | "invalid"
  | "unknown";

/** Statuses that represent genuinely live, trustworthy-on-air data. */
export function isLiveStatus(status: DataPacketStatus): boolean {
  return status === "live";
}

export interface ChaseDataPacket {
  sourceId: string;
  receivedAt: number;
  sequence?: number;
  payload: unknown;
  status: DataPacketStatus;
  validationErrors?: string[];
}

export interface DataSourceConnection {
  sourceId: string;
  label: string;
  type: "manual" | "json" | "csv" | "rest" | "websocket" | "internal";
  status: DataPacketStatus;
  lastUpdateAt: number | null;
  lastSequence: number | null;
  lastError: string | null;
  pollIntervalMs?: number;
  staleAfterMs: number;
}

export type BindingUpdateMode = "instant" | "animated" | "preview-first" | "manual";

export interface BindingTransform {
  type: "direct" | "number" | "percent" | "currency" | "uppercase" | "lowercase" | "clamp" | "color-map";
  format?: string;
  min?: number;
  max?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}
