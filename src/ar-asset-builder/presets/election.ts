import type { ArAssetCategory, ArAssetType, ArBuilderAsset } from "../types";
import { createArAssetLayer, createArBuilderAsset } from "../factory";
import type { Binding } from "@/document/types";

export interface ArAssetPreset {
  id: string;
  label: string;
  category: ArAssetCategory;
  type: ArAssetType;
  description: string;
  create: () => ArBuilderAsset;
}

function barBindings(prefix: string): Binding[] {
  return [
    { targetPath: "layers.bar.name", source: `${prefix}.name`, fallback: "—" },
    { targetPath: "layers.bar.percentage", source: `${prefix}.percentage`, format: "{value}%", fallback: "0" },
    { targetPath: "layers.bar.votes", source: `${prefix}.votes`, format: "{value:,}", fallback: "0" },
  ];
}

const C0 = "election.candidates.0";
const C1 = "election.candidates.1";

export const ELECTION_PRESETS: ArAssetPreset[] = [
  {
    id: "election-candidate-cutout",
    label: "Candidate Portrait Cutout",
    category: "elections",
    type: "candidate-profile",
    description: "Transparent candidate portrait for AR placement",
    create: () => createArBuilderAsset("Candidate Portrait", "elections", "candidate-profile", { width: 600, height: 900 }, {
      presetId: "election-candidate-cutout",
      bindings: [
        { targetPath: "layers.portrait.image", source: `${C0}.photoUrl`, fallback: "" },
        { targetPath: "states.name", source: `${C0}.name`, fallback: "Candidate" },
        { targetPath: "states.party", source: `${C0}.party`, fallback: "" },
      ],
    }),
  },
  {
    id: "election-info-card",
    label: "Candidate Information Card",
    category: "elections",
    type: "candidate-profile",
    description: "Data-bound candidate info card structure",
    create: () => createArBuilderAsset("Candidate Info Card", "elections", "candidate-profile", { width: 800, height: 400 }, {
      presetId: "election-info-card",
      bindings: [
        { targetPath: "states.name", source: `${C0}.name`, fallback: "—" },
        { targetPath: "states.party", source: `${C0}.party`, fallback: "—" },
        { targetPath: "states.district", source: "election.constituency", fallback: "—" },
      ],
    }),
  },
  {
    id: "election-party-logo",
    label: "Party Logo Holder",
    category: "elections",
    type: "extruded-logo",
    description: "Logo slot with party color token binding",
    create: () => createArBuilderAsset("Party Logo", "elections", "extruded-logo", { width: 256, height: 256 }, {
      presetId: "election-party-logo",
      states: { partyColor: "#3366cc" },
      bindings: [{ targetPath: "states.partyColor", source: `${C0}.partyColor`, fallback: "#3366cc" }],
    }),
  },
  {
    id: "election-vote-bar",
    label: "Vote Percentage Bar",
    category: "elections",
    type: "election-result-bar",
    description: "Animated result bar with name, percentage, vote count",
    create: () => {
      const asset = createArBuilderAsset("Vote Bar", "elections", "election-result-bar", { width: 1200, height: 80 }, {
        presetId: "election-vote-bar",
        bindings: barBindings(C0),
        animations: { barGrow: { preset: "bar-grow", duration: 1.2, delay: 0, easing: "power2.out", direction: "right" } },
        states: { partyColor: "#3366cc" },
      });
      return { ...asset, layers: [createArAssetLayer("Bar Fill")] };
    },
  },
  {
    id: "election-vote-counter",
    label: "Vote Count Counter",
    category: "elections",
    type: "stat-panel",
    description: "Animated vote count display",
    create: () => createArBuilderAsset("Vote Counter", "elections", "stat-panel", { width: 400, height: 120 }, {
      presetId: "election-vote-counter",
      bindings: [{ targetPath: "states.count", source: `${C0}.votes`, format: "{value:,}", fallback: "0" }],
      animations: { countUp: { preset: "count-up", duration: 1.5, delay: 0, easing: "power1.out", direction: "none", countUp: true } },
    }),
  },
  {
    id: "election-results-map",
    label: "Results by Region Map",
    category: "elections",
    type: "map",
    description: "Regional results map with per-region bindings",
    create: () => createArBuilderAsset("Results Map", "elections", "map", { width: 1920, height: 1080 }, {
      presetId: "election-results-map",
      depthSettings: { mode: "layered25d", spacing: 0.04, parallaxStrength: 1, distributeEvenly: false },
      bindings: [{ targetPath: "states.leadingRegion", source: "election.province", fallback: "" }],
    }),
  },
  {
    id: "election-seat-projection",
    label: "Seat Projection Block",
    category: "elections",
    type: "seat-projection",
    description: "Parliament seat projection display",
    create: () => createArBuilderAsset("Seat Projection", "elections", "seat-projection", { width: 1000, height: 600 }, {
      presetId: "election-seat-projection",
      bindings: [
        { targetPath: "states.seats", source: "election.candidateCount", fallback: "0" },
        { targetPath: "states.majority", source: "election.reportingPct", fallback: "0" },
      ],
    }),
  },
  {
    id: "election-parliament-arc",
    label: "Parliament Semicircle",
    category: "elections",
    type: "chart",
    description: "Semicircle seat distribution chart",
    create: () => createArBuilderAsset("Parliament Arc", "elections", "chart", { width: 800, height: 500 }, { presetId: "election-parliament-arc" }),
  },
  {
    id: "election-turnout-gauge",
    label: "Turnout Gauge",
    category: "elections",
    type: "stat-panel",
    description: "Turnout percentage gauge",
    create: () => createArBuilderAsset("Turnout Gauge", "elections", "stat-panel", { width: 300, height: 300 }, {
      presetId: "election-turnout-gauge",
      bindings: [{ targetPath: "states.turnout", source: "election.reportingPct", format: "{value}%", fallback: "0%" }],
    }),
  },
  {
    id: "election-lower-third",
    label: "Election Lower Third",
    category: "elections",
    type: "lower-third",
    description: "Breaking results lower third",
    create: () => createArBuilderAsset("Election L3", "elections", "lower-third", { width: 1200, height: 150 }, {
      presetId: "election-lower-third",
      bindings: [
        { targetPath: "states.headline", source: "election.title", fallback: "ELECTION RESULTS" },
        { targetPath: "states.subline", source: "election.reporting", fallback: "" },
      ],
    }),
  },
  {
    id: "election-breaking-alert",
    label: "Breaking Result Alert",
    category: "elections",
    type: "fullscreen-graphic",
    description: "Full-screen breaking result alert",
    create: () => createArBuilderAsset("Breaking Alert", "elections", "fullscreen-graphic", { width: 1920, height: 1080 }, {
      presetId: "election-breaking-alert",
      bindings: [{ targetPath: "states.alert", source: "election.sourceStatus", fallback: "live" }],
    }),
  },
  {
    id: "election-side-by-side",
    label: "Candidate Comparison",
    category: "elections",
    type: "candidate-profile",
    description: "Side-by-side candidate comparison",
    create: () => createArBuilderAsset("Candidate Compare", "elections", "candidate-profile", { width: 1600, height: 600 }, {
      presetId: "election-side-by-side",
      bindings: [
        { targetPath: "states.candidate1", source: `${C0}.name`, fallback: "—" },
        { targetPath: "states.candidate2", source: `${C1}.name`, fallback: "—" },
      ],
    }),
  },
  {
    id: "election-ar-floor-chart",
    label: "AR Floor Chart",
    category: "elections",
    type: "virtual-floor",
    description: "Standing bar chart on virtual floor",
    create: () => createArBuilderAsset("Floor Chart", "elections", "virtual-floor", { width: 1200, height: 800 }, {
      presetId: "election-ar-floor-chart",
      depthSettings: { mode: "layered25d", spacing: 0.1, parallaxStrength: 1.5, distributeEvenly: true },
    }),
  },
];
