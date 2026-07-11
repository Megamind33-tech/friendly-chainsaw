import { create } from "zustand";

/**
 * Workspace pages (the Phase A reorg) — the Control Room used to be one
 * ~12-panel dockview fighting over a single window. Each workspace now owns
 * its own dockview instance/layout and a curated, small panel set, so the
 * hero surface (GFX canvas, 3D/AR viewport, data grid, monitors...) actually
 * gets room. A persistent shell above the workspaces carries the
 * always-reachable show controls (ON-AIR, Take/Cut, NDI) so they're never
 * locked inside whichever page happens to be active.
 */
export type WorkspaceId = "design" | "studio" | "ar" | "builder" | "data" | "timeline" | "playout" | "show";

const STORAGE_KEY = "workspace-active-v1";
const VALID_IDS: WorkspaceId[] = ["design", "studio", "ar", "builder", "data", "timeline", "playout", "show"];

function loadInitial(): WorkspaceId {
  const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return (VALID_IDS as string[]).includes(saved ?? "") ? (saved as WorkspaceId) : "design";
}

interface WorkspaceUiState {
  active: WorkspaceId;
  setActive: (id: WorkspaceId) => void;
}

export const useWorkspaceStore = create<WorkspaceUiState>((set) => ({
  active: loadInitial(),
  setActive: (id) => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    set({ active: id });
  },
}));
