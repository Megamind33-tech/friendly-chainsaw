import { create } from "zustand";
import type { CameraMove, CameraOrbit } from "./cameraMoves";
import type { LayerPlayback } from "./playbackState";
import type { ID } from "./types";

/** Structural mirror avoids coupling the session store to AR command code. */
type ArFocusSnapshot = { nodeIds: ID[]; startedAt: number };

/** Transient programme state: never undoable and never part of editor UI. */
export interface LiveShowSnapshot {
  programSceneId: ID | null;
  previewSceneId: ID | null;
  lastTakeAt: number | null;
  layerPlayback: Record<ID, LayerPlayback>;
  cameraMoves: Record<ID, CameraMove>;
  cameraOrbits: Record<ID, CameraOrbit>;
  cameraPreview: Record<ID, ID>;
  arFocus: Record<ID, ArFocusSnapshot>;
}

interface LiveShowState extends LiveShowSnapshot {
  replaceSnapshot: (snapshot: LiveShowSnapshot) => void;
}

/**
 * Dedicated live-show store. It is a compatibility mirror until all legacy
 * panels move off useDocStore; Program-facing code can already consume this
 * state without observing authoring selections or dirty flags.
 */
export const useLiveShowStore = create<LiveShowState>((set) => ({
  programSceneId: null,
  previewSceneId: null,
  lastTakeAt: null,
  layerPlayback: {},
  cameraMoves: {},
  cameraOrbits: {},
  cameraPreview: {},
  arFocus: {},
  replaceSnapshot: (snapshot) => set(snapshot),
}));
