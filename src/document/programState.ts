import type { StateCreator } from "zustand";
import type { ID } from "./types";
import type { Store } from "./store";
import { flattenArSetNodes } from "@/ar-engine/nodeUtils";

/**
 * PGM/PVW state — a sibling of `project`, not a child of it. zundo's
 * `partialize` in store.ts only ever sees `state.project`, so this slice
 * is excluded from undo/redo history by construction: there is no guard
 * to forget, no equality check to get wrong. Persisted separately (a
 * `program` column, distinct from the document blob) on a faster debounce
 * than content autosave — see persistence.ts.
 */
export interface ProgramSlice {
  programSceneId: ID | null;
  previewSceneId: ID | null;
  lastTakeAt: number | null;

  /** Arms a scene in Preview. Does not touch Program. */
  armPreview: (sceneId: ID) => void;
  /**
   * Phase 2: an instant alias of cut(), kept as its own named action/button
   * so Phase 3 can give it a real animated transition while cut() stays a
   * hard instant switch — zero rename churn later.
   */
  take: () => void;
  /** No-ops when preview is unarmed or already equals program. */
  cut: () => void;
  /** Sets program and preview to the same scene directly — used only to
   * seed a brand-new project, not a live operator action. */
  setProgramDirect: (sceneId: ID) => void;
  /** Restores program/preview from persisted state on load. Bypasses
   * cut()'s no-op guard since this isn't a live operator action. */
  hydrateProgramState: (state: { programSceneId: ID | null; previewSceneId: ID | null }) => void;
}

type Immer = ["zustand/immer", never];

export const createProgramSlice: StateCreator<Store, [Immer], [], ProgramSlice> = (set, get) => ({
  programSceneId: null,
  previewSceneId: null,
  lastTakeAt: null,

  armPreview: (sceneId) =>
    set((state) => {
      state.previewSceneId = sceneId;
    }),

  cut: () => {
    const { previewSceneId, programSceneId } = get();
    if (previewSceneId === null || previewSceneId === programSceneId) return;
    set((state) => {
      state.programSceneId = state.previewSceneId;
      state.lastTakeAt = Date.now();
      const scene = state.project?.scenes.find((s) => s.id === state.previewSceneId);
      if (!scene) return;
      const activeLayerIds = new Set(scene.layers.map((l) => l.id));
      for (const id of Object.keys(state.layerPlayback)) {
        if (!activeLayerIds.has(id)) delete state.layerPlayback[id];
      }
      for (const layer of scene.layers) {
        if (layer.props.kind !== "set3d") continue;
        const hasAnim = flattenArSetNodes(layer.props.nodes).some(
          (n) => n.role === "ar" && n.animation && n.animation.preset !== "none",
        );
        if (hasAnim) {
          state.layerPlayback[layer.id] = { phase: "in", startedAt: Date.now() };
        }
      }
    });
  },

  take: () => {
    get().cut();
  },

  setProgramDirect: (sceneId) =>
    set((state) => {
      state.programSceneId = sceneId;
      state.previewSceneId = sceneId;
      state.lastTakeAt = Date.now();
    }),

  hydrateProgramState: ({ programSceneId, previewSceneId }) =>
    set((state) => {
      state.programSceneId = programSceneId;
      state.previewSceneId = previewSceneId;
    }),
});
