import { useEffect, useRef, useState } from "react";
import { DocumentRenderer } from "@/components/gfx/DocumentRenderer";
import { useDocumentEnvelope } from "@/document/useDocumentEnvelope";

/**
 * Real PVW monitor: consumes the same document envelope as ProgramView (via
 * `useDocumentEnvelope`'s real-time `/ws` push) but renders the scene armed
 * in Preview (previewSceneId), not Program. Like ProgramView, this must
 * consume the sidecar rather than the Control Room's in-memory store — each
 * Tauri window is its own SPA instance.
 */
export default function PreviewView() {
  const envelope = useDocumentEnvelope();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 960, height: 540 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const project = envelope?.project ?? null;
  const projW = project?.resolution.width ?? 1920;
  const projH = project?.resolution.height ?? 1080;
  const fitScale = Math.min(containerSize.width / projW, containerSize.height / projH, 1) || 1;

  return (
    <div className="flex h-screen w-screen flex-col bg-bg-deepest">
      <div className="flex h-6 shrink-0 items-center justify-center border-b border-border-subtle bg-bg-base font-mono text-[10px] tracking-wide text-text-muted">
        PREVIEW
      </div>
      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {/* No `audible` prop — defaults false. Preview must stay silent:
            it's a rehearsal monitor, not on-air, and real Program audio
            already plays once in the standalone Program window. */}
        <DocumentRenderer
          project={project}
          sceneId={envelope?.previewSceneId ?? undefined}
          scale={fitScale}
          layerPlayback={envelope?.layerPlayback}
          programSceneId={envelope?.programSceneId ?? null}
          previewSceneId={envelope?.previewSceneId ?? null}
          cameraMoves={envelope?.cameraMoves}
          cameraOrbits={envelope?.cameraOrbits}
          cameraPreview={envelope?.cameraPreview}
          arFocus={envelope?.arFocus}
          role="preview"
        />
      </div>
    </div>
  );
}
