import type { ElectionData } from "../validation/electionSchema";

export type ElectionBehaviourEvent =
  | { type: "leader-change"; from: string; to: string; at: number }
  | { type: "rank-change"; candidate: string; fromRank: number; toRank: number; at: number }
  | { type: "source-stale"; at: number }
  | { type: "source-invalid"; errors: string[]; at: number };

interface RankSnapshot {
  name: string;
  rank: number;
}

let lastLeader: string | null = null;
let lastRanks: RankSnapshot[] = [];
const events: ElectionBehaviourEvent[] = [];
const listeners = new Set<() => void>();
const MAX_EVENTS = 50;
/** Stable snapshot for useSyncExternalStore — a fresh array per getSnapshot
 * call loops React 19 dev forever (the getSnapshot-caching rule). */
let eventsSnapshot: ElectionBehaviourEvent[] | null = null;

function notify(): void {
  eventsSnapshot = null;
  listeners.forEach((l) => l());
}

function pushEvent(event: ElectionBehaviourEvent): void {
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  notify();
}

/** Evaluate deterministic election behaviours after validated data sync. */
export function evaluateElectionBehaviours(data: ElectionData): ElectionBehaviourEvent[] {
  const fired: ElectionBehaviourEvent[] = [];
  const sorted = [...data.candidates].sort((a, b) => a.rank - b.rank);
  const leader = sorted.find((c) => c.leading ?? c.rank === 1);

  if (leader && lastLeader !== null && leader.name !== lastLeader) {
    const ev: ElectionBehaviourEvent = { type: "leader-change", from: lastLeader, to: leader.name, at: Date.now() };
    pushEvent(ev);
    fired.push(ev);
  }
  if (leader) lastLeader = leader.name;

  for (const c of sorted) {
    const prev = lastRanks.find((r) => r.name === c.name);
    if (prev && prev.rank !== c.rank) {
      const ev: ElectionBehaviourEvent = {
        type: "rank-change",
        candidate: c.name,
        fromRank: prev.rank,
        toRank: c.rank,
        at: Date.now(),
      };
      pushEvent(ev);
      fired.push(ev);
    }
  }
  lastRanks = sorted.map((c) => ({ name: c.name, rank: c.rank }));

  if (data.sourceStatus === "stale") {
    const ev: ElectionBehaviourEvent = { type: "source-stale", at: Date.now() };
    pushEvent(ev);
    fired.push(ev);
  }

  return fired;
}

export function recordElectionValidationFailure(errors: string[]): void {
  const ev: ElectionBehaviourEvent = { type: "source-invalid", errors, at: Date.now() };
  pushEvent(ev);
}

export function getElectionBehaviourEvents(): ElectionBehaviourEvent[] {
  if (!eventsSnapshot) eventsSnapshot = [...events];
  return eventsSnapshot;
}

export function subscribeElectionBehaviours(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetElectionBehaviourState(): void {
  lastLeader = null;
  lastRanks = [];
  events.length = 0;
  notify();
}
