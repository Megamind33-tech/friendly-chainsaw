import { z } from "zod";
import { evaluateVisibilityRule } from "@/ar-engine/visibility";
import { formatBindingValue } from "@/ar-system/binding/format";
import { resolveElements } from "./bindings";
import type { ArFocus } from "./arFocus";
import type { CameraMove, CameraOrbit } from "./cameraMoves";
import type { LayerPlayback, VerseDataHold } from "./playbackState";
import { projectSchema } from "./schema";
import type { ID, Project, SetNode } from "./types";

/**
 * Stable contract between the Control Room and every non-authoring renderer.
 * Increment this only for a deliberately breaking change; new optional
 * fields can be added under the same version.
 */
export const RENDER_ENVELOPE_VERSION = 1 as const;

export interface RenderEnvelope {
  version: typeof RENDER_ENVELOPE_VERSION;
  emittedAt: number;
  project: Project;
  programSceneId: ID | null;
  previewSceneId: ID | null;
  layerPlayback: Record<ID, LayerPlayback>;
  cameraMoves: Record<ID, CameraMove>;
  cameraOrbits: Record<ID, CameraOrbit>;
  cameraPreview: Record<ID, ID>;
  arFocus: Record<ID, ArFocus>;
}

export interface AssembleRenderEnvelopeInput {
  project: Project;
  programSceneId: ID | null;
  previewSceneId: ID | null;
  layerPlayback: Record<ID, LayerPlayback>;
  cameraMoves: Record<ID, CameraMove>;
  cameraOrbits: Record<ID, CameraOrbit>;
  cameraPreview: Record<ID, ID>;
  arFocus: Record<ID, ArFocus>;
  dataValues: Record<string, string>;
  verseDataHold?: VerseDataHold | null;
  emittedAt?: number;
}

const layerPlaybackSchema = z.record(z.string(), z.object({
  phase: z.enum(["in", "out"]),
  startedAt: z.number().finite(),
}));

const vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const cameraPoseSchema = z.object({ position: vec3Schema, rotation: vec3Schema, fov: z.number().finite() });
const cameraMovesSchema = z.record(z.string(), z.object({
  from: cameraPoseSchema,
  toCameraId: z.string(),
  durationSec: z.number().finite(),
  ease: z.string(),
  startedAt: z.number().finite(),
}));
const cameraOrbitsSchema = z.record(z.string(), z.object({
  cameraId: z.string(),
  targetNodeId: z.string(),
  degPerSec: z.number().finite(),
  startedAt: z.number().finite(),
  from: cameraPoseSchema,
  pivotStart: vec3Schema,
}));
const arFocusSchema = z.record(z.string(), z.object({ nodeIds: z.array(z.string()), startedAt: z.number().finite() }));

/** Runtime validation for documents received by a renderer or sidecar. */
export const renderEnvelopeSchema = z.object({
  version: z.literal(RENDER_ENVELOPE_VERSION),
  emittedAt: z.number().finite(),
  project: projectSchema,
  programSceneId: z.string().nullable(),
  previewSceneId: z.string().nullable(),
  layerPlayback: layerPlaybackSchema,
  cameraMoves: cameraMovesSchema,
  cameraOrbits: cameraOrbitsSchema,
  cameraPreview: z.record(z.string(), z.string()),
  arFocus: arFocusSchema,
});

/** Parse without throwing so a renderer can keep its last known good frame. */
export function parseRenderEnvelope(value: unknown): RenderEnvelope | null {
  const parsed = renderEnvelopeSchema.safeParse(value);
  return parsed.success ? (parsed.data as RenderEnvelope) : null;
}

function bakeSetNodes(nodes: SetNode[], values: Record<string, string>): SetNode[] {
  return nodes.map((original) => {
    let node = original;
    if (node.visibilityRule) {
      node = { ...node, visible: node.visible && evaluateVisibilityRule(node.visibilityRule, values), visibilityRule: undefined };
    }
    if (node.kind === "group") return { ...node, children: bakeSetNodes(node.children, values) };
    if (node.kind === "text3d" && node.bindings?.length) {
      const binding = node.bindings.find((candidate) => candidate.targetPath === "text") ?? node.bindings[0];
      const raw = values[binding.source];
      const text = raw !== undefined && raw !== "" ? formatBindingValue(raw, binding.format) : (binding.fallback ?? node.text);
      return { ...node, text: String(text), bindings: undefined };
    }
    if (node.kind === "primitive" && node.bindings?.length) {
      const binding = node.bindings.find((candidate) => candidate.targetPath === "textureUrl");
      if (binding) {
        const raw = values[binding.source];
        const textureUrl = raw !== undefined ? String(raw).trim() : String(binding.fallback ?? "");
        return { ...node, bindings: [{ targetPath: "textureUrl", source: "__baked__", fallback: textureUrl }] };
      }
    }
    return node;
  });
}

/**
 * Pure output assembly. It never reads Zustand, invokes Tauri, or touches
 * SQLite, which makes it safe to reuse in a separate render process.
 */
export function assembleRenderEnvelope(input: AssembleRenderEnvelopeInput): RenderEnvelope {
  const values = input.verseDataHold
    ? { ...input.dataValues, "event.verseText": input.verseDataHold.verseText, "event.verseRef": input.verseDataHold.verseRef }
    : input.dataValues;
  const project: Project = {
    ...input.project,
    scenes: input.project.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.props.kind === "gfx2d") {
          return { ...layer, props: { ...layer.props, elements: resolveElements(layer.props.elements, values) } };
        }
        if (layer.props.kind === "set3d") {
          return { ...layer, props: { ...layer.props, nodes: bakeSetNodes(layer.props.nodes, values) } };
        }
        return layer;
      }),
    })),
  };
  return renderEnvelopeSchema.parse({
    version: RENDER_ENVELOPE_VERSION,
    emittedAt: input.emittedAt ?? Date.now(),
    project,
    programSceneId: input.programSceneId,
    previewSceneId: input.previewSceneId,
    layerPlayback: input.layerPlayback,
    cameraMoves: input.cameraMoves,
    cameraOrbits: input.cameraOrbits,
    cameraPreview: input.cameraPreview,
    arFocus: input.arFocus,
  }) as RenderEnvelope;
}
