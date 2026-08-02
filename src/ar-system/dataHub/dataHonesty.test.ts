import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { dataHub } from "./dataHub";
import { startElectionSimulator, stopElectionSimulator } from "./electionSimulator";
import {
  ELECTION_SAMPLE_JSON,
  electionDataSchema,
  electionToFlatValues,
} from "../validation/electionSchema";
import { ELECTION_PRESETS } from "@/ar-asset-builder/presets/election";

/**
 * On-air data honesty.
 *
 * The single rule these tests defend: nothing reaches an operator-visible
 * status as "live" unless a payload actually asserted its own liveness. Five
 * independent code paths used to fail open to "live" — the sample payload, the
 * simulator, the schema default, the preset binding fallback, and the data
 * hub's own cold-start registration — so invented vote totals were
 * indistinguishable from a real election feed on air.
 */
describe("election data source status", () => {
  const minimalPayload = {
    title: "TEST RACE",
    reportingPct: 10,
    candidates: [{ name: "A", party: "P", votes: 1, percentage: 100, rank: 1 }],
  };

  it("does not default an unattributed payload to live", () => {
    const parsed = electionDataSchema.parse(minimalPayload);
    expect(parsed.sourceStatus).toBe("unknown");
    expect(electionToFlatValues(parsed)["election.sourceStatus"]).toBe("unknown");
  });

  it("keeps a payload's own liveness claim when it makes one", () => {
    const parsed = electionDataSchema.parse({ ...minimalPayload, sourceStatus: "live" });
    expect(parsed.sourceStatus).toBe("live");
  });

  it("marks the built-in sample payload as sample, not live", () => {
    // initElectionFeed() seeds this at app startup, before any operator action.
    expect(ELECTION_SAMPLE_JSON.sourceStatus).toBe("sample");
  });

  it("never lets a preset binding fall back to live", () => {
    const fallbacks = ELECTION_PRESETS.flatMap((p) => {
      const asset = p.create() as { bindings?: { source?: string; fallback?: unknown }[] };
      return (asset.bindings ?? [])
        .filter((b) => b.source === "election.sourceStatus")
        .map((b) => b.fallback);
    });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks).not.toContain("live");
  });
});

describe("data hub connection status", () => {
  afterEach(() => stopElectionSimulator());

  it("reports offline before any payload has been ingested", () => {
    // A fresh hub has never received data; it cannot honestly be "live".
    const conn = dataHub.getConnection("election");
    expect(conn).toBeDefined();
    expect(conn!.status).not.toBe("live");
  });

  it("marks a never-updated source offline on a stale tick", () => {
    dataHub.tickStaleCheck();
    const conn = dataHub.getConnection("election")!;
    expect(conn.lastUpdateAt).toBeNull();
    expect(conn.status).toBe("offline");
  });

  it("carries a payload's own status through ingest instead of forcing live", () => {
    dataHub.ingest("election", { ...ELECTION_SAMPLE_JSON, sourceStatus: "simulated" });
    expect(dataHub.getConnection("election")!.status).toBe("simulated");

    dataHub.ingest("election", { ...ELECTION_SAMPLE_JSON, sourceStatus: "live" }, 99);
    expect(dataHub.getConnection("election")!.status).toBe("live");
  });

  it("goes stale once updates stop, even for a simulated feed", () => {
    dataHub.ingest("election", { ...ELECTION_SAMPLE_JSON, sourceStatus: "simulated" }, 500);
    const conn = dataHub.getConnection("election")!;
    // Reach past the stale window without waiting 30s of wall clock.
    (conn as { lastUpdateAt: number }).lastUpdateAt = Date.now() - conn.staleAfterMs - 1;
    dataHub.tickStaleCheck();
    expect(dataHub.getConnection("election")!.status).toBe("stale");
  });
});

describe("election simulator", () => {
  beforeEach(() => stopElectionSimulator());
  afterEach(() => stopElectionSimulator());

  it("never publishes randomly generated results as live", () => {
    startElectionSimulator(10_000);
    // The very first publish happens synchronously inside start().
    const status = dataHub.getLastKnownGood("election")["election.sourceStatus"];
    expect(status).toBe("simulated");
    expect(dataHub.getConnection("election")!.status).not.toBe("live");
  });
});
