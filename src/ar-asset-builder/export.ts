import type { ArBuilderAsset } from "./types";

export type ExportFormat = "smart-asset" | "png" | "webp" | "json" | "bundle" | "glb";
export type ExportFileFormat = Exclude<ExportFormat, "smart-asset"> | "asset-json" | "schema-json";

export interface ExportResult {
  format: ExportFileFormat;
  blob: Blob;
  filename: string;
}

export interface SmartAssetExportResult {
  format: "smart-asset";
  folderName: string;
  files: ExportResult[];
}

export type SmartAssetValueType = "string" | "number" | "boolean" | "color" | "image";

export interface SmartAssetProperty {
  id: string;
  label: string;
  targetPath: string;
  type: SmartAssetValueType;
  bindable: boolean;
  animatable: boolean;
  defaultValue?: unknown;
}

export interface SmartAssetExposedNode {
  id: string;
  name: string;
  kind: "layer" | "slot" | "state";
  visible: boolean;
  locked: boolean;
  properties: SmartAssetProperty[];
}

export interface SmartAssetBindingSlot {
  id: string;
  label: string;
  targetPath: string;
  source: string;
  valueType: SmartAssetValueType;
  required: boolean;
  updateMode: "instant";
  format?: string;
  fallback?: unknown;
}

export interface SmartAssetDataSchema {
  $schema: "http://json-schema.org/draft-07/schema#";
  $id: "schema.json";
  title: string;
  description: string;
  type: "object";
  properties: Record<string, JsonSchemaNode>;
  required: string[];
  additionalProperties: true;
  "x-chase": {
    kind: "smart-asset-data";
    assetId: string;
    assetName: string;
    bindingSources: string[];
  };
}

export interface SmartAssetManifest {
  $schema: "https://chase-ar.local/schemas/smart-asset-manifest.schema.json";
  manifestVersion: "1.0.0";
  kind: "chase.smart-asset";
  id: string;
  name: string;
  category: string;
  type: string;
  lifecycle: string;
  presetId?: string;
  createdAt: string;
  updatedAt: string;
  schema: {
    path: "schema.json";
    bindingSources: string[];
  };
  dimensions: {
    width: number;
    height: number;
    units: "px";
  };
  sourceFiles: Array<{
    assetId: string;
    role: string;
    uri?: string;
  }>;
  thumbnail?: {
    assetId: string;
    uri?: string;
  };
  capabilities: {
    dataDriven: boolean;
    animated: boolean;
    layered25d: boolean;
    card3d: boolean;
    extruded: boolean;
    displacement: boolean;
    shadows: boolean;
  };
  placement: ArBuilderAsset["anchors"];
  rendering: {
    depthSettings?: ArBuilderAsset["depthSettings"];
    extrusionSettings?: ArBuilderAsset["extrusionSettings"];
    card3dSettings?: ArBuilderAsset["card3dSettings"];
    displacementSettings?: ArBuilderAsset["displacementSettings"];
    shadowSettings?: ArBuilderAsset["shadowSettings"];
  };
  exposedNodes: SmartAssetExposedNode[];
  bindingSlots: SmartAssetBindingSlot[];
  states: Record<string, unknown>;
  animations: ArBuilderAsset["animations"];
  builderAsset: ArBuilderAsset;
}

export interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  additionalProperties?: boolean;
  pattern?: string;
  description?: string;
}

export function getAvailableExports(asset: ArBuilderAsset): ExportFormat[] {
  const formats: ExportFormat[] = ["smart-asset", "json", "bundle"];
  if (asset.layers.some((l) => l.imageAssetId)) {
    formats.push("png", "webp");
  }
  if (
    asset.depthSettings?.mode === "extruded" ||
    asset.depthSettings?.mode === "card3d" ||
    asset.type === "3d-card" ||
    asset.type === "extruded-logo"
  ) {
    formats.push("glb");
  }
  return formats;
}

export function buildSmartAssetManifest(asset: ArBuilderAsset, assetRefs: Record<string, string> = {}): SmartAssetManifest {
  const bindingSources = unique(asset.bindings.map((binding) => binding.source));
  return {
    $schema: "https://chase-ar.local/schemas/smart-asset-manifest.schema.json",
    manifestVersion: "1.0.0",
    kind: "chase.smart-asset",
    id: asset.id,
    name: asset.name,
    category: asset.category,
    type: asset.type,
    lifecycle: asset.lifecycle,
    presetId: asset.presetId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    schema: {
      path: "schema.json",
      bindingSources,
    },
    dimensions: {
      ...asset.dimensions,
      units: "px",
    },
    sourceFiles: asset.sourceFiles.map((file) => ({
      assetId: file.assetId,
      role: file.role,
      uri: assetRefs[file.assetId],
    })),
    thumbnail: asset.thumbnailAssetId
      ? {
          assetId: asset.thumbnailAssetId,
          uri: assetRefs[asset.thumbnailAssetId],
        }
      : undefined,
    capabilities: {
      dataDriven: asset.bindings.length > 0,
      animated: Object.keys(asset.animations).length > 0,
      layered25d: asset.depthSettings?.mode === "layered25d",
      card3d: asset.depthSettings?.mode === "card3d" || asset.type === "3d-card",
      extruded: asset.depthSettings?.mode === "extruded" || asset.type === "extruded-logo",
      displacement: asset.depthSettings?.mode === "displacement",
      shadows: asset.shadowSettings?.enabled ?? false,
    },
    placement: asset.anchors,
    rendering: {
      depthSettings: asset.depthSettings,
      extrusionSettings: asset.extrusionSettings,
      card3dSettings: asset.card3dSettings,
      displacementSettings: asset.displacementSettings,
      shadowSettings: asset.shadowSettings,
    },
    exposedNodes: buildExposedNodes(asset),
    bindingSlots: asset.bindings.map((binding, index) => ({
      id: `binding.${index}.${sanitizePath(binding.targetPath)}`,
      label: labelFromPath(binding.targetPath),
      targetPath: binding.targetPath,
      source: binding.source,
      valueType: inferValueType(binding.targetPath, binding.source, binding.fallback),
      required: false,
      updateMode: "instant",
      format: binding.format,
      fallback: binding.fallback,
    })),
    states: asset.states,
    animations: asset.animations,
    builderAsset: asset,
  };
}

export function buildSmartAssetDataSchema(asset: ArBuilderAsset): SmartAssetDataSchema {
  const root: SmartAssetDataSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "schema.json",
    title: `${asset.name} Data`,
    description: `Data fields consumed by ${asset.name}. Fields are optional because Smart Asset bindings can resolve through fallbacks or last-known-good values.`,
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
    "x-chase": {
      kind: "smart-asset-data",
      assetId: asset.id,
      assetName: asset.name,
      bindingSources: unique(asset.bindings.map((binding) => binding.source)),
    },
  };

  for (const binding of asset.bindings) {
    const tokens = tokenizeSourcePath(binding.source);
    if (tokens.length === 0) continue;
    addSchemaPath(root.properties, tokens, schemaForValueType(inferValueType(binding.targetPath, binding.source, binding.fallback)));
  }

  return root;
}

export function exportSmartAsset(asset: ArBuilderAsset, assetRefs: Record<string, string> = {}): SmartAssetExportResult {
  const manifest = buildSmartAssetManifest(asset, assetRefs);
  const dataSchema = buildSmartAssetDataSchema(asset);
  return {
    format: "smart-asset",
    folderName: sanitizeFilename(asset.name),
    files: [
      {
        format: "asset-json",
        blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
        filename: "asset.json",
      },
      {
        format: "schema-json",
        blob: new Blob([JSON.stringify(dataSchema, null, 2)], { type: "application/json" }),
        filename: "schema.json",
      },
    ],
  };
}

export function exportAssetJson(asset: ArBuilderAsset): ExportResult {
  const json = JSON.stringify(asset, null, 2);
  return {
    format: "json",
    blob: new Blob([json], { type: "application/json" }),
    filename: `${sanitizeFilename(asset.name)}.ar-asset.json`,
  };
}

export function exportAssetBundle(asset: ArBuilderAsset, assetRefs: Record<string, string>): ExportResult {
  const bundle = {
    schemaVersion: 1,
    asset,
    assetRefs,
    exportedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(bundle, null, 2);
  return {
    format: "bundle",
    blob: new Blob([json], { type: "application/json" }),
    filename: `${sanitizeFilename(asset.name)}.chase-ar-bundle.json`,
  };
}

export async function exportLayerPng(
  asset: ArBuilderAsset,
  layerImageUrl: string,
): Promise<ExportResult> {
  const res = await fetch(layerImageUrl);
  const blob = await res.blob();
  return {
    format: "png",
    blob,
    filename: `${sanitizeFilename(asset.name)}.png`,
  };
}

export async function exportLayerWebp(
  asset: ArBuilderAsset,
  layerImageUrl: string,
): Promise<ExportResult> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = layerImageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Export failed"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("WebP export failed"))), "image/webp", 0.92);
  });
  return {
    format: "webp",
    blob,
    filename: `${sanitizeFilename(asset.name)}.webp`,
  };
}

export function downloadExport(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSmartAssetExport(result: SmartAssetExportResult): void {
  result.files.forEach((file, index) => {
    window.setTimeout(() => downloadExport(file), index * 80);
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function buildExposedNodes(asset: ArBuilderAsset): SmartAssetExposedNode[] {
  const nodes: SmartAssetExposedNode[] = asset.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    kind: "layer",
    visible: layer.visible,
    locked: layer.locked,
    properties: [
      numberProperty("x", `layers.${layer.id}.transform.x`, layer.transform.x),
      numberProperty("y", `layers.${layer.id}.transform.y`, layer.transform.y),
      numberProperty("width", `layers.${layer.id}.transform.width`, layer.transform.width),
      numberProperty("height", `layers.${layer.id}.transform.height`, layer.transform.height),
      numberProperty("rotation", `layers.${layer.id}.transform.rotation`, layer.transform.rotation),
      numberProperty("zDepth", `layers.${layer.id}.transform.zDepth`, layer.transform.zDepth),
      numberProperty("opacity", `layers.${layer.id}.transform.opacity`, layer.transform.opacity),
      {
        id: "image",
        label: "Image",
        targetPath: `layers.${layer.id}.image`,
        type: "image",
        bindable: true,
        animatable: false,
        defaultValue: layer.imageAssetId,
      },
    ],
  }));

  const stateKeys = unique([
    ...Object.keys(asset.states),
    ...asset.bindings
      .map((binding) => binding.targetPath.match(/^states\.([^.]+)$/)?.[1])
      .filter((key): key is string => Boolean(key)),
  ]);
  if (stateKeys.length > 0) {
    nodes.push({
      id: "states",
      name: "States",
      kind: "state",
      visible: true,
      locked: false,
      properties: stateKeys.map((key) => ({
        id: key,
        label: labelFromPath(key),
        targetPath: `states.${key}`,
        type: inferValueType(`states.${key}`, key, asset.states[key]),
        bindable: true,
        animatable: false,
        defaultValue: asset.states[key],
      })),
    });
  }

  const layerIds = new Set(asset.layers.map((layer) => layer.id));
  const slotProps = new Map<string, SmartAssetProperty[]>();
  for (const binding of asset.bindings) {
    const match = binding.targetPath.match(/^layers\.([^.]+)\.(.+)$/);
    if (!match || layerIds.has(match[1])) continue;
    const [, slotId, propertyPath] = match;
    const properties = slotProps.get(slotId) ?? [];
    properties.push({
      id: propertyPath,
      label: labelFromPath(propertyPath),
      targetPath: binding.targetPath,
      type: inferValueType(binding.targetPath, binding.source, binding.fallback),
      bindable: true,
      animatable: false,
      defaultValue: binding.fallback,
    });
    slotProps.set(slotId, properties);
  }
  for (const [slotId, properties] of slotProps.entries()) {
    nodes.push({
      id: `slot.${slotId}`,
      name: labelFromPath(slotId),
      kind: "slot",
      visible: true,
      locked: false,
      properties,
    });
  }

  return nodes;
}

function numberProperty(id: string, targetPath: string, defaultValue: number): SmartAssetProperty {
  return {
    id,
    label: labelFromPath(id),
    targetPath,
    type: "number",
    bindable: false,
    animatable: true,
    defaultValue,
  };
}

function tokenizeSourcePath(path: string): string[] {
  return Array.from(path.matchAll(/([^[.\]]+)|\[(\d+)\]/g), (match) => match[1] ?? match[2]).filter(Boolean);
}

function addSchemaPath(properties: Record<string, JsonSchemaNode>, tokens: string[], leaf: JsonSchemaNode): void {
  let currentProperties = properties;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isLeaf = i === tokens.length - 1;
    if (isLeaf) {
      currentProperties[token] = mergeSchemaNodes(currentProperties[token], leaf);
      return;
    }

    const nextIsArrayIndex = /^\d+$/.test(tokens[i + 1] ?? "");
    const next = ensureContainer(currentProperties, token, nextIsArrayIndex ? "array" : "object");
    if (nextIsArrayIndex) {
      next.items = next.items ?? objectSchema();
      next.items.properties = next.items.properties ?? {};
      currentProperties = next.items.properties;
      i += 1;
    } else {
      next.properties = next.properties ?? {};
      currentProperties = next.properties;
    }
  }
}

function ensureContainer(properties: Record<string, JsonSchemaNode>, key: string, type: "object" | "array"): JsonSchemaNode {
  const existing = properties[key];
  if (existing && existing.type === type) return existing;
  const next = type === "array" ? arraySchema() : objectSchema();
  properties[key] = next;
  return next;
}

function objectSchema(): JsonSchemaNode {
  return { type: "object", properties: {}, required: [], additionalProperties: true };
}

function arraySchema(): JsonSchemaNode {
  return { type: "array", items: objectSchema() };
}

function schemaForValueType(type: SmartAssetValueType): JsonSchemaNode {
  switch (type) {
    case "number":
      return { type: ["number", "string"], description: "Numeric data may arrive as a number or a formatted string." };
    case "boolean":
      return { type: ["boolean", "string"] };
    case "color":
      return { type: "string", pattern: "^$|^#[0-9a-fA-F]{6}$" };
    case "image":
      return { type: "string", description: "Image URL, data URL, or project asset id." };
    default:
      return { type: "string" };
  }
}

function mergeSchemaNodes(existing: JsonSchemaNode | undefined, incoming: JsonSchemaNode): JsonSchemaNode {
  if (!existing) return incoming;
  const types = unique([
    ...toTypeList(existing.type),
    ...toTypeList(incoming.type),
  ]);
  return {
    ...existing,
    ...incoming,
    type: types.length <= 1 ? types[0] : types,
    description: existing.description ?? incoming.description,
    pattern: existing.pattern ?? incoming.pattern,
  };
}

function toTypeList(type: string | string[] | undefined): string[] {
  if (!type) return [];
  return Array.isArray(type) ? type : [type];
}

function inferValueType(targetPath: string, source: string, fallback?: unknown): SmartAssetValueType {
  const path = `${targetPath}.${source}`.toLowerCase();
  const parts = path.split(/[.[\]]/).filter(Boolean);
  const leaf = parts[parts.length - 1] ?? path;
  if (
    typeof fallback === "boolean" ||
    leaf === "leading" ||
    leaf === "declared" ||
    leaf === "expired" ||
    leaf === "islive" ||
    leaf.startsWith("is_") ||
    leaf.startsWith("has_") ||
    leaf.startsWith("can_")
  ) return "boolean";
  if (typeof fallback === "number" || /score|votes|percentage|pct|count|rank|seats|majority|temp|temperature|speed|minute|possession|goals/.test(path)) return "number";
  if (typeof fallback === "string" && /^#[0-9a-fA-F]{6}$/.test(fallback)) return "color";
  if (/color|colour/.test(path)) return "color";
  if (/image|photo|logo|thumbnail|url/.test(path)) return "image";
  return "string";
}

function labelFromPath(path: string): string {
  const parts = path.split(".");
  const last = parts[parts.length - 1] ?? path;
  return last
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char: string) => char.toUpperCase());
}

function sanitizePath(path: string): string {
  return path.replace(/[^a-zA-Z0-9_-]+/g, ".");
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
