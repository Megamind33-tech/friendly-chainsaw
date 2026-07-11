import type { ElectionData } from "../validation/electionSchema";
import { ELECTION_SAMPLE_JSON } from "../validation/electionSchema";
import { syncElectionToDataStore } from "../election/electionFeed";

let intervalId: ReturnType<typeof setInterval> | null = null;
let sequence = 0;
let latest: ElectionData = structuredClone(ELECTION_SAMPLE_JSON);

function mutateElection(base: ElectionData): ElectionData {
  const candidates = base.candidates.map((c) => ({ ...c }));
  const delta = Math.floor(Math.random() * 5000) + 500;
  const idx = Math.floor(Math.random() * candidates.length);
  candidates[idx].votes += delta;
  const total = candidates.reduce((s, c) => s + c.votes, 0);
  candidates.forEach((c) => {
    c.percentage = Math.round((c.votes / total) * 1000) / 10;
  });
  candidates.sort((a, b) => b.votes - a.votes);
  candidates.forEach((c, i) => {
    c.rank = i + 1;
    c.leading = i === 0;
  });
  return {
    ...base,
    reportingPct: Math.min(100, Math.round((base.reportingPct + Math.random() * 2) * 10) / 10),
    lastUpdated: new Date().toISOString(),
    sourceStatus: "live",
    candidates,
  };
}

/** Simulated live election updates (interval-based — replaces WebSocket for dev). */
export function startElectionSimulator(intervalMs = 3000): void {
  stopElectionSimulator();
  latest = structuredClone(ELECTION_SAMPLE_JSON);
  syncElectionToDataStore(latest, ++sequence);
  intervalId = setInterval(() => {
    latest = mutateElection(latest);
    syncElectionToDataStore(latest, ++sequence);
  }, intervalMs);
}

export function stopElectionSimulator(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function isElectionSimulatorRunning(): boolean {
  return intervalId !== null;
}
