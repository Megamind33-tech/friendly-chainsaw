import { Stage, Layer as KonvaLayer, Group as KonvaGroup } from "react-konva";
import type { Project } from "@/document/types";
import type { LayerPlayback } from "@/document/playbackState";
import type { CameraMove, CameraOrbit } from "@/document/cameraMoves";
import type { ArFocus } from "@/document/arFocus";
import { applyPlayback, applyScroll, applyElementLoop, hasAnyLoopPulse, elapsedSeconds, isPlaybackActive, useAnimationTicker } from "@/document/timelineEngine";
import { useRegisterFonts } from "@/document/fonts";
import { renderElement } from "./renderNodes";
import { Set3dRenderer } from "@/components/set3d/Set3dRenderer";

interface DocumentRendererProps {
  project: Project | null;
  sceneId?: string;
  width?: number;
  height?: number;
  /** Konva stage scale (content is authored in project-resolution space).
   * Defaults to 1:1, unscaled — ProgramView relies on that default since
   * its window matches project resolution exactly. PreviewView passes a
   * computed fit-scale since its window is smaller. */
  scale?: number;
  /** Per-layer IN/OUT playback state, as pushed in the envelope (see
   * persistence.ts). A `gfx2d` layer with a `timeline` only appears once
   * it has an entry here — on-air visibility is gated by an explicit Play
   * In/Out command, not just `layer.visible` (unlike the GfxEditor, which
   * always shows a layer at rest for authoring). */
  layerPlayback?: Record<string, LayerPlayback>;
  /** On-air scene ids, as pushed in the envelope — needed only for
   * `program`/`preview` confidence-monitor videofeed sources (see
   * ConfidenceMonitorView in SetNodes.tsx). */
  programSceneId?: string | null;
  previewSceneId?: string | null;
  /** True only when this render IS the Program window — the sole place a
   * video/live source's real audio plays. ProgramView passes true; every
   * other consumer (PreviewView, and by extension the editor, which never
   * renders through DocumentRenderer at all) leaves this false so authoring
   * and monitoring never produce audio. Defaults to false. */
  audible?: boolean;
  /** Transient camera motion from the envelope (see cameraMoves.ts). */
  cameraMoves?: Record<string, CameraMove>;
  cameraOrbits?: Record<string, CameraOrbit>;
  /** layer id -> camera id being rehearsed. Only honored when
   * `role === "preview"` — Program never renders a rehearsal camera. */
  cameraPreview?: Record<string, string>;
  /** Which monitor this render is: preview honors `cameraPreview` (camera
   * rehearsal before take), program ignores it. Defaults to "program". */
  role?: "program" | "preview";
  /** Live AR focus/isolate per layer (see arFocus.ts). */
  arFocus?: Record<string, ArFocus>;
}

/**
 * Non-interactive consumer of the shared renderNodes builder — the
 * "renderer" half of the editor/renderer split. Used by ProgramView/
 * PreviewView (and, in Rust, mirrored server-side for the OBS-facing
 * sidecar route — which does not yet apply playback gating or animation;
 * see PLAN.md's Phase 3 notes). No selection, no Transformer, no editor
 * chrome: it paints exactly what the document (plus playback state) says.
 */
export function DocumentRenderer({
  project,
  sceneId,
  width,
  height,
  scale = 1,
  layerPlayback = {},
  programSceneId = null,
  previewSceneId = null,
  audible = false,
  cameraMoves = {},
  cameraOrbits = {},
  cameraPreview = {},
  role = "program",
  arFocus = {},
}: DocumentRendererProps) {
  const scene = project ? (sceneId ? project.scenes.find((s) => s.id === sceneId) : project.scenes[0]) : undefined;
  // Program/Preview are separate windows, each fetching /document
  // independently — each must register the project's fonts itself.
  useRegisterFonts(project?.assets);

  // A ticker (scrollSpeed) keeps needing frames for as long as it's on-air
  // (has a playback entry) — unlike IN/OUT, scrolling has no settled end state.
  const anyPlaybackActive =
    Object.entries(layerPlayback).some(([layerId, pb]) => {
      const l = scene?.layers.find((ly) => ly.id === layerId);
      if (!l) return false;
      if (l.scrollSpeed) return true;
      return !!l.timeline && isPlaybackActive(elapsedSeconds(pb), l.timeline, pb.phase);
    }) || (scene ? hasAnyLoopPulse(scene.layers) : false);
  useAnimationTicker(anyPlaybackActive);

  if (!project || !scene) return null;

  const rawWidth = width ?? project.resolution.width;
  const rawHeight = height ?? project.resolution.height;
  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  // Virtual sets are the base environment; 2D graphics composite on top.
  // Each set3d layer is its own WebGL canvas stacked in zIndex order under
  // the single Konva stage (a set3d layer *above* a gfx2d layer would still
  // render beneath it — a documented v1 simplification; in broadcast
  // practice the set is always the backplate).
  const setLayers = sortedLayers.filter((l) => l.visible && l.props.kind === "set3d");

  return (
    <div style={{ position: "relative", width: rawWidth * scale, height: rawHeight * scale, overflow: "hidden" }}>
      {setLayers.map((layer) => (
        <div key={layer.id} style={{ position: "absolute", inset: 0, opacity: layer.opacity }}>
          <Set3dRenderer
            layer={layer}
            assets={project.assets}
            project={project}
            programSceneId={programSceneId}
            previewSceneId={previewSceneId}
            audible={audible}
            cameraMove={cameraMoves[layer.id] ?? null}
            cameraOrbit={cameraOrbits[layer.id] ?? null}
            activeCameraOverride={role === "preview" ? (cameraPreview[layer.id] ?? null) : null}
            playback={layerPlayback[layer.id] ?? null}
            arFocus={arFocus[layer.id] ?? null}
          />
        </div>
      ))}
      <div style={{ position: "absolute", top: 0, left: 0 }}>
        <Stage width={rawWidth * scale} height={rawHeight * scale} scaleX={scale} scaleY={scale} listening={false}>
          <KonvaLayer listening={false}>
            {sortedLayers.map((layer) => {
              if (!layer.visible || layer.props.kind !== "gfx2d") return null;
              const playback = layerPlayback[layer.id];
              // A timelined layer is off-air until it's actually been triggered.
              if (layer.timeline && !playback) return null;
              return (
                <KonvaGroup key={layer.id} opacity={layer.opacity} listening={false}>
                  {layer.props.elements.map((el) => {
                    let resolved =
                      layer.timeline && playback
                        ? applyPlayback(el, elapsedSeconds(playback), layer.timeline, playback.phase)
                        : el;
                    if (layer.scrollSpeed && playback) {
                      resolved = applyScroll(resolved, elapsedSeconds(playback), layer.scrollSpeed, layer.transform.width);
                    }
                    resolved = applyElementLoop(resolved, Date.now() / 1000);
                    return renderElement(resolved, { interactive: false, audible, assets: project.assets });
                  })}
                </KonvaGroup>
              );
            })}
          </KonvaLayer>
        </Stage>
      </div>
    </div>
  );
}
