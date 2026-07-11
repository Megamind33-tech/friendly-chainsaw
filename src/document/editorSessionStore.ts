import { create } from "zustand";
import type { ID } from "./types";

/** Ephemeral authoring state: never persisted, never sent to Program. */
export interface EditorSessionSnapshot {
  selectedElementIds: ID[];
  selectedNodeId: ID | null;
  selectedNodeIds: ID[];
  activeSceneId: ID | null;
  activeLayerId: ID | null;
  canvas: { zoom: number; panX: number; panY: number };
  gizmoMode: "translate" | "rotate" | "scale";
}

interface EditorSessionState extends EditorSessionSnapshot {
  replaceSnapshot: (snapshot: EditorSessionSnapshot) => void;
}

/**
 * Dedicated editor-session store. The document-store bridge keeps this in
 * sync while existing panels migrate selector-by-selector without a risky
 * flag day. New editor-only code should subscribe here.
 */
export const useEditorSessionStore = create<EditorSessionState>((set) => ({
  selectedElementIds: [],
  selectedNodeId: null,
  selectedNodeIds: [],
  activeSceneId: null,
  activeLayerId: null,
  canvas: { zoom: 1, panX: 0, panY: 0 },
  gizmoMode: "translate",
  replaceSnapshot: (snapshot) => set(snapshot),
}));
