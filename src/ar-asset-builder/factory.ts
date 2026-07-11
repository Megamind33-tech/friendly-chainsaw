import { newId } from "@/document/ids";
import type { ArAssetCategory, ArAssetLayer, ArAssetType, ArAssetTransform, ArBuilderAsset } from "./types";
import { AR_ASSET_SCHEMA_VERSION } from "./types";
import {
  DEFAULT_ANCHORS,
  DEFAULT_CARD3D,
  DEFAULT_DEPTH,
  DEFAULT_DISPLACEMENT,
  DEFAULT_EXTRUSION,
  DEFAULT_SHADOW,
} from "./constants";

export function defaultLayerTransform(w = 400, h = 400): ArAssetTransform {
  return {
    x: 0,
    y: 0,
    width: w,
    height: h,
    rotation: 0,
    zDepth: 0,
    pivotX: 0.5,
    pivotY: 0.5,
    opacity: 1,
  };
}

export function createArAssetLayer(name: string, overrides: Partial<ArAssetLayer> = {}): ArAssetLayer {
  return {
    id: newId(),
    name,
    visible: true,
    locked: false,
    transform: defaultLayerTransform(),
    shadowCast: true,
    shadowReceive: true,
    ...overrides,
  };
}

export function createArBuilderAsset(
  name: string,
  category: ArAssetCategory,
  type: ArAssetType,
  dimensions: { width: number; height: number },
  overrides: Partial<ArBuilderAsset> = {},
): ArBuilderAsset {
  const now = new Date().toISOString();
  return {
    schemaVersion: AR_ASSET_SCHEMA_VERSION,
    id: newId(),
    name,
    category,
    type,
    lifecycle: "edit",
    dimensions,
    sourceFiles: [],
    layers: [],
    materials: [],
    animations: {},
    bindings: [],
    anchors: { ...DEFAULT_ANCHORS },
    states: {},
    createdAt: now,
    updatedAt: now,
    depthSettings: { ...DEFAULT_DEPTH },
    extrusionSettings: { ...DEFAULT_EXTRUSION },
    card3dSettings: { ...DEFAULT_CARD3D },
    displacementSettings: { ...DEFAULT_DISPLACEMENT },
    shadowSettings: { ...DEFAULT_SHADOW },
    ...overrides,
  };
}

export function cloneArBuilderAsset(asset: ArBuilderAsset, newName?: string): ArBuilderAsset {
  const now = new Date().toISOString();
  const layerIdMap = new Map<string, string>();
  for (const layer of asset.layers) layerIdMap.set(layer.id, newId());

  return {
    ...structuredClone(asset),
    id: newId(),
    name: newName ?? `${asset.name} Copy`,
    lifecycle: "edit",
    createdAt: now,
    updatedAt: now,
    layers: asset.layers.map((l) => ({
      ...structuredClone(l),
      id: layerIdMap.get(l.id)!,
      parentId: l.parentId ? layerIdMap.get(l.parentId) : undefined,
    })),
  };
}
