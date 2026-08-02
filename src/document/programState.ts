import type { StateCreator } from "zustand";
import type { ID } from "./types";
import type { Store } from "./store";
import { flattenArSetNodes } from "@/ar-engine/nodeUtils";
import {
  clampCutAt,
  clampSoftness,
  clampTransitionMs,
  DEFAULT_TRANSITION_EASE,
  DEFAULT_TRANSITION_SETTINGS,
  type SceneTransition,
  type TransitionSettings,
  type TransitionType,
} from "./sceneTransition";

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
  /** In-flight scene transition, or null. Transient — never persisted, and
   * excluded from undo along with the rest of this slice. */
  transition: SceneTransition | null;
  /** The transition a bare `take()` uses when the caller names none. */
  defaultTransition: TransitionSettings;

  /** Arms a scene in Preview. Does not touch Program. */
  armPreview: (sceneId: ID) => void;
  /**
   * Take Preview to Program through a timed transition.
   *
   * The Phase 2 seam ("an instant alias of cut(), kept as its own named
   * action so Phase 3 can give it a real animated transition") is now filled
   * in. `cut()` is untouched and still a hard instant switch.
   *
   * Overrides are per-take; omit them to use `defaultTransition`. Passing
   * `{ type: "cut" }` degrades to a hard cut, which is what a control surface
   * with a dedicated CUT button should send.
   */
  take: (override?: Partial<TransitionSettings> & { ease?: string }) => void;
  /** No-ops when preview is unarmed or already equals program. */
  cut: () => void;
  setDefaultTransition: (settings: Partial<TransitionSettings>) => void;
  /** Drops a settled transition record so it stops riding the envelope.
   * Rendering is already correct without this — a completed record renders as
   * the settled end state — so this is housekeeping, never correctness. */
  clearTransition: () => void;
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
  transition: null,
  defaultTransition: { ...DEFAULT_TRANSITION_SETTINGS },

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
      // A cut is a hard switch: it snaps any in-flight mix. `take()` calls
      // cut() first and then installs its own record, so this does not fight
      // it. A CUT button pressed mid-dissolve is an operator saying "now" —
      // it must not leave the previous scene half-visible.
      state.transition = null;
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

  take: (override) => {
    const { previewSceneId, programSceneId, defaultTransition } = get();
    // Same guard as cut(): nothing armed, or already on air, is a no-op — and
    // must not leave a transition record behind either.
    if (previewSceneId === null || previewSceneId === programSceneId) return;

    const requestedType: TransitionType = override?.type ?? defaultTransition.type;
    const stingerAssetId = override?.stingerAssetId ?? defaultTransition.stingerAssetId;
    // A stinger with no clip selected has nothing to hide the cut behind.
    // Degrade to a hard cut rather than mixing to an empty overlay — an
    // operator must never get a transition that silently shows nothing.
    const type: TransitionType =
      requestedType === "stinger" && !stingerAssetId ? "cut" : requestedType;
    const durationMs = clampTransitionMs(override?.durationMs ?? defaultTransition.durationMs);
    const fromSceneId = programSceneId;
    // Snapshot BEFORE cut() prunes playback to the incoming scene's layers —
    // see SceneTransition.fromLayerPlayback for why the outgoing scene needs
    // its own copy.
    const fromLayerPlayback = { ...get().layerPlayback };

    // Commit the end state FIRST, exactly as a camera move does. Program is
    // on the incoming scene from this instant, so any consumer that never
    // renders an in-between frame is already correct.
    get().cut();

    // A cut, or a take with nothing to mix from (cold start — Program had no
    // scene), animates nothing. Note this is checked AFTER cut() so the take
    // still happens; only the animation is skipped.
    if (type === "cut" || fromSceneId === null) {
      set((state) => {
        state.transition = null;
      });
      return;
    }

    // A take landing mid-transition replaces the in-flight record outright
    // rather than stacking or blending three scenes. The previous outgoing
    // scene is dropped immediately — deterministic, and it cannot leave a
    // stuck blend, which is the failure mode that actually hurts on air.
    set((state) => {
      state.transition = {
        type,
        fromSceneId,
        toSceneId: state.programSceneId!,
        durationMs,
        ease: override?.ease ?? DEFAULT_TRANSITION_EASE,
        startedAt: Date.now(),
        fromLayerPlayback,
        softness: clampSoftness(override?.softness ?? defaultTransition.softness),
        ...(type === "stinger" && stingerAssetId
          ? { stingerAssetId, cutAt: clampCutAt(override?.cutAt ?? defaultTransition.cutAt) }
          : {}),
      };
    });
  },

  setDefaultTransition: (settings) =>
    set((state) => {
      if (settings.type !== undefined) state.defaultTransition.type = settings.type;
      if (settings.durationMs !== undefined) {
        state.defaultTransition.durationMs = clampTransitionMs(settings.durationMs);
      }
      if (settings.softness !== undefined) {
        state.defaultTransition.softness = clampSoftness(settings.softness);
      }
      if (settings.stingerAssetId !== undefined) {
        state.defaultTransition.stingerAssetId = settings.stingerAssetId;
      }
      if (settings.cutAt !== undefined) {
        state.defaultTransition.cutAt = clampCutAt(settings.cutAt);
      }
    }),

  clearTransition: () =>
    set((state) => {
      state.transition = null;
    }),

  setProgramDirect: (sceneId) =>
    set((state) => {
      state.programSceneId = sceneId;
      state.previewSceneId = sceneId;
      state.lastTakeAt = Date.now();
      state.transition = null;
    }),

  hydrateProgramState: ({ programSceneId, previewSceneId }) =>
    set((state) => {
      state.programSceneId = programSceneId;
      state.previewSceneId = previewSceneId;
      // Nothing is mid-mix on a fresh load, by definition.
      state.transition = null;
    }),
});
