import { createElement, type ComponentType, type ReactElement } from "react";
import type { SetNode } from "@/document/types";

type NodeKind = SetNode["kind"];
type NodeOf<K extends NodeKind> = Extract<SetNode, { kind: K }>;

/** Exhaustive, typed extension seam for node renderers. */
export type SetNodeRendererRegistry<Context> = {
  [K in NodeKind]: ComponentType<{ node: NodeOf<K>; ctx: Context }>;
};

/**
 * Centralizes the one unavoidable discriminated-union cast at the registry
 * boundary. Renderer implementations remain fully narrowed by node kind.
 */
export function renderSetNode<Context>(
  registry: SetNodeRendererRegistry<Context>,
  node: SetNode,
  ctx: Context,
): ReactElement {
  const Renderer = registry[node.kind] as ComponentType<{ node: SetNode; ctx: Context }>;
  return createElement(Renderer, { node, ctx });
}

/** Typed metadata used by inspector, palette, and future asset manifests. */
export interface SetNodeInspectorDefinition {
  label: string;
  supportsMaterial: boolean;
  supportsSurface: boolean;
  supportsBindings: boolean;
}

export const SET_NODE_INSPECTOR_DEFINITIONS: Record<NodeKind, SetNodeInspectorDefinition> = {
  primitive: { label: "Primitive", supportsMaterial: true, supportsSurface: true, supportsBindings: true },
  text3d: { label: "3D Text", supportsMaterial: false, supportsSurface: false, supportsBindings: true },
  light: { label: "Light", supportsMaterial: false, supportsSurface: false, supportsBindings: false },
  camera: { label: "Camera", supportsMaterial: false, supportsSurface: false, supportsBindings: false },
  videofeed: { label: "Video Feed", supportsMaterial: false, supportsSurface: true, supportsBindings: false },
  model: { label: "Model", supportsMaterial: false, supportsSurface: false, supportsBindings: false },
  group: { label: "Group", supportsMaterial: false, supportsSurface: false, supportsBindings: false },
};
