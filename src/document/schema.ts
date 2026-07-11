import { z } from "zod";
import { defaultSetEnvironment, defaultSetRenderSettings } from "./factory";

/**
 * Mirrors src/document/types.ts. Used only to validate documents loaded
 * from SQLite (guards against corrupt rows or a stale schema version),
 * never as the runtime type source — types.ts owns that.
 *
 * Every new field added to types.ts MUST be mirrored here — Zod strips
 * unmirrored fields on reload (a bug class this project has hit before).
 */

const transformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
});

const bindingSchema = z.object({
  targetPath: z.string(),
  source: z.string(),
  format: z.string().optional(),
  fallback: z.unknown().optional(),
});

const arAnimationSchema = z.object({
  preset: z.enum([
    "none",
    "fade",
    "slide",
    "scale",
    "pop",
    "wipe",
    "rotate",
    "fly",
    "count-up",
    "bar-grow",
    "ticker-crawl",
    "loop-pulse",
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

// Shared by gfx2d `video` elements and set3d `videofeed` nodes — moved
// above the gfx2d element schemas (rather than staying down with the rest
// of the set3d section) since both now depend on it.
const videoSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("device"), deviceId: z.string() }),
  z.object({ type: z.literal("screen") }),
  z.object({ type: z.literal("url"), url: z.string() }),
  z.object({ type: z.literal("program") }),
  z.object({ type: z.literal("preview") }),
]);

const animPhaseSchema = z.object({
  delay: z.number(),
  duration: z.number(),
  direction: z.enum(["left", "right", "top", "bottom", "none"]),
  distance: z.number(),
  ease: z.string(),
  fade: z.boolean(),
  scaleFrom: z.number().optional(),
  countUp: z.boolean().optional(),
});

const loopPulseSchema = z.object({
  periodSec: z.number(),
  scaleTo: z.number().optional(),
  opacityTo: z.number().optional(),
});

const elementAnimSchema = z.object({
  in: animPhaseSchema.optional(),
  out: animPhaseSchema.optional(),
  loop: loopPulseSchema.optional(),
});

const elementShadowSchema = z.object({
  color: z.string(),
  blur: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().optional(),
});

const baseElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  transform: transformSchema,
  opacity: z.number(),
  visible: z.boolean(),
  locked: z.boolean(),
  bindings: z.array(bindingSchema),
  anim: elementAnimSchema.optional(),
  shadow: elementShadowSchema.optional(),
});

const rectElementSchema = baseElementSchema.extend({
  kind: z.literal("rect"),
  fill: z.string(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  cornerRadius: z.number().optional(),
  gradient: z
    .object({
      from: z.string(),
      mid: z.string().optional(),
      to: z.string(),
      direction: z.enum(["vertical", "horizontal", "diagonal"]),
    })
    .optional(),
  skewX: z.number().optional(),
});

const textElementSchema = baseElementSchema.extend({
  kind: z.literal("text"),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fill: z.string(),
  align: z.enum(["left", "center", "right"]),
  fontStyle: z.string().optional(),
  letterSpacing: z.number().optional(),
  uppercase: z.boolean().optional(),
});

const imageElementSchema = baseElementSchema.extend({
  kind: z.literal("image"),
  assetId: z.string(),
});

const videoElementSchema = baseElementSchema.extend({
  kind: z.literal("video"),
  source: videoSourceSchema,
  volume: z.number().optional(),
  muted: z.boolean().optional(),
});

const lottieElementSchema = baseElementSchema.extend({
  kind: z.literal("lottie"),
  assetId: z.string(),
  loop: z.boolean().optional(),
  speed: z.number().optional(),
});

// Group elements contain Element[]; z.lazy ties the recursive knot.
const elementSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    rectElementSchema,
    textElementSchema,
    imageElementSchema,
    videoElementSchema,
    lottieElementSchema,
    groupElementSchema,
  ]),
);

const groupElementSchema = baseElementSchema.extend({
  kind: z.literal("group"),
  children: z.array(elementSchema),
});

// --- set3d (Phase 5) -------------------------------------------------------

const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const transform3dSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

const materialSchema = z.object({
  color: z.string(),
  metalness: z.number(),
  roughness: z.number(),
  emissive: z.string().optional(),
  emissiveIntensity: z.number().optional(),
  opacity: z.number().optional(),
  // Phase 5.13 PBR extensions — optional so pre-pipeline docs still parse.
  usePhysical: z.boolean().optional(),
  clearcoat: z.number().optional(),
  clearcoatRoughness: z.number().optional(),
  transmission: z.number().optional(),
  thickness: z.number().optional(),
  ior: z.number().optional(),
  envMapIntensity: z.number().optional(),
  mapAssetId: z.string().optional(),
  normalMapAssetId: z.string().optional(),
  ormMapAssetId: z.string().optional(),
  textureScale: z.object({ x: z.number(), y: z.number() }).optional(),
  textureOffset: z.object({ x: z.number(), y: z.number() }).optional(),
  textureRotation: z.number().optional(),
});

const surfaceDisplaySchema = z.object({
  fit: z.enum(["contain", "cover", "stretch"]),
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  anchor: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
  overscan: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().optional(),
});

const baseSetNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  transform: transform3dSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  role: z.enum(["set", "ar"]).optional(),
  opacity: z.number().optional(),
  bindings: z.array(bindingSchema).optional(),
  animation: arAnimationSchema.optional(),
  onAir: z.boolean().optional(),
  formationSlot: z.number().int().min(1).max(11).optional(),
  slotKind: z.enum(["branding", "media", "data"]).optional(),
  slotLabel: z.string().optional(),
  // AR 3D Models library metadata + data-driven visibility (sports panels).
  arModel: z
    .object({
      modelId: z.string(),
      version: z.string(),
      params: z.record(z.string(), z.number()),
    })
    .optional(),
  visibilityRule: z
    .object({
      source: z.string(),
      op: z.enum(["empty", "notEmpty", "equals", "notEquals"]),
      value: z.string().optional(),
    })
    .optional(),
  updateAnim: z.enum(["none", "pulse", "flash", "fade"]).optional(),
  arPlacement: z
    .object({
      mode: z.enum([
        "worldLocked",
        "floorAnchored",
        "cameraFacing",
        "presenterAnchored",
        "playerAnchored",
        "screenSpace",
        "free3D",
        "surfaceSnap",
        "groundSnap",
      ]),
      cameraFacingStrength: z.number().optional(),
      anchorNodeId: z.string().optional(),
      anchorOffset: vec3Schema.optional(),
      screenDistance: z.number().optional(),
    })
    .optional(),
});

const modelNodeSchema = baseSetNodeSchema.extend({ kind: z.literal("model"), assetId: z.string() });

const primitiveNodeSchema = baseSetNodeSchema.extend({
  kind: z.literal("primitive"),
  shape: z.enum(["box", "roundedBox", "sphere", "cylinder", "plane", "prism"]),
  material: materialSchema,
  textureAssetId: z.string().optional(),
  display: surfaceDisplaySchema.optional(),
  cornerRadius: z.number().optional(),
  reflector: z.boolean().optional(),
  outline: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  holeOutline: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  bevel: z.number().optional(),
});

const text3dNodeSchema = baseSetNodeSchema.extend({
  kind: z.literal("text3d"),
  text: z.string(),
  fontSize: z.number(),
  color: z.string(),
});

const lightNodeSchema = baseSetNodeSchema.extend({
  kind: z.literal("light"),
  lightType: z.enum(["spot", "point", "directional"]),
  color: z.string(),
  intensity: z.number(),
  angle: z.number().optional(),
  penumbra: z.number().optional(),
  distance: z.number().optional(),
  castShadow: z.boolean(),
});

const cameraNodeSchema = baseSetNodeSchema.extend({ kind: z.literal("camera"), fov: z.number() });

const videoFeedNodeSchema = baseSetNodeSchema.extend({
  kind: z.literal("videofeed"),
  source: videoSourceSchema,
  width: z.number(),
  height: z.number(),
  label: z.string(),
  volume: z.number().optional(),
  muted: z.boolean().optional(),
  chromaKey: z
    .object({
      enabled: z.boolean(),
      color: z.string(),
      similarity: z.number(),
      smoothness: z.number(),
      spill: z.number().optional(),
      mode: z.enum(["color", "segment"]).optional(),
    })
    .optional(),
  crop: z.object({ x: z.number(), w: z.number() }).optional(),
  display: surfaceDisplaySchema.optional(),
});

// Group nodes contain SetNode[]; z.lazy ties the recursive knot (same
// pattern as gfx2d's group elements above).
const setNodeSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    modelNodeSchema,
    primitiveNodeSchema,
    text3dNodeSchema,
    lightNodeSchema,
    cameraNodeSchema,
    videoFeedNodeSchema,
    groupNodeSchema,
  ]),
);

const groupNodeSchema = baseSetNodeSchema.extend({
  kind: z.literal("group"),
  children: z.array(setNodeSchema),
});

const floorReflectorSchema = z.object({
  enabled: z.boolean(),
  resolution: z.number().optional(),
  mixStrength: z.number().optional(),
  mirror: z.number().optional(),
});

const setEnvironmentSchema = z.object({
  background: z.string(),
  floor: z.object({
    enabled: z.boolean(),
    color: z.string(),
    metalness: z.number(),
    roughness: z.number(),
    size: z.number(),
    reflector: floorReflectorSchema.optional(),
    textureAssetId: z.string().optional(),
    textureTiles: z.number().optional(),
  }),
  grid: z.boolean(),
  ambient: z.object({ color: z.string(), intensity: z.number() }),
  fog: z.object({ color: z.string(), near: z.number(), far: z.number() }).optional(),
  // AR backplate (Phase 5.8) — optional so pre-existing persisted set3d
  // environments (no field at all) still parse untouched.
  backplate: videoSourceSchema.optional(),
});

const setRenderSettingsSchema = z.object({
  exposure: z.number(),
  shadows: z.boolean(),
  dpr: z.number(),
  bloom: z.object({ enabled: z.boolean(), intensity: z.number(), threshold: z.number() }),
  vignette: z.object({ enabled: z.boolean(), darkness: z.number() }),
  // Realism knobs (Phase 5.8) — `.optional()` with factory-side defaults so
  // old persisted docs (no field) still parse; new docs always get one from
  // defaultSetRenderSettings.
  contactShadows: z.object({ enabled: z.boolean(), opacity: z.number(), blur: z.number() }).optional(),
  ao: z.object({ enabled: z.boolean(), intensity: z.number() }).optional(),
  envLight: z.object({ enabled: z.boolean(), intensity: z.number() }).optional(),
  // Phase 5.13 — quality tiers / planar / IBL res / SSR (all optional).
  qualityTier: z.enum(["low", "medium", "high"]).optional(),
  planarReflection: z
    .object({
      enabled: z.boolean(),
      maxCount: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .optional(),
  envResolution: z.number().optional(),
  envCubemapAssetId: z.string().optional(),
  ssr: z.object({ enabled: z.boolean() }).optional(),
});

const layerPropsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gfx2d"), elements: z.array(elementSchema), safeArea: z.boolean().optional() }),
  // Defaults make a pre-Phase-5 bare `{kind:"set3d"}` parse into a valid
  // empty set instead of failing validation and nuking the whole project.
  z.object({
    kind: z.literal("set3d"),
    nodes: z.array(setNodeSchema).default([]),
    environment: setEnvironmentSchema.default(() => defaultSetEnvironment()),
    activeCameraId: z.string().nullable().default(null),
    render: setRenderSettingsSchema.default(() => defaultSetRenderSettings()),
  }),
  z.object({ kind: z.literal("map") }),
  z.object({ kind: z.literal("chart") }),
]);

const timelineSchema = z.object({
  inDuration: z.number(),
  outDuration: z.number(),
  inEase: z.string(),
  outEase: z.string(),
});

/** Exported for user-template validation (userTemplates.ts) — a saved
 * template is one Layer JSON blob validated on load exactly like projects. */
export const layerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["gfx2d", "set3d", "map", "chart"]),
  zIndex: z.number(),
  visible: z.boolean(),
  locked: z.boolean(),
  opacity: z.number(),
  blendMode: z.enum(["normal", "multiply", "screen", "overlay", "add"]),
  transform: transformSchema,
  bindings: z.array(bindingSchema),
  props: layerPropsSchema,
  timeline: timelineSchema.optional(),
  scrollSpeed: z.number().optional(),
});

const sceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  layers: z.array(layerSchema),
});

const assetSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "font", "model", "video", "lottie"]),
  name: z.string(),
  src: z.string(),
  format: z.enum(["glb", "gltf", "fbx", "obj"]).optional(),
  thumbnail: z.string().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  videoWidth: z.number().optional(),
  videoHeight: z.number().optional(),
  optimizedSrc: z.string().optional(),
  optimizedMaxEdge: z.number().optional(),
  family: z.string().optional(),
});

import { arBuilderAssetSchema } from "@/ar-asset-builder/schema";

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  resolution: z.object({ width: z.number(), height: z.number() }),
  fps: z.number(),
  colorSpace: z.enum(["srgb", "rec709"]),
  scenes: z.array(sceneSchema),
  assets: z.array(assetSchema),
  arBuilderAssets: z.array(arBuilderAssetSchema).optional(),
  schemaVersion: z.number(),
  /** How this project's NDI sender advertises itself on the network. */
  ndiSourceName: z.string().optional(),
});

/** Validates the persisted `program` column (PGM/PVW scene ids). */
export const programStateSchema = z.object({
  programSceneId: z.string().nullable(),
  previewSceneId: z.string().nullable(),
});
