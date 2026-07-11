import { createGroupNode, createPrimitiveNode, createText3dNode, vec3 } from "@/document/factory";
import type { Binding, SetNode } from "@/document/types";
import { markSetNodesAsAr } from "@/ar-engine/nodeUtils";
import { AR_CENTER } from "@/ar-engine/nodeUtils";
import type { ArBuilderAsset } from "./types";

/** Convert an ArBuilderAsset into AR SetNodes for scene placement. */
export function arAssetToSetNodes(asset: ArBuilderAsset, assets: { id: string; src: string; imageWidth?: number; imageHeight?: number }[]): SetNode[] {
  const nodes: SetNode[] = [];
  const anchor = asset.anchors;

  if (asset.type === "election-result-bar" || asset.type === "stat-panel" || asset.type === "chart") {
    return markSetNodesAsAr(buildDataDrivenNodes(asset));
  }

  for (const layer of asset.layers) {
    if (!layer.visible || !layer.imageAssetId) continue;
    const imgAsset = assets.find((a) => a.id === layer.imageAssetId);
    if (!imgAsset) continue;

    const aspect =
      imgAsset.imageWidth && imgAsset.imageHeight && imgAsset.imageHeight > 0
        ? imgAsset.imageWidth / imgAsset.imageHeight
        : asset.dimensions.width / asset.dimensions.height;
    const h = (layer.transform.height / asset.dimensions.height) * 1.8;
    const w = h * aspect;
    const px = anchor.worldPosition.x + (layer.transform.x / asset.dimensions.width - 0.5) * 4;
    const py = anchor.worldPosition.y + (0.5 - layer.transform.y / asset.dimensions.height) * 2.5 + layer.transform.zDepth;
    const pz = anchor.worldPosition.z + layer.transform.zDepth;

  if (asset.depthSettings?.mode === "extruded" || asset.type === "extruded-logo") {
      const depth = asset.extrusionSettings?.depth ?? 0.08;
      nodes.push(withBindings(
        createPrimitiveNode("box", {
          name: layer.name,
          textureAssetId: layer.imageAssetId,
          transform: {
            position: vec3(px, py, pz),
            rotation: vec3(0, 0, layer.transform.rotation),
            scale: vec3(w, h, depth),
          },
          material: {
            color: "#ffffff",
            metalness: layer.material?.metalness ?? 0.1,
            roughness: layer.material?.roughness ?? 0.6,
            opacity: layer.transform.opacity,
          },
        }),
        bindingsForLayer(asset, layer.id),
      ));
    } else if (asset.depthSettings?.mode === "card3d" || asset.type === "3d-card") {
      const thickness = asset.card3dSettings?.thickness ?? 0.02;
      nodes.push(withBindings(
        createPrimitiveNode("box", {
          name: `${layer.name} (card)`,
          textureAssetId: layer.imageAssetId,
          transform: {
            position: vec3(px, py, pz),
            rotation: vec3(0, 0, layer.transform.rotation),
            scale: vec3(w, h, thickness),
          },
          material: {
            color: "#ffffff",
            metalness: 0.2,
            roughness: 0.4,
            opacity: layer.transform.opacity,
            clearcoat: asset.card3dSettings?.reflection ?? 0.3,
          },
        }),
        bindingsForLayer(asset, layer.id),
      ));
    } else {
      nodes.push(withBindings(
        createPrimitiveNode("plane", {
          name: layer.name,
          textureAssetId: layer.imageAssetId,
          transform: {
            position: vec3(px, py, pz),
            rotation: vec3(0, 0, layer.transform.rotation),
            scale: vec3(w, h, 1),
          },
          material: {
            color: "#ffffff",
            metalness: layer.material?.metalness ?? 0,
            roughness: layer.material?.roughness ?? 1,
            opacity: layer.transform.opacity,
          },
        }),
        bindingsForLayer(asset, layer.id),
      ));
    }
  }

  if (asset.shadowSettings?.enabled && nodes.length > 0) {
    nodes.push(
      createPrimitiveNode("plane", {
        name: "Ground Shadow",
        transform: {
          position: vec3(anchor.worldPosition.x, anchor.worldPosition.y - 0.01, anchor.worldPosition.z),
          rotation: vec3(-90, 0, 0),
          scale: vec3(1.5, 1.5, 1),
        },
        material: {
          color: "#000000",
          metalness: 0,
          roughness: 1,
          opacity: asset.shadowSettings.intensity * 0.4,
        },
      }),
    );
  }

  if (nodes.length === 0 && asset.layers.length === 0) {
    // Empty asset placeholder
    nodes.push(
      createPrimitiveNode("plane", {
        name: asset.name,
        transform: {
          position: vec3(AR_CENTER.x, AR_CENTER.y, AR_CENTER.z),
          scale: vec3(1, 0.5, 1),
        },
        material: { color: "#333355", metalness: 0, roughness: 1, opacity: 0.5 },
      }),
    );
  }

  if (nodes.length === 1) return markSetNodesAsAr(nodes);
  return markSetNodesAsAr([createGroupNode(nodes, { name: asset.name })]);
}

function bindingsForLayer(asset: ArBuilderAsset, layerId: string): Binding[] {
  return asset.bindings.filter((b) => b.targetPath.startsWith(`layers.${layerId}`));
}

function withBindings<T extends SetNode>(node: T, bindings: Binding[]): T {
  if (bindings.length > 0) return { ...node, bindings };
  return node;
}

function buildDataDrivenNodes(asset: ArBuilderAsset): SetNode[] {
  const nodes: SetNode[] = [];
  const barBindings = asset.bindings.filter((b) => b.targetPath.includes("bar") || b.targetPath.includes("percentage"));
  const labelBindings = asset.bindings.filter((b) => b.targetPath.includes("name") || b.targetPath.includes("label"));

  nodes.push(
    createPrimitiveNode("box", {
      name: "Bar Track",
      transform: { position: vec3(AR_CENTER.x, AR_CENTER.y, AR_CENTER.z), scale: vec3(2, 0.15, 0.02) },
      material: { color: "#1a1a2e", metalness: 0.2, roughness: 0.8, opacity: 0.9 },
    }),
  );

  nodes.push(withBindings(
    createPrimitiveNode("box", {
      name: "Bar Fill",
      transform: { position: vec3(AR_CENTER.x - 0.5, AR_CENTER.y, AR_CENTER.z + 0.01), scale: vec3(1, 0.1, 0.02) },
      material: { color: asset.states.partyColor as string ?? "#3366cc", metalness: 0.3, roughness: 0.5, opacity: 1 },
    }),
    barBindings,
  ));
  if (asset.animations.barGrow) {
    const last = nodes[nodes.length - 1];
    nodes[nodes.length - 1] = { ...last, animation: asset.animations.barGrow };
  }

  nodes.push(withBindings(
    createText3dNode({
      name: "Label",
      text: "—",
      fontSize: 0.12,
      color: "#ffffff",
      transform: { position: vec3(AR_CENTER.x, AR_CENTER.y + 0.2, AR_CENTER.z) },
    }),
    labelBindings,
  ));

  return nodes;
}
