import { create } from "zustand";
import type { ArCanvasTool, ArCanvasViewMode, ArImageAdjustments, ArWorkflowStep } from "./types";
import { DEFAULT_ADJUSTMENTS } from "./constants";

interface ArAssetBuilderSession {
  activeAssetId: string | null;
  selectedLayerIds: string[];
  activeTool: ArCanvasTool;
  viewMode: ArCanvasViewMode;
  workflowStep: ArWorkflowStep;
  showGrid: boolean;
  showSafeAreas: boolean;
  showGuides: boolean;
  snapEnabled: boolean;
  zoom: number;
  panX: number;
  panY: number;
  librarySearch: string;
  libraryCategory: string | null;
  libraryFilter: "all" | "favorites" | "imported" | "templates";
  adjustments: ArImageAdjustments;
  bgRemovalBusy: boolean;
  bgRemovalProgress: { phase: string; progress: number } | null;
  statusMessage: string | null;
  errorMessage: string | null;
  cropRect: { x: number; y: number; width: number; height: number } | null;

  setActiveAssetId: (id: string | null) => void;
  setSelectedLayerIds: (ids: string[]) => void;
  selectLayer: (id: string, additive?: boolean) => void;
  setActiveTool: (tool: ArCanvasTool) => void;
  setViewMode: (mode: ArCanvasViewMode) => void;
  setWorkflowStep: (step: ArWorkflowStep) => void;
  setShowGrid: (v: boolean) => void;
  setShowSafeAreas: (v: boolean) => void;
  setShowGuides: (v: boolean) => void;
  setSnapEnabled: (v: boolean) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  setLibrarySearch: (s: string) => void;
  setLibraryCategory: (c: string | null) => void;
  setLibraryFilter: (f: "all" | "favorites" | "imported" | "templates") => void;
  setAdjustments: (a: Partial<ArImageAdjustments>) => void;
  setBgRemovalBusy: (v: boolean) => void;
  setBgRemovalProgress: (p: { phase: string; progress: number } | null) => void;
  setStatusMessage: (m: string | null) => void;
  setErrorMessage: (m: string | null) => void;
  setCropRect: (r: { x: number; y: number; width: number; height: number } | null) => void;
}

export const useArAssetBuilderSession = create<ArAssetBuilderSession>((set, get) => ({
  activeAssetId: null,
  selectedLayerIds: [],
  activeTool: "select",
  viewMode: "2d",
  workflowStep: "import",
  showGrid: true,
  showSafeAreas: true,
  showGuides: true,
  snapEnabled: true,
  zoom: 1,
  panX: 0,
  panY: 0,
  librarySearch: "",
  libraryCategory: null,
  libraryFilter: "all",
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  bgRemovalBusy: false,
  bgRemovalProgress: null,
  statusMessage: null,
  errorMessage: null,
  cropRect: null,

  setActiveAssetId: (id) => set({ activeAssetId: id, selectedLayerIds: [] }),
  setSelectedLayerIds: (ids) => set({ selectedLayerIds: ids }),
  selectLayer: (id, additive) => {
    const current = get().selectedLayerIds;
    if (additive) {
      set({ selectedLayerIds: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] });
    } else {
      set({ selectedLayerIds: [id] });
    }
  },
  setActiveTool: (tool) => set({ activeTool: tool }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setWorkflowStep: (step) => set({ workflowStep: step }),
  setShowGrid: (v) => set({ showGrid: v }),
  setShowSafeAreas: (v) => set({ showSafeAreas: v }),
  setShowGuides: (v) => set({ showGuides: v }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(8, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setLibrarySearch: (s) => set({ librarySearch: s }),
  setLibraryCategory: (c) => set({ libraryCategory: c }),
  setLibraryFilter: (f) => set({ libraryFilter: f }),
  setAdjustments: (a) => set({ adjustments: { ...get().adjustments, ...a } }),
  setBgRemovalBusy: (v) => set({ bgRemovalBusy: v }),
  setBgRemovalProgress: (p) => set({ bgRemovalProgress: p }),
  setStatusMessage: (m) => set({ statusMessage: m, errorMessage: null }),
  setErrorMessage: (m) => set({ errorMessage: m, statusMessage: null }),
  setCropRect: (r) => set({ cropRect: r }),
}));
