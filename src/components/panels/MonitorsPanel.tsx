import { useEffect, useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { useLiveShowStore } from "@/document/liveShowStore";
import { DocumentRenderer } from "@/components/gfx/DocumentRenderer";

/** Fit-scales a project-resolution frame into whatever box it's given —
 * same math as the standalone ProgramView/PreviewView windows. */
function useFitScale(projW: number, projH: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(size.width / projW, size.height / projH, 1) || 1;
  return { ref, scale };
}

function MonitorFrame({ label, tone, sceneId }: { label: string; tone: "program" | "preview"; sceneId: string | null }) {
  const project = useDocStore((s) => s.project);
  const layerPlayback = useLiveShowStore((s) => s.layerPlayback);
  const programSceneId = useLiveShowStore((s) => s.programSceneId);
  const previewSceneId = useLiveShowStore((s) => s.previewSceneId);
  const cameraMoves = useLiveShowStore((s) => s.cameraMoves);
  const cameraOrbits = useLiveShowStore((s) => s.cameraOrbits);
  const cameraPreview = useLiveShowStore((s) => s.cameraPreview);
  const arFocus = useLiveShowStore((s) => s.arFocus);
  const projW = project?.resolution.width ?? 1920;
  const projH = project?.resolution.height ?? 1080;
  const { ref, scale } = useFitScale(projW, projH);

  const accent = tone === "program" ? "text-live-red" : "text-accent-blue-bright";
  const border = tone === "program" ? "border-live-red/50" : "border-accent-blue/50";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] font-semibold tracking-wide ${accent}`}>{label}</span>
        {sceneId && <span className="truncate font-mono text-[10px] text-text-muted">{project?.scenes.find((s) => s.id === sceneId)?.name}</span>}
      </div>
      <div ref={ref} className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded border bg-bg-deepest ${border}`}>
        {project && sceneId ? (
          // No `audible` prop (defaults false), even for the PROGRAM tile:
          // the standalone Program window is a SEPARATE Tauri window with
          // its own real audio output. Making this embedded tile audible
          // too would double/echo any live source's audio when both are
          // open — this multiviewer is a visual monitor only.
          <DocumentRenderer
            project={project}
            sceneId={sceneId}
            scale={scale}
            layerPlayback={layerPlayback}
            programSceneId={programSceneId}
            previewSceneId={previewSceneId}
            cameraMoves={cameraMoves}
            cameraOrbits={cameraOrbits}
            cameraPreview={cameraPreview}
            arFocus={arFocus}
            role={tone}
          />
        ) : (
          <span className="font-mono text-[10px] text-text-muted">no {tone} scene armed</span>
        )}
      </div>
    </div>
  );
}

/**
 * Embedded PGM/PVW monitors for the Show workspace — the same
 * DocumentRenderer pipeline the standalone Program/Preview windows use,
 * driven directly off the live store (not the polled HTTP envelope those
 * windows use, since this panel lives in-process already) so there's no
 * extra latency. Always non-interactive (DocumentRenderer's Stage sets
 * `listening={false}`), purely a monitor. Lets an operator see both feeds
 * without needing a second physical monitor.
 */
export function MonitorsPanel() {
  const programSceneId = useLiveShowStore((s) => s.programSceneId);
  const previewSceneId = useLiveShowStore((s) => s.previewSceneId);

  return (
    <div className="flex h-full gap-2 bg-bg-deepest p-2">
      <MonitorFrame label="PROGRAM" tone="program" sceneId={programSceneId} />
      <MonitorFrame label="PREVIEW" tone="preview" sceneId={previewSceneId} />
    </div>
  );
}
