import type { SetNode } from "@/document/types";
import { createGroupNode, vec3 } from "@/document/factory";
import { markSetNodesAsAr } from "@/ar-engine/nodeUtils";
import { createCandidateTower, type CandidateTowerOptions } from "./candidateTower";

export interface RepeaterOptions {
  /** Prefix for generated node names */
  namePrefix: string;
  /** Number of items to generate */
  count: number;
  /** Build options per index — reads from flat election.* keys */
  buildItem: (index: number) => CandidateTowerOptions;
  /** Horizontal spacing in world units */
  spacing?: number;
  /** Layout direction */
  layout?: "horizontal" | "vertical";
  /** Max items (truncate) */
  maxItems?: number;
}

/**
 * Generate AR SetNodes from an array count — used for election candidates,
 * sports lineups, weather locations, etc.
 */
export function buildRepeaterNodes(opts: RepeaterOptions): SetNode[] {
  const spacing = opts.spacing ?? 1.4;
  const layout = opts.layout ?? "horizontal";
  const max = opts.maxItems ?? opts.count;
  const count = Math.min(opts.count, max);

  const towers: SetNode[] = [];
  for (let i = 0; i < count; i++) {
    const itemOpts = opts.buildItem(i);
    const offset = (i - (count - 1) / 2) * spacing;
    const position =
      layout === "horizontal"
        ? vec3(offset, 0, 0)
        : vec3(0, -i * spacing * 0.6, 0);

    const tower = createCandidateTower({
      ...itemOpts,
      index: i,
      position,
    });
    towers.push(tower);
  }

  if (towers.length === 1) return markSetNodesAsAr(towers);
  return markSetNodesAsAr([
    createGroupNode(towers, { name: `${opts.namePrefix} (${count})` }),
  ]);
}

/** Build election candidate towers from flat election.* values. */
export function buildElectionCandidateTowers(
  candidateCount: number,
  getValue: (key: string) => string,
): SetNode[] {
  return buildRepeaterNodes({
    namePrefix: "Election Candidates",
    count: candidateCount,
    spacing: 1.5,
    layout: "horizontal",
    maxItems: 10,
    buildItem: (i) => ({
      index: i,
      name: getValue(`election.candidates.${i}.name`) || `Candidate ${i + 1}`,
      party: getValue(`election.candidates.${i}.party`) || "—",
      partyColor: getValue(`election.candidates.${i}.partyColor`) || "#3366cc",
      votes: getValue(`election.candidates.${i}.votes`) || "0",
      percentage: getValue(`election.candidates.${i}.percentage`) || "0",
      pct: getValue(`election.candidates.${i}.pct`) || "0%",
      leading: getValue(`election.candidates.${i}.leading`) === "true",
      rank: Number(getValue(`election.candidates.${i}.rank`) || i + 1),
    }),
  });
}
