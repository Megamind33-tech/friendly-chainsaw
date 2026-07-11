import { createPrimitiveNode, vec3 } from "@/document/factory";
import type { GroupNode, MaterialProps, SetNode } from "@/document/types";
import { markSetNodeAsAr } from "../nodeUtils";
import { buildSportsPanelNodes, findChildGroup, rebuildSportsPanelNodes, type SportsPanelSpec } from "./panelBuilder";
import { COLOUR_GROUP_BY_PART, COLOUR_GROUPS, ZONE_LAYOUTS, clampParams, type SportsPanelParams } from "./panelKit";
import { SPORTS_PANEL_SPECS } from "./specs";

/**
 * Sports Graphics — the `AR > 3D Models > Sports Graphics` library registry.
 * Ten independent, parametric, data-ready AR panel models; each entry is a
 * separate selectable, insertable, saveable asset. The JSON manifests under
 * `public/assets/ar/sports/manifests/` are GENERATED from this registry
 * (scripts/generate-sports-ar-assets.ts), so code and manifest can't drift.
 */

export const SPORTS_AR_LIBRARY = {
  libraryId: "sports_ar_models",
  displayName: "Sports AR 3D Models",
  category: "AR 3D Models",
  subcategory: "Sports Graphics",
  manifestVersion: "1.0.0",
} as const;

export interface SportsArModel {
  id: string;
  name: string;
  version: string;
  description: string;
  spec: SportsPanelSpec;
  /** Builds a fresh, EMPTY, neutral instance at reference geometry. */
  build: (params?: Partial<SportsPanelParams>) => GroupNode;
}

export const SPORTS_AR_MODELS: SportsArModel[] = SPORTS_PANEL_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  version: spec.version,
  description: spec.description,
  spec,
  build: (params) => markSetNodeAsAr(buildSportsPanelNodes(spec, params)) as GroupNode,
}));

export function getSportsArModel(modelId: string): SportsArModel | undefined {
  return SPORTS_AR_MODELS.find((m) => m.id === modelId);
}

/** Rebuild a placed instance with new params (content preserved). */
export function rebuildSportsArModel(existing: GroupNode, params: Partial<SportsPanelParams>): GroupNode | undefined {
  const model = existing.arModel ? getSportsArModel(existing.arModel.modelId) : undefined;
  if (!model) return undefined;
  const merged = clampParams({ ...model.spec.defaults, ...(existing.arModel!.params as Partial<SportsPanelParams>), ...params });
  return markSetNodeAsAr(rebuildSportsPanelNodes(model.spec, existing, merged)) as GroupNode;
}

/** "Reset Geometry to Reference" — rebuilds at the spec's exact defaults. */
export function resetSportsArModelGeometry(existing: GroupNode): GroupNode | undefined {
  const model = existing.arModel ? getSportsArModel(existing.arModel.modelId) : undefined;
  if (!model) return undefined;
  return markSetNodeAsAr(rebuildSportsPanelNodes(model.spec, existing, model.spec.defaults)) as GroupNode;
}

// ---------------------------------------------------------------------------
// Colour groups — "apply to frame group / base group / all emissive strips".
// ---------------------------------------------------------------------------

export type ColourGroup = (typeof COLOUR_GROUPS)[number];
export { COLOUR_GROUPS };

/** Which colour group a node belongs to, by its (or its parent group's)
 * canonical part name. Leaf segments inside SIDE_DEPTH_LEFT / STRIP_TOP etc.
 * inherit their group's assignment. */
export function colourGroupForNode(node: SetNode, parentName?: string): ColourGroup | undefined {
  const own = COLOUR_GROUP_BY_PART[node.name];
  if (own) return own as ColourGroup;
  const inherited = parentName ? COLOUR_GROUP_BY_PART[parentName] : undefined;
  return inherited as ColourGroup | undefined;
}

/** Collect every primitive in a model belonging to a colour group. */
export function nodesInColourGroup(root: GroupNode, group: ColourGroup): SetNode[] {
  const out: SetNode[] = [];
  const walk = (list: SetNode[], parentName?: string) => {
    for (const node of list) {
      if (node.kind === "primitive" && colourGroupForNode(node, parentName) === group) out.push(node);
      if (node.kind === "group") walk(node.children, node.name);
    }
  };
  walk(root.children);
  return out;
}

/** Material patch for recolouring a group — emissive parts keep glowing in
 * the new colour, structural parts just recolour. */
export function colourPatchFor(group: ColourGroup, colour: string, material: MaterialProps): Partial<MaterialProps> {
  if (group === "emissive") return { color: colour, emissive: colour };
  if (material.emissiveIntensity && material.emissiveIntensity > 0.2) return { color: colour, emissive: colour };
  return { color: colour };
}

// ---------------------------------------------------------------------------
// Optional sport props — removable modules, DISABLED (absent) by default.
// ---------------------------------------------------------------------------

export interface SportPropModule {
  id: string;
  label: string;
  build: () => SetNode;
}

export const OPTIONAL_SPORT_PROPS: SportPropModule[] = [
  {
    id: "prop_ball_generic",
    label: "Generic Ball",
    build: () =>
      markSetNodeAsAr(
        createPrimitiveNode("sphere", {
          name: "Generic ball (optional prop)",
          material: { color: "#e8eaee", metalness: 0.1, roughness: 0.5 },
          transform: { position: vec3(0.0, 0.11, 0.35), scale: vec3(0.22, 0.22, 0.22) },
        }),
      ),
  },
  {
    id: "prop_puck_disc",
    label: "Disc / Puck",
    build: () =>
      markSetNodeAsAr(
        createPrimitiveNode("cylinder", {
          name: "Disc prop (optional prop)",
          material: { color: "#2a2e34", metalness: 0.3, roughness: 0.5 },
          transform: { position: vec3(0.3, 0.03, 0.35), scale: vec3(0.16, 0.05, 0.16) },
        }),
      ),
  },
  {
    id: "prop_plinth_puck",
    label: "Mini Pedestal",
    build: () =>
      markSetNodeAsAr(
        createPrimitiveNode("cylinder", {
          name: "Mini pedestal (optional prop)",
          material: { color: "#23272e", metalness: 0.6, roughness: 0.38 },
          transform: { position: vec3(-0.3, 0.06, 0.35), scale: vec3(0.24, 0.12, 0.24) },
        }),
      ),
  },
];

/** Attach an optional prop module inside the model's OPTIONAL_SPORT_PROPS
 * group (returns a new root; props never bake into the base model). */
export function withSportProp(root: GroupNode, propId: string): GroupNode {
  const prop = OPTIONAL_SPORT_PROPS.find((p) => p.id === propId);
  if (!prop) return root;
  const clone = JSON.parse(JSON.stringify(root)) as GroupNode;
  const target = findChildGroup(clone, "OPTIONAL_SPORT_PROPS");
  if (target) target.children = [...target.children, prop.build()];
  return clone;
}

// ---------------------------------------------------------------------------
// Manifest generation — single source of truth for the JSON manifests.
// ---------------------------------------------------------------------------

const ANIMATION_PRESETS = {
  entrance: [
    "fadeIn",
    "slideUp",
    "slideLeft",
    "slideRight",
    "scaleIn",
    "rotateIn",
    "riseFromFloor",
    "frameAssemble",
    "baseFirst",
    "panelReveal",
    "lightSweepReveal",
  ],
  emphasis: ["scoreFlash", "goalPulse", "cardAlert", "statHighlight", "softGlow", "teamColourSweep", "dataUpdatePulse", "playerFocus"],
  exit: ["fadeOut", "slideDown", "slideLeft", "slideRight", "scaleOut", "frameDisassemble", "lowerIntoFloor", "lightFade"],
} as const;

const PLACEMENT_MODES = [
  "worldLocked",
  "floorAnchored",
  "cameraFacing",
  "presenterAnchored",
  "playerAnchored",
  "screenSpace",
  "free3D",
  "surfaceSnap",
  "groundSnap",
] as const;

const SUPPORTED_SPORTS = ["football", "basketball", "rugby", "cricket", "tennis", "hockey", "baseball", "volleyball", "generic"] as const;

const DATA_BINDING_KEYS = [
  "match.id",
  "match.sport",
  "match.competition",
  "match.round",
  "match.venue",
  "match.status",
  "match.clock",
  "match.period",
  "home.id",
  "home.name",
  "home.shortName",
  "home.logo",
  "home.score",
  "home.colourPrimary",
  "home.colourSecondary",
  "away.id",
  "away.name",
  "away.shortName",
  "away.logo",
  "away.score",
  "away.colourPrimary",
  "away.colourSecondary",
] as const;

const MATERIAL_SLOTS = [
  "CONTENT_SURFACE",
  "INNER_FRAME",
  "OUTER_FRAME_FRONT",
  "OUTER_FRAME_REAR",
  "SIDE_DEPTH_LEFT",
  "SIDE_DEPTH_RIGHT",
  "TOP_TRIM",
  "BOTTOM_TRIM",
  "BASE_TOP",
  "BASE_MIDDLE",
  "BASE_BOTTOM",
] as const;

/** Build one model's manifest object (JSON-serialisable). */
export function buildModelManifest(model: SportsArModel): Record<string, unknown> {
  const d = model.spec.defaults;
  const geometry: Record<string, unknown> = {};
  const geometryDefaults: [string, number, number, number, string][] = [
    ["width", d.width, 0.5, 8.0, "m"],
    ["height", d.height, 0.3, 5.0, "m"],
    ["depth", d.depth, 0.05, 1.0, "m"],
    ["frameThickness", d.frameThickness, 0.02, 0.4, "m"],
    ["frameDepth", d.frameDepth, 0.02, 0.4, "m"],
    ["baseWidth", d.baseWidth, 0.2, 9.0, "m"],
    ["baseDepth", d.baseDepth, 0.1, 3.0, "m"],
    ["baseHeight", d.baseHeight, 0.02, 1.5, "m"],
    ["cornerBevel", d.cornerBevel, 0, 0.6, "m"],
    ["leftAngle", d.leftAngle, 0, 60, "deg"],
    ["rightAngle", d.rightAngle, 0, 60, "deg"],
    ["topAngle", d.topAngle, 0, 60, "deg"],
    ["bottomAngle", d.bottomAngle, 0, 60, "deg"],
    ["contentInset", d.contentInset, 0, 0.3, "m"],
    ["stripWidth", d.stripWidth, 0.005, 0.12, "m"],
    ["stripDepth", d.stripDepth, 0.005, 0.12, "m"],
    ["tilt", d.tilt, -30, 30, "deg"],
  ];
  for (const [key, def, min, max, unit] of geometryDefaults) {
    geometry[key] = { default: def, min, max, unit };
  }
  return {
    manifestVersion: SPORTS_AR_LIBRARY.manifestVersion,
    id: model.id,
    name: model.name,
    version: model.version,
    description: model.description,
    category: SPORTS_AR_LIBRARY.category,
    subcategory: SPORTS_AR_LIBRARY.subcategory,
    model: {
      format: "glb",
      path: `models/${model.id}.glb`,
      units: "metres",
      upAxis: "Y",
      pivot: "base-centre",
    },
    thumbnail: { path: `thumbnails/${model.id}.png` },
    capabilities: {
      editableGeometry: true,
      editableMaterials: true,
      editableColours: true,
      dataDriven: true,
      animated: true,
      cameraFacing: true,
      worldLocked: true,
      presenterAnchored: true,
      floorAnchored: true,
    },
    geometry,
    materialSlots: MATERIAL_SLOTS,
    colourGroups: COLOUR_GROUPS,
    contentZones: ZONE_LAYOUTS[model.spec.layout].map((z) => ({
      id: z.id,
      node: z.node,
      type: z.type === "time" ? "time" : z.type === "number" ? "number" : z.type,
      required: false,
    })),
    dataBindings: Object.fromEntries(DATA_BINDING_KEYS.map((k) => [k, null])),
    supportedSports: SUPPORTED_SPORTS,
    animations: ANIMATION_PRESETS,
    placementModes: PLACEMENT_MODES,
    performance: { defaultTier: "standard", tiers: ["low", "standard", "high"] },
    updateBehaviour: {
      default: "smoothTransition",
      options: ["immediate", "smoothTransition", "numberRoll", "fadeReplace", "slideReplace", "scoreFlash", "goalAnimation", "statPulse", "none"],
      repeatSuppression: true,
    },
    validation: {
      score: { type: "integer", min: 0 },
      clock: { pattern: "^\\d{1,3}:\\d{2}$" },
      colours: { type: "hex" },
      images: { type: "url" },
      onInvalid: "fallback",
    },
    fallbacks: { text: "", number: 0, image: "", colour: "#FFFFFF" },
  };
}

/** Build the library manifest listing all 10 models. */
export function buildLibraryManifest(): Record<string, unknown> {
  return {
    manifestVersion: SPORTS_AR_LIBRARY.manifestVersion,
    libraryId: SPORTS_AR_LIBRARY.libraryId,
    displayName: SPORTS_AR_LIBRARY.displayName,
    category: SPORTS_AR_LIBRARY.category,
    subcategory: SPORTS_AR_LIBRARY.subcategory,
    defaultCoordinateSystem: "Y_UP",
    defaultUnits: "metres",
    models: SPORTS_AR_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      version: m.version,
      modelPath: `models/${m.id}.glb`,
      manifestPath: `manifests/${m.id}.manifest.json`,
      thumbnailPath: `thumbnails/${m.id}.png`,
      enabled: true,
    })),
  };
}

export type { SportsPanelParams } from "./panelKit";
export { PARAM_RANGES, NEUTRAL_MATERIAL_PRESETS, ZONE_LAYOUTS } from "./panelKit";
export { findModelRoot, findAllModelRoots, findChildGroup } from "./panelBuilder";
