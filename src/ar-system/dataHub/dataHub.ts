import type { ChaseDataPacket, DataPacketStatus, DataSourceConnection } from "./types";
import {
  electionDataSchema,
  electionToFlatValues,
  parseElectionInput,
} from "../validation/electionSchema";
import { flattenJsonValues } from "@/document/externalConnector";

interface HubSourceState {
  connection: DataSourceConnection;
  lastKnownGood: Record<string, string>;
  lastPacket: ChaseDataPacket | null;
}

const STALE_MS = 30_000;

class DataHubImpl {
  private sources = new Map<string, HubSourceState>();
  private listeners = new Set<() => void>();
  /** Cached snapshot for useSyncExternalStore consumers — getSnapshot MUST
   * return a stable identity between changes or React 19 dev loops forever
   * ("Maximum update depth exceeded", hit live on the Data/AR pages). */
  private connectionsSnapshot: DataSourceConnection[] | null = null;

  constructor() {
    this.registerSource({
      sourceId: "election",
      label: "Election Results",
      type: "internal",
      // "offline" until a payload actually arrives. Registering as "live" made
      // the Data Sources panel report a live election feed on a cold launch,
      // before any data had been ingested at all.
      status: "offline",
      lastUpdateAt: null,
      lastSequence: null,
      lastError: null,
      staleAfterMs: STALE_MS,
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.connectionsSnapshot = null;
    this.listeners.forEach((l) => l());
  }

  registerSource(conn: DataSourceConnection): void {
    this.sources.set(conn.sourceId, {
      connection: conn,
      lastKnownGood: {},
      lastPacket: null,
    });
    this.connectionsSnapshot = null;
  }

  getConnection(sourceId: string): DataSourceConnection | undefined {
    return this.sources.get(sourceId)?.connection;
  }

  getAllConnections(): DataSourceConnection[] {
    if (!this.connectionsSnapshot) {
      this.connectionsSnapshot = Array.from(this.sources.values()).map((s) => s.connection);
    }
    return this.connectionsSnapshot;
  }

  getLastKnownGood(sourceId: string): Record<string, string> {
    return { ...(this.sources.get(sourceId)?.lastKnownGood ?? {}) };
  }

  getLastPacket(sourceId: string): ChaseDataPacket | null {
    return this.sources.get(sourceId)?.lastPacket ?? null;
  }

  ingest(sourceId: string, payload: unknown, sequence?: number): Record<string, string> | null {
    const state = this.sources.get(sourceId);
    if (!state) return null;

    const now = Date.now();
    const conn = state.connection;

    if (sequence !== undefined && conn.lastSequence !== null && sequence <= conn.lastSequence) {
      this.updateConnection(sourceId, { status: "invalid", lastError: "Out-of-order sequence rejected" });
      return state.lastKnownGood;
    }

    let flat: Record<string, string> | null = null;
    let errors: string[] = [];
    /** What this specific payload claims to be. Only a payload that asserts
     * liveness gets "live"; a plain external JSON push is evidenced live by
     * its own arrival. */
    let declared: DataPacketStatus = "live";

    if (sourceId === "election") {
      const parsed = parseElectionInput(payload);
      if (!parsed.ok) {
        errors = parsed.errors;
        this.recordPacket(sourceId, { sourceId, receivedAt: now, sequence, payload, status: "invalid", validationErrors: errors });
        this.updateConnection(sourceId, { status: "invalid", lastError: errors.join("; "), lastUpdateAt: now });
        return state.lastKnownGood;
      }
      const strict = electionDataSchema.safeParse(parsed.data);
      if (!strict.success) {
        errors = strict.error.issues.map((i) => i.message);
        this.recordPacket(sourceId, { sourceId, receivedAt: now, sequence, payload, status: "invalid", validationErrors: errors });
        this.updateConnection(sourceId, { status: "invalid", lastError: errors.join("; ") });
        return state.lastKnownGood;
      }
      flat = electionToFlatValues(strict.data);
      // Carry the payload's own attribution through to the connection status.
      // Hardcoding "live" here overrode "simulated"/"sample"/"unknown" and was
      // the last place fabricated election numbers could still read as live.
      declared = strict.data.sourceStatus;
    } else {
      flat = flattenJsonValues(payload, sourceId);
    }

    if (flat) {
      state.lastKnownGood = { ...state.lastKnownGood, ...flat };
      this.recordPacket(sourceId, { sourceId, receivedAt: now, sequence, payload, status: declared });
      this.updateConnection(sourceId, {
        status: declared,
        lastUpdateAt: now,
        lastSequence: sequence ?? conn.lastSequence,
        lastError: null,
      });
      this.notify();
      return flat;
    }

    return state.lastKnownGood;
  }

  ingestFlat(sourceId: string, values: Record<string, string>): Record<string, string> | null {
    if (sourceId === "election") {
      return this.ingest("election", values);
    }
    const state = this.sources.get(sourceId);
    if (!state) return null;
    state.lastKnownGood = { ...state.lastKnownGood, ...values };
    this.updateConnection(sourceId, { status: "live", lastUpdateAt: Date.now(), lastError: null });
    this.notify();
    return values;
  }

  private recordPacket(sourceId: string, packet: ChaseDataPacket): void {
    const state = this.sources.get(sourceId);
    if (state) state.lastPacket = packet;
  }

  private updateConnection(sourceId: string, patch: Partial<DataSourceConnection>): void {
    const state = this.sources.get(sourceId);
    if (!state) return;
    state.connection = { ...state.connection, ...patch };
    this.notify();
  }

  tickStaleCheck(): void {
    const now = Date.now();
    for (const [id, state] of this.sources) {
      const conn = state.connection;
      if (conn.lastUpdateAt === null) {
        // A source that has NEVER delivered a payload was skipped entirely by
        // the old `if (conn.lastUpdateAt && ...)` guard, so it kept whatever
        // status it was registered with — forever. It cannot be live.
        if (conn.status === "live" || conn.status === "stale") {
          this.updateConnection(id, { status: "offline", lastError: "No data received" });
        }
        continue;
      }
      if (now - conn.lastUpdateAt > conn.staleAfterMs) {
        // Simulated/sample feeds go stale on the same clock as live ones —
        // gating this on `status === "live"` left them pinned to their
        // original status no matter how long updates had stopped.
        if (conn.status === "live" || conn.status === "simulated") {
          this.updateConnection(id, { status: "stale", lastError: "No update within stale timeout" });
        }
      }
    }
  }
}

export const dataHub = new DataHubImpl();

export function publishElectionData(data: import("../validation/electionSchema").ElectionData, sequence?: number): Record<string, string> {
  return dataHub.ingest("election", data, sequence) ?? {};
}
