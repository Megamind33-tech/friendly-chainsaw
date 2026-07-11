import type { ArAssetPreset } from "./election";
import { createArAssetLayer, createArBuilderAsset } from "../factory";

export const SPORTS_PRESETS: ArAssetPreset[] = [
  {
    id: "sports-team-logo",
    label: "Team Logo Holder",
    category: "sports",
    type: "extruded-logo",
    description: "Team logo with 3D card option",
    create: () => createArBuilderAsset("Team Logo", "sports", "extruded-logo", { width: 256, height: 256 }, {
      presetId: "sports-team-logo",
      bindings: [{ targetPath: "layers.logo.image", source: "sports.homeTeam.logoUrl", fallback: "" }],
    }),
  },
  {
    id: "sports-player-cutout",
    label: "Player Cutout",
    category: "sports",
    type: "player-profile",
    description: "Transparent player cutout for AR",
    create: () => createArBuilderAsset("Player Cutout", "sports", "player-profile", { width: 500, height: 900 }, {
      presetId: "sports-player-cutout",
      bindings: [
        { targetPath: "states.name", source: "sports.player.name", fallback: "—" },
        { targetPath: "states.number", source: "sports.player.number", fallback: "—" },
      ],
    }),
  },
  {
    id: "sports-player-card",
    label: "Player Profile Card",
    category: "sports",
    type: "player-profile",
    description: "Player stats profile card",
    create: () => createArBuilderAsset("Player Card", "sports", "player-profile", { width: 600, height: 400 }, {
      presetId: "sports-player-card",
      bindings: [
        { targetPath: "states.name", source: "sports.player.name", fallback: "—" },
        { targetPath: "states.position", source: "sports.player.position", fallback: "—" },
        { targetPath: "states.goals", source: "sports.player.goals", fallback: "0" },
      ],
    }),
  },
  {
    id: "sports-score-panel",
    label: "Score Panel",
    category: "sports",
    type: "scoreboard-element",
    description: "Match score display",
    create: () => createArBuilderAsset("Score Panel", "sports", "scoreboard-element", { width: 800, height: 120 }, {
      presetId: "sports-score-panel",
      bindings: [
        { targetPath: "states.homeScore", source: "sports.homeTeam.score", fallback: "0" },
        { targetPath: "states.awayScore", source: "sports.awayTeam.score", fallback: "0" },
        { targetPath: "states.clock", source: "sports.match.clock", fallback: "00:00" },
      ],
    }),
  },
  {
    id: "sports-match-clock",
    label: "Match Clock",
    category: "sports",
    type: "scoreboard-element",
    description: "Period/half clock indicator",
    create: () => createArBuilderAsset("Match Clock", "sports", "scoreboard-element", { width: 200, height: 80 }, {
      presetId: "sports-match-clock",
      bindings: [
        { targetPath: "states.clock", source: "sports.match.clock", fallback: "00:00" },
        { targetPath: "states.period", source: "sports.match.period", fallback: "1" },
      ],
    }),
  },
  {
    id: "sports-possession",
    label: "Possession Comparison",
    category: "sports",
    type: "stat-panel",
    description: "Team possession bar comparison",
    create: () => createArBuilderAsset("Possession", "sports", "stat-panel", { width: 600, height: 60 }, {
      presetId: "sports-possession",
      bindings: [
        { targetPath: "states.homePossession", source: "sports.stats.homePossession", format: "{value}%", fallback: "50%" },
        { targetPath: "states.awayPossession", source: "sports.stats.awayPossession", format: "{value}%", fallback: "50%" },
      ],
    }),
  },
  {
    id: "sports-goal-alert",
    label: "Goal Alert",
    category: "sports",
    type: "fullscreen-graphic",
    description: "Goal celebration alert graphic",
    create: () => createArBuilderAsset("Goal Alert", "sports", "fullscreen-graphic", { width: 1920, height: 400 }, {
      presetId: "sports-goal-alert",
      bindings: [
        { targetPath: "states.scorer", source: "sports.lastGoal.scorer", fallback: "—" },
        { targetPath: "states.minute", source: "sports.lastGoal.minute", fallback: "—" },
      ],
      animations: { entrance: { preset: "pop", duration: 0.6, delay: 0, easing: "back.out(1.7)", direction: "none", scaleFrom: 0.5 } },
    }),
  },
  {
    id: "sports-ar-field-marker",
    label: "AR Field Marker",
    category: "sports",
    type: "floating-ar",
    description: "Field position marker for AR overlay",
    create: () => createArBuilderAsset("Field Marker", "sports", "floating-ar", { width: 100, height: 100 }, { presetId: "sports-ar-field-marker" }),
  },
  {
    id: "sports-ar-formation",
    label: "AR Formation Board",
    category: "sports",
    type: "floating-ar",
    description: "Tactical formation board on virtual floor",
    create: () => createArBuilderAsset("Formation Board", "sports", "floating-ar", { width: 800, height: 600 }, {
      presetId: "sports-ar-formation",
      depthSettings: { mode: "layered25d", spacing: 0.05, parallaxStrength: 1, distributeEvenly: false },
      bindings: [{ targetPath: "states.formation", source: "sports.formation", fallback: "4-4-2" }],
    }),
  },
  {
    id: "sports-ar-floor-scoreboard",
    label: "AR Floor Scoreboard",
    category: "sports",
    type: "virtual-floor",
    description: "Floor-mounted scoreboard element",
    create: () => createArBuilderAsset("Floor Scoreboard", "sports", "virtual-floor", { width: 1000, height: 300 }, {
      presetId: "sports-ar-floor-scoreboard",
      bindings: [
        { targetPath: "states.homeScore", source: "sports.homeTeam.score", fallback: "0" },
        { targetPath: "states.awayScore", source: "sports.awayTeam.score", fallback: "0" },
      ],
    }),
  },
  {
    id: "sports-squad-formation",
    label: "Squad Formation",
    category: "sports",
    type: "player-profile",
    description: "Starting lineup formation layout",
    create: () => {
      const asset = createArBuilderAsset("Squad Formation", "sports", "player-profile", { width: 800, height: 600 }, { presetId: "sports-squad-formation" });
      const layers = Array.from({ length: 11 }, (_, i) =>
        createArAssetLayer(`Player ${i + 1}`, {
          transform: { x: 50 + (i % 4) * 180, y: 50 + Math.floor(i / 4) * 150, width: 120, height: 120, rotation: 0, zDepth: i * 0.02, pivotX: 0.5, pivotY: 0.5, opacity: 1 },
        }),
      );
      return { ...asset, layers };
    },
  },
];
