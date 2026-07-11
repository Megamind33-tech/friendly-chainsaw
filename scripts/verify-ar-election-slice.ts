/**
 * Verification script for AR election vertical slice.
 * Run: bun run scripts/verify-ar-election-slice.ts
 */
import {
  electionDataSchema,
  electionToFlatValues,
  parseElectionInput,
  ELECTION_SAMPLE_JSON,
  electionFlatToFeedValues,
} from "../src/ar-system/validation/electionSchema";
import { dataHub, publishElectionData } from "../src/ar-system/dataHub/dataHub";
import { resolveBinding } from "../src/ar-system/binding/bindingEngine";
import { buildElectionCandidateTowers } from "../src/ar-system/election/repeater";
import { applyLegacyFormat } from "../src/ar-system/binding/transforms";
import { createText3dNode } from "../src/document/factory";
import { getBindableTargetPaths } from "../src/ar-system/propertyRegistry";
import { evaluateElectionBehaviours, resetElectionBehaviourState } from "../src/ar-system/behaviour/electionBehaviour";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== AR Election Vertical Slice Verification ===\n");

// Schema
console.log("Schema:");
const sampleResult = electionDataSchema.safeParse(ELECTION_SAMPLE_JSON);
assert(sampleResult.success, "ELECTION_SAMPLE_JSON passes schema");

const flat = electionToFlatValues(ELECTION_SAMPLE_JSON);
assert(flat["election.candidates.0.name"] === "Candidate Alpha", "Flat values include candidate name");
assert(flat["election.candidateCount"] === "3", "Flat values include candidate count");

const feedValues = electionFlatToFeedValues(flat);
assert(feedValues["candidates.0.name"] === "Candidate Alpha", "Feed values strip election. prefix");

const badInput = { ...ELECTION_SAMPLE_JSON, candidates: [{ name: "", party: "X", votes: -1, percentage: 150, rank: 0 }] };
const badParsed = parseElectionInput(badInput);
assert(!badParsed.ok, "Invalid election input rejected");

// Data Hub
console.log("\nData Hub:");
publishElectionData(ELECTION_SAMPLE_JSON, 1);
const lkg1 = dataHub.getLastKnownGood("election");
assert(lkg1["election.candidates.0.name"] === "Candidate Alpha", "Hub stores LKG after valid ingest");

const lkgBefore = { ...dataHub.getLastKnownGood("election") };
const rejected = dataHub.ingest("election", badInput, 2);
assert(rejected !== null && rejected["election.candidates.0.name"] === lkgBefore["election.candidates.0.name"], "Invalid ingest keeps LKG");

const seqReject = dataHub.ingest("election", ELECTION_SAMPLE_JSON, 1);
assert(seqReject !== null && seqReject["election.candidates.0.name"] === lkgBefore["election.candidates.0.name"], "Out-of-order sequence rejected");

publishElectionData(ELECTION_SAMPLE_JSON, 3);
assert(dataHub.getConnection("election")?.status === "live", "Valid ingest sets live status");

// Binding engine
console.log("\nBindings:");
const binding = { targetPath: "text", source: "election.candidates.0.votes", fallback: "0", format: "{value:,}" };
const resolved = resolveBinding(binding, { values: flat });
assert(resolved.value === "1,245,000", "Number format binding resolves");

const missing = resolveBinding(
  { targetPath: "text", source: "election.missing", fallback: "N/A" },
  { values: flat },
);
assert(missing.usedFallback && missing.value === "N/A", "Missing source uses fallback");

assert(applyLegacyFormat("1234567", "{value:,}") === "1,234,567", "Legacy format helper works");

// Repeater
console.log("\nRepeater:");
const towers = buildElectionCandidateTowers(3, (key) => flat[key] ?? "");
assert(towers.length === 1, "Repeater wraps multiple towers in a group");
const group = towers[0];
assert(group.kind === "group", "Repeater root is a group");
assert((group.children?.length ?? 0) === 3, "Repeater generates 3 candidate towers");

// Parse flat keys back
console.log("\nFlat parse:");
const flatOnly: Record<string, string> = {};
for (const [k, v] of Object.entries(flat)) flatOnly[k] = v;
const fromFlat = parseElectionInput(flatOnly);
assert(fromFlat.ok, "Reconstruct election from flat keys");

console.log("\nProperty registry:");
const textNode = createText3dNode({ name: "T", text: "Hi", fontSize: 0.1, color: "#fff" });
assert(getBindableTargetPaths(textNode).includes("text"), "Text3d node exposes text binding path");

console.log("\nBehaviours:");
resetElectionBehaviourState();
evaluateElectionBehaviours(ELECTION_SAMPLE_JSON);
const swapped = structuredClone(ELECTION_SAMPLE_JSON);
swapped.candidates = [...swapped.candidates].reverse().map((c, i) => ({ ...c, rank: i + 1, leading: i === 0 }));
const events = evaluateElectionBehaviours(swapped);
assert(events.some((e) => e.type === "leader-change"), "Leader change detected on rank swap");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
