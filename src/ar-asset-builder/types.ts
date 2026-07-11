import type { ARAnimation, Binding, ID } from "@/document/types";

export const AR_ASSET_SCHEMA_VERSION = 1;

export type ArAssetLifecycle = "edit" | "preview" | "ready" | "live";

export type ArAssetCategory =
  | "elections"
  | "sports"
  | "weather"
  | "news"
  | "maps"
  | "charts"
  | "profiles"
  | "logos"
  | "lower-thirds"
  | "fullscreen"
  | "custom";

export type ArAssetType =
  | "transparent-cutout"
  | "layered-25d"
  | "3d-card"
  | "extruded-logo"
  | "map"
  | "chart"
  | "stat-panel"
  | "candidate-profile"
  | "player-profile"
  | "weather-symbol"
  | "weather-map-marker"
  | "election-result-bar"
  | "seat-projection"
  | "scoreboard-element"
  | "lower-third"
  | "fullscreen-graphic"
  | "virtual-floor"
  | "floating-ar"
  | "screen-insert"
  | "custom";

export type ArDepthMode = "flat" | "layered25d" | "card3d" | "extruded" | "displacement";

export type ArSourceFileRole = "original" | "working" | "mask" | "depthMap" | "thumbnail";

export interface ArSourceFile {
  assetId: ID;
  role: ArSourceFileRole;
}

export interface ArAssetTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zDepth: number;
  pivotX: number;
  pivotY: number;
  opacity: number;
}

export interface ArAssetLayer {
  id: ID;
  name: string;
  parentId?: ID;
  visible: boolean;
  locked: boolean;
  transform: ArAssetTransform;
  /** Project asset id for this layer's image content. */
  imageAssetId?: ID;
  /** Optional mask asset (grayscale alpha). */
  maskAssetId?: ID;
  /** Auto-segmentation confidence 0–1; absent = manual layer. */
  segmentationConfidence?: number;
  material?: ArAssetMaterial;
  shadowCast?: boolean;
  shadowReceive?: boolean;
  billboard?: boolean;
  faceCamera?: boolean;
  parallaxStrength?: number;
}

export interface ArAssetMaterial {
  id: ID;
  name: string;
  type: "standard" | "pbr" | "card-front" | "card-side" | "card-back";
  color: string;
  metalness: number;
  roughness: number;
  reflectivity: number;
  emissive?: string;
  opacity?: number;
}

export interface ArDepthSettings {
  mode: ArDepthMode;
  spacing: number;
  parallaxStrength: number;
  distributeEvenly: boolean;
}

export interface ArExtrusionSettings {
  depth: number;
  bevel: number;
  bevelThickness: number;
  frontMaterialId?: ID;
  sideMaterialId?: ID;
  backMaterialId?: ID;
}

export interface ArCard3dSettings {
  thickness: number;
  cornerRadius: number;
  borderWidth: number;
  borderColor: string;
  reflection: number;
  shadowEnabled: boolean;
}

export interface ArDisplacementSettings {
  depthMapAssetId?: ID;
  strength: number;
  smoothing: number;
  invert: boolean;
}

export interface ArShadowSettings {
  enabled: boolean;
  intensity: number;
  type: "ground" | "contact" | "both";
  offsetY: number;
  blur: number;
}

export interface ArAnchorSettings {
  anchorType: "ground" | "screen" | "camera" | "virtual-set" | "tracked" | "manual";
  worldPosition: { x: number; y: number; z: number };
  worldRotation: { x: number; y: number; z: number };
  worldScale: { x: number; y: number; z: number };
  lockToHorizon: boolean;
  faceCamera: boolean;
  safeAreaConstraint: boolean;
  depthTest: boolean;
  occlusion: boolean;
  renderOrder: number;
}

export interface ArBuilderAsset {
  schemaVersion: number;
  id: ID;
  name: string;
  category: ArAssetCategory;
  type: ArAssetType;
  lifecycle: ArAssetLifecycle;
  dimensions: { width: number; height: number };
  sourceFiles: ArSourceFile[];
  layers: ArAssetLayer[];
  materials: ArAssetMaterial[];
  animations: Record<string, ARAnimation>;
  bindings: Binding[];
  anchors: ArAnchorSettings;
  states: Record<string, unknown>;
  thumbnailAssetId?: ID;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
  depthSettings?: ArDepthSettings;
  extrusionSettings?: ArExtrusionSettings;
  card3dSettings?: ArCard3dSettings;
  displacementSettings?: ArDisplacementSettings;
  shadowSettings?: ArShadowSettings;
  /** Preset template id when created from a starter structure. */
  presetId?: string;
}

export type ArCanvasTool =
  | "select"
  | "move"
  | "scale"
  | "rotate"
  | "crop"
  | "mask-brush"
  | "eraser"
  | "pen"
  | "text"
  | "rectangle"
  | "circle"
  | "line";

export type ArCanvasViewMode = "2d" | "25d" | "3d";

export type ArWorkflowStep =
  | "import"
  | "cleanup"
  | "layering"
  | "data-mapping"
  | "template-slot"
  | "preview"
  | "export";

export interface ArImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
  blur: number;
  levels: { black: number; white: number; gamma: number };
}

export interface ArSegmentationResult {
  layers: Array<{ name: string; maskDataUrl: string; confidence: number }>;
  provider: string;
}
