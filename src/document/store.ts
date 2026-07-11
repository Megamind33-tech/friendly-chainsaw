import { create, useStore } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import type {
  ID,
  Project,
  Scene,
  Layer,
  LayerKind,
  Element,
  Transform,
  Binding,
  Asset,
  SetNode,
  Transform3D,
  SetEnvironment,
  SetRenderSettings,
} from "./types";
import type { ArBuilderAsset } from "@/ar-asset-builder/types";
import { createDefaultProject, createLayer, createScene, cloneLayerWithNewIds, duplicateElementValue, createGroupElement, createGroupNode } from "./factory";
import { createProgramSlice, type ProgramSlice } from "./programState";
import { createPlaybackSlice, type PlaybackSlice } from "./playbackState";
import { upgradeProjectArAnimations } from "@/ar-engine/arPrep";
import { createCameraMovesSlice, type CameraMovesSlice } from "./cameraMoves";
import { createArFocusSlice, type ArFocusSlice } from "./arFocus";
import { useEditorSessionStore } from "./editorSessionStore";
import { useLiveShowStore } from "./liveShowStore";

function findScene(project: Project, sceneId: ID): Scene | undefined {
  return project.scenes.find((s) => s.id === sceneId);
}

function findLayer(scene: Scene, layerId: ID): Layer | undefined {
  return scene.layers.find((l) => l.id === layerId);
}

/** Only gfx2d layers hold elements in Phase 1. */
function elementsOf(layer: Layer): Element[] | undefined {
  return layer.props.kind === "gfx2d" ? layer.props.elements : undefined;
}

/** Only set3d layers hold nodes (Phase 5). */
function set3dPropsOf(layer: Layer) {
  return layer.props.kind === "set3d" ? layer.props : undefined;
}

/** Depth-first search through groups — set3d nodes nest, unlike top-level elements. */
export function findSetNode(nodes: SetNode[], nodeId: ID): SetNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === "group") {
      const found = findSetNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The set3d layer an operator is actually looking at right now — the ONE
 * SHARED resolver for every surface that edits/renders "the current virtual
 * set" (Studio's VirtualSetPanel, the AR workspace, AR Builder). A scene can
 * hold several set3d layers (News Desk, Sports Arena, ...), but
 * `addSet3dLayer`/`addSetNode`'s own invariant is that exactly one stays
 * `visible` at a time — that visible layer IS "the current set."
 *
 * Real bug fixed here (reported live, 2026-07-10): both call sites used to
 * fall back to array order ("the first set3d layer found") instead of
 * visibility, so switching the active virtual set in Studio left AR Builder
 * silently still editing the PREVIOUS (now-hidden) set — new AR objects
 * landed somewhere the operator couldn't see. Visibility now wins whenever
 * a visible set3d layer exists; `activeLayerId` and array order are only
 * fallbacks for the edge case where nothing is currently visible.
 */
export function findActiveSet3dLayer(
  project: Project | null,
  activeSceneId: ID | null,
  activeLayerId: ID | null,
): { sceneId: ID; scene: Scene; layer: Layer } | null {
  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  if (!scene) return null;
  const visible = scene.layers.find((l) => l.props.kind === "set3d" && l.visible);
  if (visible) return { sceneId: scene.id, scene, layer: visible };
  const active = scene.layers.find((l) => l.id === activeLayerId);
  const layer = active?.props.kind === "set3d" ? active : scene.layers.find((l) => l.props.kind === "set3d");
  return layer ? { sceneId: scene.id, scene, layer } : null;
}

function removeSetNodeIn(nodes: SetNode[], nodeId: ID): boolean {
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (index !== -1) {
    nodes.splice(index, 1);
    return true;
  }
  for (const node of nodes) {
    if (node.kind === "group" && removeSetNodeIn(node.children, nodeId)) return true;
  }
  return false;
}

/** Finds which scene/layer a set3d node belongs to (viewport picking knows only the node id). */
export function locateSetNode(project: Project, nodeId: ID): { sceneId: ID; layerId: ID } | null {
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      const props = set3dPropsOf(layer);
      if (props && findSetNode(props.nodes, nodeId)) {
        return { sceneId: scene.id, layerId: layer.id };
      }
    }
  }
  return null;
}

/** Finds which scene/layer a top-level element belongs to (canvas interactions know only the element id). */
export function locateElement(project: Project, elementId: ID): { sceneId: ID; layerId: ID } | null {
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      const elements = elementsOf(layer);
      if (elements?.some((e) => e.id === elementId)) {
        return { sceneId: scene.id, layerId: layer.id };
      }
    }
  }
  return null;
}

interface DocumentSlice {
  /** The only field tracked by zundo — see `partialize` below. */
  project: Project | null;
}

interface UiSlice {
  selectedElementIds: ID[];
  activeSceneId: ID | null;
  activeLayerId: ID | null;
  canvas: { zoom: number; panX: number; panY: number };
  dirty: boolean;
  /** set3d selection is separate from 2D element selection — the Virtual
   * Set and GFX editors are independent panels with independent focus. */
  selectedNodeId: ID | null;
  /** 3D multi-selection (Shift/Ctrl-click in the viewport). Always contains
   * selectedNodeId when non-empty; selectSetNode resets it to one entry. */
  selectedNodeIds: ID[];
  gizmoMode: "translate" | "rotate" | "scale";
}

interface Actions {
  createDefaultProject: () => void;
  loadProject: (project: Project) => void;
  markSaved: () => void;

  addScene: () => ID;
  /** Refuses to delete the last scene; re-points PGM/PVW/active if they
   * referenced the deleted one. */
  removeScene: (sceneId: ID) => void;
  renameScene: (sceneId: ID, name: string) => void;
  addLayer: (sceneId: ID, kind: LayerKind) => ID;
  /** Inserts a fully-formed layer (e.g. a sport scorebug from src/sports). */
  addPrebuiltLayer: (sceneId: ID, layer: Layer) => ID;
  /** Deep copy with fresh ids, inserted directly above the original. */
  duplicateLayer: (sceneId: ID, layerId: ID) => void;
  /** Same as addPrebuiltLayer, but for `set3d` layers specifically: hides
   * every other set3d layer already in the scene first. Multiple opaque
   * virtual sets stacked in one scene silently hide each other (DocumentRenderer
   * paints each as a full-screen canvas in zIndex order) — a scene should show
   * exactly one virtual set at a time, like a real broadcast scene. */
  addSet3dLayer: (sceneId: ID, layer: Layer) => ID;
  removeLayer: (sceneId: ID, layerId: ID) => void;
  reorderLayer: (sceneId: ID, layerId: ID, toIndex: number) => void;
  setLayerFlag: (sceneId: ID, layerId: ID, flag: "visible" | "locked", value: boolean) => void;
  renameLayer: (sceneId: ID, layerId: ID, name: string) => void;

  addElement: (sceneId: ID, layerId: ID, element: Element) => void;
  duplicateElement: (sceneId: ID, layerId: ID, elementId: ID) => void;
  /** Wrap several top-level elements into one GroupElement so they move/scale
   * as a unit. The group's transform is the elements' bounding box; children
   * are rebased to be relative to it. Returns the new group id (or null). */
  groupElements: (sceneId: ID, layerId: ID, elementIds: ID[]) => ID | null;
  /** Dissolve a group, lifting its children back to the layer as absolute-
   * positioned top-level elements. */
  ungroupElement: (sceneId: ID, layerId: ID, groupId: ID) => ID[];
  removeElement: (sceneId: ID, layerId: ID, elementId: ID) => void;
  updateElement: (sceneId: ID, layerId: ID, elementId: ID, updates: Partial<Element>) => void;
  /** Elements have no separate zIndex field — array order IS the paint
   * order (first = bottom, matching renderNodes.tsx/DocumentRenderer, which
   * just map the array in place). Reordering within a layer is the
   * send-to-back/bring-to-front an operator needs to put e.g. a background
   * video plate behind existing graphics instead of on top of them. */
  reorderElement: (sceneId: ID, layerId: ID, elementId: ID, toIndex: number) => void;
  commitTransform: (sceneId: ID, layerId: ID, elementId: ID, transform: Transform) => void;
  setElementBinding: (sceneId: ID, layerId: ID, elementId: ID, binding: Binding) => void;
  updateElementBinding: (sceneId: ID, layerId: ID, elementId: ID, index: number, updates: Partial<Binding>) => void;
  removeElementBinding: (sceneId: ID, layerId: ID, elementId: ID, index: number) => void;

  selectElements: (ids: ID[]) => void;
  setActiveLayer: (layerId: ID | null) => void;
  setCanvasView: (view: Partial<UiSlice["canvas"]>) => void;

  // --- set3d (Phase 5) ---
  addSetNode: (sceneId: ID, layerId: ID, node: SetNode) => void;
  replaceSetNodes: (sceneId: ID, layerId: ID, nodes: SetNode[]) => void;
  removeSetNode: (sceneId: ID, layerId: ID, nodeId: ID) => void;
  updateSetNode: (sceneId: ID, layerId: ID, nodeId: ID, updates: Partial<SetNode>) => void;
  setSetNodeBinding: (sceneId: ID, layerId: ID, nodeId: ID, binding: Binding) => void;
  updateSetNodeBinding: (sceneId: ID, layerId: ID, nodeId: ID, index: number, updates: Partial<Binding>) => void;
  removeSetNodeBinding: (sceneId: ID, layerId: ID, nodeId: ID, index: number) => void;
  commitNodeTransform: (sceneId: ID, layerId: ID, nodeId: ID, transform: Transform3D) => void;
  setSetEnvironment: (sceneId: ID, layerId: ID, updates: Partial<SetEnvironment>) => void;
  setSetRenderSettings: (sceneId: ID, layerId: ID, updates: Partial<SetRenderSettings>) => void;
  setActiveSetCamera: (sceneId: ID, layerId: ID, cameraId: ID | null) => void;
  addAsset: (asset: Asset) => void;
  updateAsset: (assetId: ID, updates: Partial<Asset>) => void;
  removeAsset: (assetId: ID) => void;
  selectSetNode: (nodeId: ID | null) => void;
  /** Shift/Ctrl-click: add or remove a node from the 3D multi-selection. */
  toggleSetNodeSelection: (nodeId: ID) => void;
  /** Wrap several TOP-LEVEL set3d nodes into one group at their centroid;
   * children are rebased group-relative so nothing moves visually. */
  groupSetNodes: (sceneId: ID, layerId: ID, nodeIds: ID[]) => ID | null;
  /** Dissolve a group, lifting children back to the layer top level with the
   * group's position folded into theirs. */
  ungroupSetNode: (sceneId: ID, layerId: ID, groupId: ID) => void;
  setGizmoMode: (mode: UiSlice["gizmoMode"]) => void;
  setNdiSourceName: (name: string) => void;

  // --- AR Asset Builder ---
  addArBuilderAsset: (asset: ArBuilderAsset) => void;
  updateArBuilderAsset: (assetId: ID, updates: Partial<ArBuilderAsset>) => void;
  removeArBuilderAsset: (assetId: ID) => void;
  replaceArBuilderAsset: (asset: ArBuilderAsset) => void;
}

export type Store = DocumentSlice & UiSlice & Actions & ProgramSlice & PlaybackSlice & CameraMovesSlice & ArFocusSlice;

export const useDocStore = create<Store>()(
  temporal(
    immer((set, get, store) => ({
      project: null,
      selectedElementIds: [],
      activeSceneId: null,
      activeLayerId: null,
      canvas: { zoom: 1, panX: 0, panY: 0 },
      dirty: false,
      selectedNodeId: null,
      selectedNodeIds: [],
      gizmoMode: "translate" as const,

      createDefaultProject: () =>
        set((state) => {
          const project = createDefaultProject();
          state.project = project;
          state.activeSceneId = project.scenes[0].id;
          state.activeLayerId = null;
          state.dirty = true;
          state.programSceneId = project.scenes[0].id;
          state.previewSceneId = project.scenes[0].id;
        }),

      loadProject: (project) =>
        set((state) => {
          state.project = upgradeProjectArAnimations(project);
          state.activeSceneId = project.scenes[0]?.id ?? null;
          state.activeLayerId = null;
          state.selectedElementIds = [];
          state.dirty = false;
          // Defaults to the first scene; persistence.ts immediately
          // overwrites this via hydrateProgramState() with the persisted
          // `program` column value, if any.
          state.programSceneId = project.scenes[0]?.id ?? null;
          state.previewSceneId = project.scenes[0]?.id ?? null;
        }),

      markSaved: () =>
        set((state) => {
          state.dirty = false;
        }),

      addScene: () => {
        const scene = createScene();
        set((state) => {
          if (!state.project) return;
          scene.name = `Scene ${state.project.scenes.length + 1}`;
          state.project.scenes.push(scene);
          state.activeSceneId = scene.id;
          state.dirty = true;
        });
        return scene.id;
      },

      removeScene: (sceneId) =>
        set((state) => {
          if (!state.project || state.project.scenes.length <= 1) return;
          state.project.scenes = state.project.scenes.filter((s) => s.id !== sceneId);
          const fallback = state.project.scenes[0].id;
          // Never leave PGM/PVW/active pointing at a ghost scene — a deleted
          // program scene would blank OBS with no way to see why.
          if (state.programSceneId === sceneId) state.programSceneId = fallback;
          if (state.previewSceneId === sceneId) state.previewSceneId = fallback;
          if (state.activeSceneId === sceneId) state.activeSceneId = fallback;
          state.selectedElementIds = [];
          state.selectedNodeId = null;
          state.dirty = true;
        }),

      renameScene: (sceneId, name) =>
        set((state) => {
          const scene = state.project && findScene(state.project, sceneId);
          if (!scene || !name.trim()) return;
          scene.name = name.trim();
          state.dirty = true;
        }),

      addLayer: (sceneId, kind) => {
        const layer = createLayer(kind);
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          // See addSet3dLayer's comment: a scene shows exactly one virtual
          // set at a time, so a fresh empty set3d layer hides any others.
          if (kind === "set3d") {
            for (const existing of scene.layers) {
              if (existing.props.kind === "set3d") existing.visible = false;
            }
          }
          layer.zIndex = scene.layers.length;
          scene.layers.push(layer);
          state.activeLayerId = layer.id;
          state.dirty = true;
        });
        return layer.id;
      },

      addPrebuiltLayer: (sceneId, layer) => {
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          layer.zIndex = scene.layers.length;
          scene.layers.push(layer);
          state.activeLayerId = layer.id;
          state.dirty = true;
        });
        return layer.id;
      },

      duplicateLayer: (sceneId, layerId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          const index = scene.layers.findIndex((l) => l.id === layerId);
          if (index === -1) return;
          const copy = cloneLayerWithNewIds(scene.layers[index]);
          scene.layers.splice(index + 1, 0, copy);
          scene.layers.forEach((l, i) => (l.zIndex = i));
          state.activeLayerId = copy.id;
          state.dirty = true;
        }),

      addSet3dLayer: (sceneId, layer) => {
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          for (const existing of scene.layers) {
            if (existing.props.kind === "set3d") existing.visible = false;
          }
          layer.zIndex = scene.layers.length;
          scene.layers.push(layer);
          state.activeLayerId = layer.id;
          state.dirty = true;
        });
        return layer.id;
      },

      removeLayer: (sceneId, layerId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          scene.layers = scene.layers.filter((l) => l.id !== layerId);
          scene.layers.forEach((l, i) => (l.zIndex = i));
          if (state.activeLayerId === layerId) state.activeLayerId = null;
          state.selectedElementIds = [];
          state.dirty = true;
        }),

      reorderLayer: (sceneId, layerId, toIndex) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          if (!scene) return;
          const fromIndex = scene.layers.findIndex((l) => l.id === layerId);
          if (fromIndex === -1) return;
          const [layer] = scene.layers.splice(fromIndex, 1);
          scene.layers.splice(toIndex, 0, layer);
          scene.layers.forEach((l, i) => (l.zIndex = i));
          state.dirty = true;
        }),

      setLayerFlag: (sceneId, layerId, flag, value) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer) return;
          layer[flag] = value;
          state.dirty = true;
        }),

      renameLayer: (sceneId, layerId, name) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer) return;
          layer.name = name;
          state.dirty = true;
        }),

      addElement: (sceneId, layerId, element) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          if (!elements) return;
          elements.push(element);
          state.selectedElementIds = [element.id];
          state.dirty = true;
        }),

      duplicateElement: (sceneId, layerId, elementId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer || layer.props.kind !== "gfx2d") return;
          const index = layer.props.elements.findIndex((e) => e.id === elementId);
          if (index === -1) return;
          const copy = duplicateElementValue(layer.props.elements[index]);
          // Insert directly above the original (array order IS z-order).
          layer.props.elements.splice(index + 1, 0, copy);
          state.selectedElementIds = [copy.id];
          state.dirty = true;
        }),

      groupElements: (sceneId, layerId, elementIds) => {
        let newGroupId: ID | null = null;
        set((state) => {
          if (!state.project || elementIds.length < 2) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer || layer.props.kind !== "gfx2d") return;
          // Preserve document (z) order of the grouped children.
          const picked = layer.props.elements
            .map((el, i) => ({ el, i }))
            .filter(({ el }) => elementIds.includes(el.id));
          if (picked.length < 2) return;
          const children = picked.map((p) => p.el);
          // Bounding box of the selection becomes the group's transform.
          const minX = Math.min(...children.map((c) => c.transform.x));
          const minY = Math.min(...children.map((c) => c.transform.y));
          const maxX = Math.max(...children.map((c) => c.transform.x + c.transform.width));
          const maxY = Math.max(...children.map((c) => c.transform.y + c.transform.height));
          // Rebase children to be relative to the group origin so moving/
          // rotating the group moves them as one unit (Konva Group is a
          // coordinate container).
          for (const c of children) {
            c.transform = { ...c.transform, x: c.transform.x - minX, y: c.transform.y - minY };
          }
          const group = createGroupElement({
            name: "Group",
            transform: { x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0 },
            children,
          });
          const insertAt = Math.min(...picked.map((p) => p.i));
          layer.props.elements = layer.props.elements.filter((el) => !elementIds.includes(el.id));
          layer.props.elements.splice(insertAt, 0, group);
          state.selectedElementIds = [group.id];
          state.dirty = true;
          newGroupId = group.id;
        });
        return newGroupId;
      },

      ungroupElement: (sceneId, layerId, groupId) => {
        const freed: ID[] = [];
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer || layer.props.kind !== "gfx2d") return;
          const index = layer.props.elements.findIndex((e) => e.id === groupId);
          const group = index >= 0 ? layer.props.elements[index] : undefined;
          if (!group || group.kind !== "group") return;
          const gx = group.transform.x;
          const gy = group.transform.y;
          const gr = group.transform.rotation;
          // Lift children back to absolute coords. (Group rotation is added to
          // each child's rotation; positional rotation offset is not applied —
          // a documented simplification, fine for the common unrotated group.)
          const lifted = group.children.map((c) => ({
            ...c,
            transform: { ...c.transform, x: c.transform.x + gx, y: c.transform.y + gy, rotation: c.transform.rotation + gr },
          }));
          layer.props.elements.splice(index, 1, ...lifted);
          freed.push(...lifted.map((c) => c.id));
          state.selectedElementIds = freed;
          state.dirty = true;
        });
        return freed;
      },

      reorderElement: (sceneId, layerId, elementId, toIndex) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer || layer.props.kind !== "gfx2d") return;
          const fromIndex = layer.props.elements.findIndex((e) => e.id === elementId);
          if (fromIndex === -1) return;
          const [element] = layer.props.elements.splice(fromIndex, 1);
          layer.props.elements.splice(toIndex, 0, element);
          state.dirty = true;
        }),

      removeElement: (sceneId, layerId, elementId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          if (!layer || layer.props.kind !== "gfx2d") return;
          layer.props.elements = layer.props.elements.filter((e) => e.id !== elementId);
          state.selectedElementIds = state.selectedElementIds.filter((id) => id !== elementId);
          state.dirty = true;
        }),

      updateElement: (sceneId, layerId, elementId, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          const element = elements?.find((e) => e.id === elementId);
          if (!element) return;
          Object.assign(element, updates);
          state.dirty = true;
        }),

      commitTransform: (sceneId, layerId, elementId, transform) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          const element = elements?.find((e) => e.id === elementId);
          if (!element) return;
          element.transform = transform;
          state.dirty = true;
        }),

      setElementBinding: (sceneId, layerId, elementId, binding) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          const element = elements?.find((e) => e.id === elementId);
          if (!element) return;
          element.bindings.push(binding);
          state.dirty = true;
        }),

      updateElementBinding: (sceneId, layerId, elementId, index, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          const element = elements?.find((e) => e.id === elementId);
          const binding = element?.bindings[index];
          if (!binding) return;
          Object.assign(binding, updates);
          state.dirty = true;
        }),

      removeElementBinding: (sceneId, layerId, elementId, index) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const elements = layer && elementsOf(layer);
          const element = elements?.find((e) => e.id === elementId);
          if (!element) return;
          element.bindings.splice(index, 1);
          state.dirty = true;
        }),

      selectElements: (ids) =>
        set((state) => {
          state.selectedElementIds = ids;
          // A real 2D pick supersedes 3D selection in the Inspector; an
          // empty-space click in the GFX editor must NOT deselect 3D.
          if (ids.length > 0) state.selectedNodeId = null;
        }),

      setActiveLayer: (layerId) =>
        set((state) => {
          state.activeLayerId = layerId;
          // Layer selection means "inspect the layer", not a stale node from
          // a previous viewport pick. Clearing both 2D and 3D selections
          // reliably exposes SetSettingsInspector and its surface catalog.
          state.selectedElementIds = [];
          state.selectedNodeId = null;
          state.selectedNodeIds = [];
        }),

      setCanvasView: (view) =>
        set((state) => {
          Object.assign(state.canvas, view);
        }),

      addSetNode: (sceneId, layerId, node) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          props.nodes.push(node);
          state.selectedNodeId = node.id;
          state.dirty = true;
        }),

      replaceSetNodes: (sceneId, layerId, nodes) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          props.nodes = nodes;
          state.dirty = true;
        }),

      removeSetNode: (sceneId, layerId, nodeId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          removeSetNodeIn(props.nodes, nodeId);
          // A deleted camera can't stay the program camera.
          if (props.activeCameraId === nodeId) props.activeCameraId = null;
          if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
          state.dirty = true;
        }),

      updateSetNode: (sceneId, layerId, nodeId, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          const node = props && findSetNode(props.nodes, nodeId);
          if (!node) return;
          Object.assign(node, updates);
          state.dirty = true;
        }),

      setSetNodeBinding: (sceneId, layerId, nodeId, binding) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          const node = props && findSetNode(props.nodes, nodeId);
          if (!node) return;
          if (!node.bindings) node.bindings = [];
          node.bindings.push(binding);
          state.dirty = true;
        }),

      updateSetNodeBinding: (sceneId, layerId, nodeId, index, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          const node = props && findSetNode(props.nodes, nodeId);
          const binding = node?.bindings?.[index];
          if (!binding) return;
          Object.assign(binding, updates);
          state.dirty = true;
        }),

      removeSetNodeBinding: (sceneId, layerId, nodeId, index) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          const node = props && findSetNode(props.nodes, nodeId);
          if (!node?.bindings) return;
          node.bindings.splice(index, 1);
          state.dirty = true;
        }),

      commitNodeTransform: (sceneId, layerId, nodeId, transform) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          const node = props && findSetNode(props.nodes, nodeId);
          if (!node) return;
          node.transform = transform;
          state.dirty = true;
        }),

      setSetEnvironment: (sceneId, layerId, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          Object.assign(props.environment, updates);
          state.dirty = true;
        }),

      setSetRenderSettings: (sceneId, layerId, updates) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          Object.assign(props.render, updates);
          state.dirty = true;
        }),

      setActiveSetCamera: (sceneId, layerId, cameraId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          props.activeCameraId = cameraId;
          state.dirty = true;
        }),

      addAsset: (asset) =>
        set((state) => {
          if (!state.project) return;
          state.project.assets.push(asset);
          state.dirty = true;
        }),

      updateAsset: (assetId, updates) =>
        set((state) => {
          const asset = state.project?.assets.find((a) => a.id === assetId);
          if (!asset) return;
          Object.assign(asset, updates);
          state.dirty = true;
        }),

      setNdiSourceName: (name) =>
        set((state) => {
          if (!state.project) return;
          state.project.ndiSourceName = name;
          state.dirty = true;
        }),

      removeAsset: (assetId) =>
        set((state) => {
          if (!state.project) return;
          state.project.assets = state.project.assets.filter((a) => a.id !== assetId);
          state.dirty = true;
        }),

      addArBuilderAsset: (asset) =>
        set((state) => {
          if (!state.project) return;
          if (!state.project.arBuilderAssets) state.project.arBuilderAssets = [];
          state.project.arBuilderAssets.push(asset);
          state.dirty = true;
        }),

      updateArBuilderAsset: (assetId, updates) =>
        set((state) => {
          if (!state.project?.arBuilderAssets) return;
          const asset = state.project.arBuilderAssets.find((a) => a.id === assetId);
          if (!asset) return;
          Object.assign(asset, updates, { updatedAt: new Date().toISOString() });
          state.dirty = true;
        }),

      removeArBuilderAsset: (assetId) =>
        set((state) => {
          if (!state.project?.arBuilderAssets) return;
          state.project.arBuilderAssets = state.project.arBuilderAssets.filter((a) => a.id !== assetId);
          state.dirty = true;
        }),

      replaceArBuilderAsset: (asset) =>
        set((state) => {
          if (!state.project?.arBuilderAssets) return;
          const idx = state.project.arBuilderAssets.findIndex((a) => a.id === asset.id);
          if (idx === -1) return;
          state.project.arBuilderAssets[idx] = asset;
          state.dirty = true;
        }),

      selectSetNode: (nodeId) =>
        set((state) => {
          state.selectedNodeId = nodeId;
          state.selectedNodeIds = nodeId ? [nodeId] : [];
          if (nodeId) state.selectedElementIds = [];
        }),

      toggleSetNodeSelection: (nodeId) =>
        set((state) => {
          const i = state.selectedNodeIds.indexOf(nodeId);
          if (i >= 0) {
            state.selectedNodeIds.splice(i, 1);
            if (state.selectedNodeId === nodeId) state.selectedNodeId = state.selectedNodeIds[0] ?? null;
          } else {
            state.selectedNodeIds.push(nodeId);
            state.selectedNodeId = nodeId;
            state.selectedElementIds = [];
          }
        }),

      groupSetNodes: (sceneId, layerId, nodeIds) => {
        let newGroupId: ID | null = null;
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          // Top-level siblings only (v1) — matches the 2D groupElements rule.
          const picked = props.nodes.filter((n) => nodeIds.includes(n.id));
          if (picked.length < 2) return;
          const centroid = {
            x: picked.reduce((s, n) => s + n.transform.position.x, 0) / picked.length,
            y: picked.reduce((s, n) => s + n.transform.position.y, 0) / picked.length,
            z: picked.reduce((s, n) => s + n.transform.position.z, 0) / picked.length,
          };
          const insertAt = props.nodes.findIndex((n) => n.id === picked[0].id);
          for (const n of picked) {
            // Rebase group-relative so nothing moves visually (group carries
            // identity rotation/scale, so position-only rebase is exact).
            n.transform.position = {
              x: n.transform.position.x - centroid.x,
              y: n.transform.position.y - centroid.y,
              z: n.transform.position.z - centroid.z,
            };
          }
          const group = createGroupNode(picked, { name: "Group", transform: { position: centroid } });
          // A group of AR nodes stays an AR node (editable in AR surfaces).
          if (picked.every((n) => n.role === "ar")) group.role = "ar";
          const remaining = props.nodes.filter((n) => !nodeIds.includes(n.id));
          remaining.splice(Math.min(insertAt, remaining.length), 0, group);
          props.nodes = remaining;
          state.selectedNodeId = group.id;
          state.selectedNodeIds = [group.id];
          state.dirty = true;
          newGroupId = group.id;
        });
        return newGroupId;
      },

      ungroupSetNode: (sceneId, layerId, groupId) =>
        set((state) => {
          if (!state.project) return;
          const scene = findScene(state.project, sceneId);
          const layer = scene && findLayer(scene, layerId);
          const props = layer && set3dPropsOf(layer);
          if (!props) return;
          const idx = props.nodes.findIndex((n) => n.id === groupId);
          const group = props.nodes[idx];
          if (!group || group.kind !== "group") return;
          const g = group.transform;
          for (const child of group.children) {
            // Fold the group's position (and scale) into each child. Group
            // rotation is intentionally not decomposed in v1 — groups made by
            // groupSetNodes carry identity rotation; a hand-rotated group
            // ungroups at its unrotated placement (stated bound).
            child.transform.position = {
              x: g.position.x + child.transform.position.x * g.scale.x,
              y: g.position.y + child.transform.position.y * g.scale.y,
              z: g.position.z + child.transform.position.z * g.scale.z,
            };
            child.transform.scale = {
              x: child.transform.scale.x * g.scale.x,
              y: child.transform.scale.y * g.scale.y,
              z: child.transform.scale.z * g.scale.z,
            };
          }
          props.nodes.splice(idx, 1, ...group.children);
          state.selectedNodeIds = group.children.map((c) => c.id);
          state.selectedNodeId = state.selectedNodeIds[0] ?? null;
          state.dirty = true;
        }),

      setGizmoMode: (mode) =>
        set((state) => {
          state.gizmoMode = mode;
        }),

      ...createProgramSlice(set, get, store),
      ...createPlaybackSlice(set, get, store),
      ...createCameraMovesSlice(set, get, store),
      ...createArFocusSlice(set, get, store),
    })),
    {
      // Only the document is undoable — selection, active scene/layer,
      // canvas pan/zoom, dirty flag, and PGM/PVW program state are all
      // excluded from undo/redo. programSceneId/previewSceneId living
      // outside `project` is what makes that structural, not conventional.
      partialize: (state) => ({ project: state.project }),
      limit: 100,
      // Without this, every set() call is recorded regardless of whether
      // `project` actually changed — including markSaved() from the
      // autosave subscriber, which only flips `dirty` and fires
      // asynchronously after a real edit. That pushed a same-as-current
      // snapshot onto history, so undo silently popped a no-op instead of
      // the real previous state. Reference equality is enough since immer
      // only produces a new `project` reference when it actually mutates.
      equality: (a, b) => a.project === b.project,
    },
  ),
);

/**
 * Incremental store split bridge. Existing panels retain their selectors from
 * useDocStore while new editor/live surfaces can subscribe to a narrow store.
 * Remove the mirrored fields from Store only after consumers have migrated.
 */
function syncDerivedStores(state: Store) {
  useEditorSessionStore.getState().replaceSnapshot({
    selectedElementIds: state.selectedElementIds,
    selectedNodeId: state.selectedNodeId,
    selectedNodeIds: state.selectedNodeIds,
    activeSceneId: state.activeSceneId,
    activeLayerId: state.activeLayerId,
    canvas: state.canvas,
    gizmoMode: state.gizmoMode,
  });
  useLiveShowStore.getState().replaceSnapshot({
    programSceneId: state.programSceneId,
    previewSceneId: state.previewSceneId,
    lastTakeAt: state.lastTakeAt,
    layerPlayback: state.layerPlayback,
    cameraMoves: state.cameraMoves,
    cameraOrbits: state.cameraOrbits,
    cameraPreview: state.cameraPreview,
    arFocus: state.arFocus,
  });
}

syncDerivedStores(useDocStore.getState());
useDocStore.subscribe(syncDerivedStores);

export function useDocStoreTemporal() {
  return useStore(useDocStore.temporal);
}
