export type DataPacketStatus = "live" | "stale" | "offline" | "invalid";

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
