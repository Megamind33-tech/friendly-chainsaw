import { z } from "zod";

export const electionCandidateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  party: z.string().min(1),
  partyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#3366cc"),
  photoUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  votes: z.number().min(0),
  percentage: z.number().min(0).max(100),
  rank: z.number().int().min(1),
  leading: z.boolean().optional(),
  declared: z.boolean().optional().default(false),
});

export const electionDataSchema = z.object({
  title: z.string().min(1),
  constituency: z.string().optional(),
  province: z.string().optional(),
  reportingPct: z.number().min(0).max(100),
  lastUpdated: z.string().optional(),
  sourceStatus: z.enum(["live", "stale", "offline", "invalid"]).optional().default("live"),
  candidates: z.array(electionCandidateSchema).min(1).max(20),
});

export type ElectionData = z.infer<typeof electionDataSchema>;
export type ElectionCandidate = z.infer<typeof electionCandidateSchema>;

/** Flatten validated election data into binding keys under `election.*`. */
export function electionToFlatValues(data: ElectionData): Record<string, string> {
  const out: Record<string, string> = {
    "election.title": data.title,
    "election.reporting": `${Math.round(data.reportingPct)}%`,
    "election.reportingPct": String(data.reportingPct),
    "election.sourceStatus": data.sourceStatus ?? "live",
    "election.lastUpdated": data.lastUpdated ?? new Date().toISOString(),
  };
  if (data.constituency) out["election.constituency"] = data.constituency;
  if (data.province) out["election.province"] = data.province;

  const sorted = [...data.candidates].sort((a, b) => a.rank - b.rank);
  sorted.forEach((c, i) => {
    const p = `election.candidates.${i}`;
    out[`${p}.name`] = c.name;
    out[`${p}.party`] = c.party;
    out[`${p}.partyColor`] = c.partyColor ?? "#3366cc";
    out[`${p}.votes`] = String(c.votes);
    out[`${p}.percentage`] = String(c.percentage);
    out[`${p}.pct`] = `${c.percentage.toFixed(1)}%`;
    out[`${p}.rank`] = String(c.rank);
    out[`${p}.leading`] = c.leading ?? c.rank === 1 ? "true" : "false";
    out[`${p}.declared`] = c.declared ? "true" : "false";
    if (c.photoUrl) out[`${p}.photoUrl`] = c.photoUrl;
    if (c.logoUrl) out[`${p}.logoUrl`] = c.logoUrl;
  });
  out["election.candidateCount"] = String(sorted.length);
  return out;
}

/** Parse loose JSON/flattened input into election schema. */
export function parseElectionInput(input: unknown): { ok: true; data: ElectionData } | { ok: false; errors: string[] } {
  if (input && typeof input === "object" && "candidates" in (input as object)) {
    const result = electionDataSchema.safeParse(input);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  // Reconstruct from flat keys if given a Record
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const flat = input as Record<string, string>;
    const candidates: ElectionCandidate[] = [];
    for (let i = 0; i < 20; i++) {
      const name = flat[`election.candidates.${i}.name`] ?? flat[`candidates.${i}.name`];
      if (!name) break;
      candidates.push({
        name,
        party: flat[`election.candidates.${i}.party`] ?? flat[`candidates.${i}.party`] ?? "—",
        partyColor: flat[`election.candidates.${i}.partyColor`] ?? "#3366cc",
        votes: Number(flat[`election.candidates.${i}.votes`] ?? 0),
        percentage: Number(flat[`election.candidates.${i}.percentage`] ?? 0),
        rank: Number(flat[`election.candidates.${i}.rank`] ?? i + 1),
        leading: flat[`election.candidates.${i}.leading`] === "true",
        declared: flat[`election.candidates.${i}.declared`] === "true",
      });
    }
    if (candidates.length > 0) {
      const attempt = electionDataSchema.safeParse({
        title: flat["election.title"] ?? "ELECTION RESULTS",
        reportingPct: Number(flat["election.reportingPct"] ?? flat["election.reporting"]?.replace("%", "") ?? 0),
        candidates,
      });
      if (attempt.success) return { ok: true, data: attempt.data };
      return { ok: false, errors: attempt.error.issues.map((i) => i.message) };
    }
  }

  return { ok: false, errors: ["No valid election data structure found"] };
}

/** Strip `election.` prefix for storage in feed values (buildDataValues adds it back). */
export function electionFlatToFeedValues(flat: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    out[k.startsWith("election.") ? k.slice("election.".length) : k] = v;
  }
  return out;
}

export function feedValuesToElectionFlat(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    out[`election.${k}`] = v;
  }
  return out;
}

export const ELECTION_SAMPLE_JSON: ElectionData = {
  title: "PRESIDENTIAL ELECTION 2026",
  constituency: "National",
  reportingPct: 67,
  lastUpdated: new Date().toISOString(),
  sourceStatus: "live",
  candidates: [
    { name: "Candidate Alpha", party: "Party A", partyColor: "#1a4fa0", votes: 1245000, percentage: 52.3, rank: 1, leading: true, declared: false },
    { name: "Candidate Beta", party: "Party B", partyColor: "#c41e3a", votes: 1089000, percentage: 45.8, rank: 2, leading: false, declared: false },
    { name: "Candidate Gamma", party: "Party C", partyColor: "#2d8a4e", votes: 45200, percentage: 1.9, rank: 3, leading: false, declared: false },
  ],
};
