import { useDataStore } from "@/document/dataSources";
import { electionToFlatValues, ELECTION_SAMPLE_JSON, electionFlatToFeedValues, parseElectionInput, type ElectionData } from "../validation/electionSchema";
import { dataHub, publishElectionData } from "../dataHub/dataHub";
import { evaluateElectionBehaviours, recordElectionValidationFailure } from "../behaviour/electionBehaviour";

/** Default flat election values for the data store. */
export function getElectionDefaults(): Record<string, string> {
  return electionFlatToFeedValues(electionToFlatValues(ELECTION_SAMPLE_JSON));
}

/** Initialise election feed in data store from sample data. */
export function initElectionFeed(): void {
  const flat = getElectionDefaults();
  useDataStore.setState({ election: { id: "election", name: "Election Results", values: flat } });
  publishElectionData(ELECTION_SAMPLE_JSON);
}

/** Push validated election data to Data Hub and sync to useDataStore. */
export function syncElectionToDataStore(data: ElectionData, sequence?: number): Record<string, string> {
  const flat = publishElectionData(data, sequence);
  if (Object.keys(flat).length > 0) {
    useDataStore.setState({ election: { id: "election", name: "Election Results", values: electionFlatToFeedValues(flat) } });
    evaluateElectionBehaviours(data);
  }
  return flat;
}

/** Apply flat election values from hub LKG to data store. */
export function syncHubToDataStore(): void {
  const lkg = dataHub.getLastKnownGood("election");
  if (Object.keys(lkg).length > 0) {
    useDataStore.setState({ election: { id: "election", name: "Election Results", values: electionFlatToFeedValues(lkg) } });
  }
}

/** Import a JSON file containing a full election payload (validated via Data Hub). */
export async function importElectionJsonFile(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const text = await file.text();
    const json = JSON.parse(text) as unknown;
    const parsed = parseElectionInput(json);
    if (!parsed.ok) {
      recordElectionValidationFailure(parsed.errors);
      return { ok: false, error: parsed.errors.join("; ") };
    }
    syncElectionToDataStore(parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Import flat key/value pairs (e.g. CSV rows) through validation. */
export function importElectionFlatValues(flat: Record<string, string>): { ok: true } | { ok: false; error: string } {
  const prefixed: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    prefixed[k.startsWith("election.") ? k : `election.${k}`] = v;
  }
  const parsed = parseElectionInput(prefixed);
  if (!parsed.ok) {
    recordElectionValidationFailure(parsed.errors);
    return { ok: false, error: parsed.errors.join("; ") };
  }
  syncElectionToDataStore(parsed.data);
  return { ok: true };
}
