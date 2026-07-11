import type { SetNode } from "@/document/types";

export type PropertyCategory = "transform" | "appearance" | "content" | "data" | "animation";

export type PropertyType = "vec3" | "number" | "string" | "color" | "boolean" | "image" | "video";

export interface PropertyDef {
  id: string;
  label: string;
  category: PropertyCategory;
  type: PropertyType;
  bindable: boolean;
  animatable: boolean;
  programmeSafe: boolean;
  userEditable: boolean;
  defaultValue?: unknown;
}

const TRANSFORM_PROPS: PropertyDef[] = [
  { id: "transform.position", label: "Position", category: "transform", type: "vec3", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
  { id: "transform.rotation", label: "Rotation", category: "transform", type: "vec3", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
  { id: "transform.scale", label: "Scale", category: "transform", type: "vec3", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
];

const TEXT3D_PROPS: PropertyDef[] = [
  { id: "text", label: "Text", category: "content", type: "string", bindable: true, animatable: false, programmeSafe: true, userEditable: true, defaultValue: "" },
  { id: "color", label: "Colour", category: "appearance", type: "color", bindable: true, animatable: true, programmeSafe: true, userEditable: true, defaultValue: "#ffffff" },
  { id: "fontSize", label: "Font size", category: "appearance", type: "number", bindable: false, animatable: false, programmeSafe: true, userEditable: true },
];

const PRIMITIVE_PROPS: PropertyDef[] = [
  { id: "material.color", label: "Colour", category: "appearance", type: "color", bindable: true, animatable: true, programmeSafe: true, userEditable: true, defaultValue: "#ffffff" },
  { id: "material.metalness", label: "Metalness", category: "appearance", type: "number", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
  { id: "material.roughness", label: "Roughness", category: "appearance", type: "number", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
  { id: "material.opacity", label: "Opacity", category: "appearance", type: "number", bindable: false, animatable: true, programmeSafe: true, userEditable: true },
  { id: "textureAssetId", label: "Texture", category: "appearance", type: "image", bindable: true, animatable: false, programmeSafe: true, userEditable: true },
];

/** Registered bindable properties for a SetNode kind. */
export function getPropertiesForSetNode(node: SetNode): PropertyDef[] {
  const base = [...TRANSFORM_PROPS];
  switch (node.kind) {
    case "text3d":
      return [...base, ...TEXT3D_PROPS];
    case "primitive":
      return [...base, ...PRIMITIVE_PROPS];
    case "light":
      return [
        ...base,
        { id: "color", label: "Colour", category: "appearance", type: "color", bindable: true, animatable: true, programmeSafe: true, userEditable: true },
        { id: "intensity", label: "Intensity", category: "appearance", type: "number", bindable: true, animatable: true, programmeSafe: true, userEditable: true },
      ];
    case "videofeed":
      return [
        ...base,
        { id: "label", label: "Label", category: "content", type: "string", bindable: true, animatable: false, programmeSafe: true, userEditable: true },
      ];
    default:
      return base;
  }
}

/** Bindable target paths for the given node (subset of registry). */
export function getBindableTargetPaths(node: SetNode): string[] {
  return getPropertiesForSetNode(node).filter((p) => p.bindable).map((p) => p.id);
}

/** Common 2D element bindable paths (gfx2d). */
export const GFX2D_BINDABLE_PATHS = [
  "text",
  "fill",
  "stroke",
  "opacity",
  "imageAssetId",
] as const;
