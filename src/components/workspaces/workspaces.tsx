import type { DockviewReadyEvent } from "dockview-react";
import type { WorkspaceId } from "@/document/workspace";
import { GfxEditorPanel } from "@/components/panels/GfxEditorPanel";
import { LayersPanel } from "@/components/panels/LayersPanel";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { TemplatesPanel } from "@/components/panels/TemplatesPanel";
import { ShapesPanel } from "@/components/panels/ShapesPanel";
import { AssetBrowserPanel } from "@/components/panels/AssetBrowserPanel";
import { VirtualSetPanel } from "@/components/panels/VirtualSetPanel";
import { CamerasPanel } from "@/components/panels/CamerasPanel";
import { LightingPanel } from "@/components/panels/LightingPanel";
import { ARAuthorPanel } from "@/components/panels/ARAuthorPanel";
import { ARViewportPanel } from "@/components/panels/ARViewportPanel";
import { ArPalettePanel } from "@/components/panels/ArPalettePanel";
import { ArStagePanel } from "@/components/panels/ArStagePanel";
import { ArTimelinePanel } from "@/components/panels/ArTimelinePanel";
import { DataSourcesPanel } from "@/components/panels/DataSourcesPanel";
import { DataBindingsPanel } from "@/components/panels/DataBindingsPanel";
import { MonitorsPanel } from "@/components/panels/MonitorsPanel";
import { ProgramControlPanel } from "@/components/panels/ProgramControlPanel";
import { OutputStreamingPanel } from "@/components/panels/OutputStreamingPanel";
import { NdiPanel } from "@/components/panels/NdiPanel";
import { TimelinePanel } from "@/components/panels/TimelinePanel";
import { PlayoutPanel } from "@/components/panels/PlayoutPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";

/**
 * Per-workspace dockview config (Phase A reorg). Each entry is one page's
 * component map + default layout — the panels themselves are unchanged, only
 * how they're grouped changed. `storageKey` is versioned per workspace so a
 * layout shape change only invalidates that one page's saved layout, not
 * every page's.
 */
export interface WorkspaceConfig {
  id: WorkspaceId;
  storageKey: string;
  components: Record<string, React.FunctionComponent<any>>;
  buildLayout: (event: DockviewReadyEvent) => void;
}

const designConfig: WorkspaceConfig = {
  id: "design",
  storageKey: "workspace-design-layout-v2",
  components: {
    "gfx-editor": GfxEditorPanel,
    layers: LayersPanel,
    inspector: InspectorPanel,
    templates: TemplatesPanel,
    shapes: ShapesPanel,
    "asset-browser": AssetBrowserPanel,
  },
  buildLayout(event) {
    const gfx = event.api.addPanel({ id: "gfx-editor", component: "gfx-editor", title: "GFX Editor" });
    const layers = event.api.addPanel({
      id: "layers",
      component: "layers",
      title: "Layers",
      position: { referencePanel: gfx, direction: "below" },
    });
    event.api.addPanel({
      id: "templates",
      component: "templates",
      title: "Templates",
      position: { referencePanel: layers, direction: "within" },
    });
    event.api.addPanel({
      id: "shapes",
      component: "shapes",
      title: "Shapes",
      position: { referencePanel: layers, direction: "within" },
    });
    event.api.addPanel({
      id: "asset-browser",
      component: "asset-browser",
      title: "Assets",
      position: { referencePanel: layers, direction: "within" },
    });
    layers.api.setActive();
    event.api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: layers, direction: "right" },
    });
  },
};

const studioConfig: WorkspaceConfig = {
  id: "studio",
  // v3: LightingPanel added (tabbed with Cameras).
  storageKey: "workspace-studio-layout-v3",
  components: {
    "virtual-set": VirtualSetPanel,
    cameras: CamerasPanel,
    lighting: LightingPanel,
    inspector: InspectorPanel,
    "asset-browser": AssetBrowserPanel,
  },
  buildLayout(event) {
    const set = event.api.addPanel({ id: "virtual-set", component: "virtual-set", title: "Virtual Set" });
    const assets = event.api.addPanel({
      id: "asset-browser",
      component: "asset-browser",
      title: "Assets",
      position: { referencePanel: set, direction: "below" },
    });
    const cameras = event.api.addPanel({
      id: "cameras",
      component: "cameras",
      title: "Cameras",
      position: { referencePanel: set, direction: "right" },
    });
    // Tabbed with Cameras — both are per-set show-control surfaces.
    event.api.addPanel({
      id: "lighting",
      component: "lighting",
      title: "Lighting",
      position: { referencePanel: cameras, direction: "within" },
    });
    event.api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: cameras, direction: "below" },
    });
    cameras.api.setActive();
    assets.api.setActive();
  },
};

const arConfig: WorkspaceConfig = {
  id: "ar",
  // v2: split preview (view-only) + dedicated AR Author panel.
  storageKey: "workspace-ar-layout-v3",
  components: {
    "ar-viewport": ARViewportPanel,
    "ar-author": ARAuthorPanel,
  },
  buildLayout(event) {
    const viewport = event.api.addPanel({ id: "ar-viewport", component: "ar-viewport", title: "AR Preview" });
    const author = event.api.addPanel({
      id: "ar-author",
      component: "ar-author",
      title: "AR Author",
      position: { referencePanel: viewport, direction: "right" },
    });
    author.api.setActive();
  },
};

/** AR BUILDER — the After-Effects-style from-scratch authoring surface, per
 * the project brief: element PALETTE (drag-and-drop 2.5D building blocks)
 * left, the gizmo-editable AR STAGE center, one real INSPECTOR right, and
 * the per-node ANIMATION TIMELINE below. Four working surfaces, no wizard
 * steps, no template picking, no duplicate inspectors — v2's merged
 * asset-wizard layout was operator-rejected as demo-like drift. */
const builderConfig: WorkspaceConfig = {
  id: "builder",
  storageKey: "workspace-builder-layout-v3",
  components: {
    "ar-palette": ArPalettePanel,
    "ar-stage": ArStagePanel,
    "ar-timeline": ArTimelinePanel,
    inspector: InspectorPanel,
  },
  buildLayout(event) {
    const stage = event.api.addPanel({ id: "ar-stage", component: "ar-stage", title: "AR Stage" });
    event.api.addPanel({
      id: "ar-palette",
      component: "ar-palette",
      title: "Palette",
      position: { referencePanel: stage, direction: "left" },
      initialWidth: 250,
    });
    event.api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      position: { referencePanel: stage, direction: "right" },
      initialWidth: 300,
    });
    event.api.addPanel({
      id: "ar-timeline",
      component: "ar-timeline",
      title: "Animation Timeline",
      position: { referencePanel: stage, direction: "below" },
      initialHeight: 240,
    });
    stage.api.setActive();
  },
};

const dataConfig: WorkspaceConfig = {
  id: "data",
  storageKey: "workspace-data-layout-v2",
  components: {
    "data-sources": DataSourcesPanel,
    "data-bindings": DataBindingsPanel,
  },
  buildLayout(event) {
    const sources = event.api.addPanel({ id: "data-sources", component: "data-sources", title: "Data Sources" });
    event.api.addPanel({
      id: "data-bindings",
      component: "data-bindings",
      title: "Data Bindings",
      position: { referencePanel: sources, direction: "right" },
      initialWidth: 420,
    });
  },
};

const showConfig: WorkspaceConfig = {
  id: "show",
  storageKey: "workspace-show-layout-v1",
  components: {
    monitors: MonitorsPanel,
    "program-control": ProgramControlPanel,
    "output-streaming": OutputStreamingPanel,
    ndi: NdiPanel,
  },
  buildLayout(event) {
    const monitors = event.api.addPanel({ id: "monitors", component: "monitors", title: "Monitors" });
    const programControl = event.api.addPanel({
      id: "program-control",
      component: "program-control",
      title: "Program Control",
      position: { referencePanel: monitors, direction: "below" },
    });
    const outputStreaming = event.api.addPanel({
      id: "output-streaming",
      component: "output-streaming",
      title: "Broadcast Output",
      position: { referencePanel: programControl, direction: "right" },
    });
    event.api.addPanel({
      id: "ndi",
      component: "ndi",
      title: "NDI",
      position: { referencePanel: outputStreaming, direction: "within" },
    });
  },
};

const timelineConfig: WorkspaceConfig = {
  id: "timeline",
  storageKey: "workspace-timeline-layout-v1",
  components: {
    timeline: TimelinePanel,
    "program-control": ProgramControlPanel,
    layers: LayersPanel,
  },
  buildLayout(event) {
    const timeline = event.api.addPanel({ id: "timeline", component: "timeline", title: "Timeline" });
    const programControl = event.api.addPanel({
      id: "program-control",
      component: "program-control",
      title: "Program Control",
      position: { referencePanel: timeline, direction: "right" },
    });
    event.api.addPanel({
      id: "layers",
      component: "layers",
      title: "Layers",
      position: { referencePanel: programControl, direction: "below" },
    });
  },
};

const playoutConfig: WorkspaceConfig = {
  id: "playout",
  // Layout key bumped from v1 → v2: adding the Automation panel means any
  // persisted layout from before it existed would render an empty tab
  // instead of picking up the new default. Same pattern as Phase 5.7's
  // scorebug builder layout bump.
  storageKey: "workspace-playout-layout-v2",
  components: {
    playout: PlayoutPanel,
    monitors: MonitorsPanel,
    automation: AutomationPanel,
  },
  buildLayout(event) {
    const playout = event.api.addPanel({ id: "playout", component: "playout", title: "Playout" });
    event.api.addPanel({
      id: "monitors",
      component: "monitors",
      title: "Monitors",
      position: { referencePanel: playout, direction: "below" },
    });
    event.api.addPanel({
      id: "automation",
      component: "automation",
      title: "Automation",
      position: { referencePanel: playout, direction: "right" },
    });
  },
};

export const DOCKVIEW_WORKSPACES: Record<
  "design" | "studio" | "ar" | "builder" | "data" | "timeline" | "playout" | "show",
  WorkspaceConfig
> = {
  design: designConfig,
  studio: studioConfig,
  ar: arConfig,
  builder: builderConfig,
  data: dataConfig,
  timeline: timelineConfig,
  playout: playoutConfig,
  show: showConfig,
};
