import { z } from "zod";

const bindingSchema = z.object({
  targetPath: z.string(),
  source: z.string(),
  format: z.string().optional(),
  fallback: z.unknown().optional(),
});

const smartAssetValueTypeSchema = z.enum(["string", "number", "boolean", "color", "image"]);

const smartAssetPropertySchema = z.object({
  id: z.string(),
  label: z.string(),
  targetPath: z.string(),
  type: smartAssetValueTypeSchema,
  bindable: z.boolean(),
  animatable: z.boolean(),
  defaultValue: z.unknown().optional(),
});

const smartAssetExposedNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["layer", "slot", "state"]),
  visible: z.boolean(),
  locked: z.boolean(),
  properties: z.array(smartAssetPropertySchema),
});

const smartAssetBindingSlotSchema = z.object({
  id: z.string(),
  label: z.string(),
  targetPath: z.string(),
  source: z.string(),
  valueType: smartAssetValueTypeSchema,
  required: z.boolean(),
  updateMode: z.literal("instant"),
  format: z.string().optional(),
  fallback: z.unknown().optional(),
});

const jsonSchemaNodeSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const smartAssetDataSchema = z.object({
  $schema: z.literal("http://json-schema.org/draft-07/schema#"),
  $id: z.literal("schema.json"),
  title: z.string(),
  description: z.string(),
  type: z.literal("object"),
  properties: z.record(z.string(), jsonSchemaNodeSchema),
  required: z.array(z.string()),
  additionalProperties: z.literal(true),
  "x-chase": z.object({
    kind: z.literal("smart-asset-data"),
    assetId: z.string(),
    assetName: z.string(),
    bindingSources: z.array(z.string()),
  }),
});

const arAnimationSchema = z.object({
  preset: z.enum([
    "none", "fade", "slide", "scale", "pop", "wipe", "rotate", "fly",
    "count-up", "bar-grow", "ticker-crawl", "loop-pulse",
  ]),
  duration: z.number(),
  delay: z.number(),
  easing: z.string(),
  direction: z.enum(["left", "right", "top", "bottom", "front", "back", "none"]),
  fade: z.boolean().optional(),
  scaleFrom: z.number().optional(),
  distance: z.number().optional(),
  outDelay: z.number().optional(),
  outDuration: z.number().optional(),
  outEasing: z.string().optional(),
  countUp: z.boolean().optional(),
  loopPeriod: z.number().optional(),
  loopScale: z.number().optional(),
});

const arAssetTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  zDepth: z.number(),
  pivotX: z.number(),
  pivotY: z.number(),
  opacity: z.number(),
});

const arAssetMaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["standard", "pbr", "card-front", "card-side", "card-back"]),
  color: z.string(),
  metalness: z.number(),
  roughness: z.number(),
  reflectivity: z.number(),
  emissive: z.string().optional(),
  opacity: z.number().optional(),
});

const arAssetLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: arAssetTransformSchema,
  imageAssetId: z.string().optional(),
  maskAssetId: z.string().optional(),
  segmentationConfidence: z.number().optional(),
  material: arAssetMaterialSchema.optional(),
  shadowCast: z.boolean().optional(),
  shadowReceive: z.boolean().optional(),
  billboard: z.boolean().optional(),
  faceCamera: z.boolean().optional(),
  parallaxStrength: z.number().optional(),
});

const arAnchorSettingsSchema = z.object({
  anchorType: z.enum(["ground", "screen", "camera", "virtual-set", "tracked", "manual"]),
  worldPosition: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  worldRotation: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  worldScale: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  lockToHorizon: z.boolean(),
  faceCamera: z.boolean(),
  safeAreaConstraint: z.boolean(),
  depthTest: z.boolean(),
  occlusion: z.boolean(),
  renderOrder: z.number(),
});

export const arBuilderAssetSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  name: z.string(),
  category: z.enum([
    "elections", "sports", "weather", "news", "maps", "charts",
    "profiles", "logos", "lower-thirds", "fullscreen", "custom",
  ]),
  type: z.enum([
    "transparent-cutout", "layered-25d", "3d-card", "extruded-logo", "map", "chart",
    "stat-panel", "candidate-profile", "player-profile", "weather-symbol",
    "weather-map-marker", "election-result-bar", "seat-projection", "scoreboard-element",
    "lower-third", "fullscreen-graphic", "virtual-floor", "floating-ar", "screen-insert", "custom",
  ]),
  lifecycle: z.enum(["edit", "preview", "ready", "live"]),
  dimensions: z.object({ width: z.number(), height: z.number() }),
  sourceFiles: z.array(z.object({
    assetId: z.string(),
    role: z.enum(["original", "working", "mask", "depthMap", "thumbnail"]),
  })),
  layers: z.array(arAssetLayerSchema),
  materials: z.array(arAssetMaterialSchema),
  animations: z.record(z.string(), arAnimationSchema),
  bindings: z.array(bindingSchema),
  anchors: arAnchorSettingsSchema,
  states: z.record(z.string(), z.unknown()),
  thumbnailAssetId: z.string().optional(),
  favorite: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  depthSettings: z.object({
    mode: z.enum(["flat", "layered25d", "card3d", "extruded", "displacement"]),
    spacing: z.number(),
    parallaxStrength: z.number(),
    distributeEvenly: z.boolean(),
  }).optional(),
  extrusionSettings: z.object({
    depth: z.number(),
    bevel: z.number(),
    bevelThickness: z.number(),
    frontMaterialId: z.string().optional(),
    sideMaterialId: z.string().optional(),
    backMaterialId: z.string().optional(),
  }).optional(),
  card3dSettings: z.object({
    thickness: z.number(),
    cornerRadius: z.number(),
    borderWidth: z.number(),
    borderColor: z.string(),
    reflection: z.number(),
    shadowEnabled: z.boolean(),
  }).optional(),
  displacementSettings: z.object({
    depthMapAssetId: z.string().optional(),
    strength: z.number(),
    smoothing: z.number(),
    invert: z.boolean(),
  }).optional(),
  shadowSettings: z.object({
    enabled: z.boolean(),
    intensity: z.number(),
    type: z.enum(["ground", "contact", "both"]),
    offsetY: z.number(),
    blur: z.number(),
  }).optional(),
  presetId: z.string().optional(),
});

export const smartAssetManifestSchema = z.object({
  $schema: z.literal("https://chase-ar.local/schemas/smart-asset-manifest.schema.json"),
  manifestVersion: z.literal("1.0.0"),
  kind: z.literal("chase.smart-asset"),
  id: z.string(),
  name: z.string(),
  category: z.string(),
  type: z.string(),
  lifecycle: z.string(),
  presetId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schema: z.object({
    path: z.literal("schema.json"),
    bindingSources: z.array(z.string()),
  }),
  dimensions: z.object({
    width: z.number(),
    height: z.number(),
    units: z.literal("px"),
  }),
  sourceFiles: z.array(z.object({
    assetId: z.string(),
    role: z.string(),
    uri: z.string().optional(),
  })),
  thumbnail: z.object({
    assetId: z.string(),
    uri: z.string().optional(),
  }).optional(),
  capabilities: z.object({
    dataDriven: z.boolean(),
    animated: z.boolean(),
    layered25d: z.boolean(),
    card3d: z.boolean(),
    extruded: z.boolean(),
    displacement: z.boolean(),
    shadows: z.boolean(),
  }),
  placement: arAnchorSettingsSchema,
  rendering: z.object({
    depthSettings: z.unknown().optional(),
    extrusionSettings: z.unknown().optional(),
    card3dSettings: z.unknown().optional(),
    displacementSettings: z.unknown().optional(),
    shadowSettings: z.unknown().optional(),
  }),
  exposedNodes: z.array(smartAssetExposedNodeSchema),
  bindingSlots: z.array(smartAssetBindingSlotSchema),
  states: z.record(z.string(), z.unknown()),
  animations: z.record(z.string(), arAnimationSchema),
  builderAsset: arBuilderAssetSchema,
});
