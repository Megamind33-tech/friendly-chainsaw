import { newId } from "@/document/ids";
import type { ArAssetLayer, ArBuilderAsset } from "./types";
import { createArAssetLayer } from "./factory";

export function addLayer(asset: ArBuilderAsset, layer: ArAssetLayer): ArBuilderAsset {
  return { ...asset, layers: [...asset.layers, layer], updatedAt: new Date().toISOString() };
}

export function removeLayer(asset: ArBuilderAsset, layerId: string): ArBuilderAsset {
  const ids = new Set([layerId]);
  // Remove children recursively
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of asset.layers) {
      if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) {
        ids.add(l.id);
        changed = true;
      }
    }
  }
  return {
    ...asset,
    layers: asset.layers.filter((l) => !ids.has(l.id)),
    updatedAt: new Date().toISOString(),
  };
}

export function updateLayer(asset: ArBuilderAsset, layerId: string, patch: Partial<ArAssetLayer>): ArBuilderAsset {
  return {
    ...asset,
    layers: asset.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    updatedAt: new Date().toISOString(),
  };
}

export function reorderLayers(asset: ArBuilderAsset, fromIndex: number, toIndex: number): ArBuilderAsset {
  const layers = [...asset.layers];
  const [moved] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, moved);
  return { ...asset, layers, updatedAt: new Date().toISOString() };
}

export function duplicateLayer(asset: ArBuilderAsset, layerId: string): ArBuilderAsset {
  const source = asset.layers.find((l) => l.id === layerId);
  if (!source) return asset;
  const copy = { ...structuredClone(source), id: newId(), name: `${source.name} Copy` };
  return addLayer(asset, copy);
}

export function separateForegroundBackground(
  asset: ArBuilderAsset,
  foregroundAssetId: string,
  backgroundAssetId: string,
  confidence: number,
): ArBuilderAsset {
  const fg = createArAssetLayer("Foreground", {
    imageAssetId: foregroundAssetId,
    segmentationConfidence: confidence,
    transform: { ...asset.layers[0]?.transform ?? defaultTransform(asset), zDepth: 0.02 },
  });
  const bg = createArAssetLayer("Background", {
    imageAssetId: backgroundAssetId,
    segmentationConfidence: confidence,
    transform: { ...asset.layers[0]?.transform ?? defaultTransform(asset), zDepth: -0.02 },
  });
  return addLayer(addLayer(asset, bg), fg);
}

export function distributeLayersAcrossDepth(asset: ArBuilderAsset, spacing?: number): ArBuilderAsset {
  const gap = spacing ?? asset.depthSettings?.spacing ?? 0.06;
  const visible = asset.layers.filter((l) => l.visible);
  return {
    ...asset,
    layers: asset.layers.map((l) => {
      const idx = visible.indexOf(l);
      if (idx === -1) return l;
      return {
        ...l,
        transform: { ...l.transform, zDepth: idx * gap },
      };
    }),
    depthSettings: { ...asset.depthSettings!, mode: "layered25d", spacing: gap },
    updatedAt: new Date().toISOString(),
  };
}

function defaultTransform(asset: ArBuilderAsset) {
  return {
    x: 0,
    y: 0,
    width: asset.dimensions.width,
    height: asset.dimensions.height,
    rotation: 0,
    zDepth: 0,
    pivotX: 0.5,
    pivotY: 0.5,
    opacity: 1,
  };
}

export function groupLayers(asset: ArBuilderAsset, layerIds: string[], groupName = "Group"): ArBuilderAsset {
  const groupId = newId();
  const group = createArAssetLayer(groupName, { id: groupId });
  return {
    ...asset,
    layers: [
      ...asset.layers,
      group,
      ...asset.layers
        .filter((l) => layerIds.includes(l.id))
        .map((l) => ({ ...l, parentId: groupId })),
    ],
    updatedAt: new Date().toISOString(),
  };
}
