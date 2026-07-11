import type { Asset, Layer, SetNode } from "@/document/types";
import type { ARReadinessCheck } from "./types";
import { flattenArSetNodes, flattenSetNodes } from "./nodeUtils";
import { hasVerseBindings } from "./arPrep";

function missingDataBinding(node: SetNode): boolean {
  return node.bindings?.some((binding) => !binding.source.trim()) ?? false;
}

export function validateARLayer(layer: Layer, assets: Asset[]): ARReadinessCheck[] {
  const props = layer.props;
  if (props.kind !== "set3d") {
    return [{ id: "not-set3d", label: "AR layer", level: "error", detail: "Active layer is not a 3D/AR layer." }];
  }

  const allNodes = flattenSetNodes(props.nodes);
  const nodes = flattenArSetNodes(props.nodes);
  const checks: ARReadinessCheck[] = [];
  const cameras = allNodes.filter((node) => node.kind === "camera");
  const lights = allNodes.filter((node) => node.kind === "light");
  const visibleObjects = nodes.filter((node) => node.visible && node.kind !== "camera" && node.kind !== "light");
  const modelNodes = nodes.filter((node) => node.kind === "model");
  const textNodes = nodes.filter((node) => node.kind === "text3d");
  const boundNodes = nodes.filter((node) => (node.bindings?.length ?? 0) > 0);
  const setRefs = allNodes.length - nodes.length;

  checks.push({
    id: "objects",
    label: "AR objects",
    level: visibleObjects.length > 0 ? "ok" : "error",
    detail: visibleObjects.length > 0 ? `${visibleObjects.length} visible AR objects.` : "Add at least one visible AR object.",
  });
  checks.push({
    id: "set-context",
    label: "Studio context",
    level: "ok",
    detail: setRefs > 0 ? `${setRefs} set objects locked as backdrop context.` : "AR-only scene; no set backdrop nodes present.",
  });
  checks.push({
    id: "camera",
    label: "Program camera",
    level: props.activeCameraId && cameras.some((node) => node.id === props.activeCameraId) ? "ok" : "warning",
    detail: props.activeCameraId ? "Program camera assigned." : "Assign an AR program camera before air.",
  });
  checks.push({
    id: "lighting",
    label: "Lighting",
    level: lights.length > 0 || props.environment.ambient.intensity > 0 ? "ok" : "warning",
    detail: lights.length > 0 ? `${lights.length} authored lights.` : "Only ambient light is active.",
  });
  checks.push({
    id: "assets",
    label: "Assets loaded",
    level: modelNodes.every((node) => assets.some((asset) => asset.id === node.assetId)) ? "ok" : "error",
    detail: modelNodes.every((node) => assets.some((asset) => asset.id === node.assetId))
      ? "Referenced model assets are present."
      : "One or more model assets are missing.",
  });
  checks.push({
    id: "safe-area",
    label: "Safe area",
    level: visibleObjects.every((node) => Math.abs(node.transform.position.x) <= 4 && node.transform.position.y >= 0 && node.transform.position.y <= 4)
      ? "ok"
      : "warning",
    detail: "Objects should stay inside the authored AR framing volume.",
  });
  checks.push({
    id: "text-size",
    label: "Text size",
    level: textNodes.every((node) => node.fontSize >= 0.08) ? "ok" : "warning",
    detail: textNodes.every((node) => node.fontSize >= 0.08) ? "3D text is legible." : "One or more text objects may be too small on air.",
  });
  checks.push({
    id: "bindings",
    label: "Data bindings",
    level: nodes.some(missingDataBinding) ? "error" : "ok",
    detail: boundNodes.length > 0 ? `${boundNodes.length} objects have data bindings.` : "No live data bindings assigned.",
  });
  checks.push({
    id: "animations",
    label: "Exit animation",
    level: visibleObjects.every((node) => node.animation && node.animation.preset !== "none") ? "ok" : "warning",
    detail: "Assign animation presets to avoid hard cuts on air.",
  });
  if (hasVerseBindings(props.nodes)) {
    checks.push({
      id: "verse-transitions",
      label: "Verse transitions",
      level: visibleObjects.every((node) => node.animation && node.animation.preset !== "none") ? "ok" : "warning",
      detail: "Scripture boards need IN/OUT presets so verse changes animate cleanly.",
    });
  }
  checks.push({
    id: "performance",
    label: "Performance",
    level: nodes.length <= 40 ? "ok" : nodes.length <= 65 ? "warning" : "error",
    detail: `${nodes.length} AR nodes. Keep live overlay scenes lean for stable frame delivery.`,
  });

  return checks;
}

export function isReadyForAir(checks: ARReadinessCheck[]): boolean {
  return checks.every((check) => check.level !== "error");
}
