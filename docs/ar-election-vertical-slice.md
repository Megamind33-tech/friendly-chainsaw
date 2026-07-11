# Election Results AR — Vertical Slice Plan

**Date:** 2026-07-09  
**Goal:** One complete data-driven 3D candidate-results workflow through Preview → TAKE → Programme → OBS.

---

## Data Model

```typescript
interface ElectionCandidate {
  id: string;
  name: string;
  party: string;
  partyColor: string;      // hex
  photoUrl?: string;       // asset ref or URL
  logoUrl?: string;
  votes: number;
  percentage: number;      // 0-100
  rank: number;            // 1 = leading
  leading: boolean;
  declared: boolean;
}

interface ElectionData {
  title: string;
  constituency?: string;
  province?: string;
  reportingPct: number;    // 0-100
  lastUpdated: string;       // ISO
  sourceStatus: "live" | "stale" | "offline" | "invalid";
  candidates: ElectionCandidate[];
}
```

**Flat binding keys (normalised):**

```
election.title
election.reporting
election.sourceStatus
election.candidates.0.name
election.candidates.0.party
election.candidates.0.partyColor
election.candidates.0.votes
election.candidates.0.percentage
election.candidates.0.rank
election.candidates.0.leading
...
```

---

## Template: Candidate Results Tower

3D AR group per candidate (repeater-generated):

- Party colour panel (primitive box)
- Candidate name (`text3d`, bound)
- Party name (`text3d`, bound)
- Vote total (`text3d`, count-up animation)
- Percentage (`text3d`, hero pulse when leading)
- Result bar (box scale bound to percentage)
- Leader indicator (visibility bound to `leading`)

**Animations:**

| Event | Animation |
|-------|-----------|
| IN | Staggered structural wipe + pop (existing `arMotionEngine` presets) |
| Percentage change | `bar-grow` on bar node |
| Vote change | `count-up` on vote text |
| Rank / leader change | `pop` on affected tower; reorder by rank |
| OUT | Reverse structural wipe |

---

## Data Inputs (All Via Data Hub)

| Source | Adapter | Status |
|--------|---------|--------|
| Manual operator | `useDataStore` election feed | Implement |
| Local JSON file | `flattenJsonValues` + schema validate | Implement |
| CSV file | `parseCsvToValues` + map to election | Implement |
| Simulated WebSocket | `wsSimulator.ts` dev server | Implement |
| REST API | Existing HTTP poller + election schema | Extend |

---

## Broadcast Workflow (Acceptance)

1. Open Chase → AR or AR Asset Builder workspace
2. Load/create project with election scene
3. Insert "Election Candidate Towers" AR template
4. Connect data (manual / JSON / CSV / WebSocket sim)
5. Data Sources panel shows live values + validation status
6. Bindings resolve in editor (`applyTextBinding`)
7. Preview scene shows updated towers
8. Invalid value rejected — last-known-good held
9. Operator TAKE → Programme updates
10. OBS Browser Source shows same output
11. Save project → reopen → scene + bindings restored
12. Election feed values restored from `app_state` (target)

---

## Files (This Slice)

| File | Purpose |
|------|---------|
| `src/ar-system/dataHub/types.ts` | ChaseDataPacket |
| `src/ar-system/dataHub/dataHub.ts` | Ingest + LKG |
| `src/ar-system/validation/electionSchema.ts` | Zod validation |
| `src/ar-system/binding/transforms.ts` | Safe transforms |
| `src/ar-system/binding/bindingEngine.ts` | Resolve pipeline |
| `src/ar-system/election/repeater.ts` | Candidate array → nodes |
| `src/ar-system/election/candidateTower.ts` | Single tower factory |
| `src/ar-engine/templates.ts` | Register `election-candidate-towers` template |
| `src/document/dataSources.ts` | `election` feed |
| `scripts/verify-ar-election-slice.ts` | Automated tests |

---

## Out of Scope (This Slice)

- Native libobs module
- Map-based regional results
- Parliament semicircle
- ML photo cutout
- Full visual drag-drop binding UI
- Behaviour engine (use animation presets only)
