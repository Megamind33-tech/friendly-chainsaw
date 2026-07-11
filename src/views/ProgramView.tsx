import { useEffect, useRef, useState } from "react";
import { DocumentRenderer } from "@/components/gfx/DocumentRenderer";
import { useDocumentEnvelope } from "@/document/useDocumentEnvelope";

/**
 * Visual-parity reference only. OBS's Browser Source reads the axum
 * HTTP sidecar at 127.0.0.1:4977/program (rendered server-side in Rust),
 * not this Tauri window. This view consumes the same document envelope via
 * `useDocumentEnvelope` (real-time `/ws` push, see lib.rs's
 * `ws_document_handler`) and renders it with the identical DocumentRenderer
 * used by the editor, proving the two-consumer split — and, since Phase 2,
 * the same programSceneId Rust picks for /program.
 */
const TICK_URL = "http://127.0.0.1:4977/program/tick";

export default function ProgramView() {
  const envelope = useDocumentEnvelope();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 1920, height: 1080 });
  const project = envelope?.project ?? null;

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  // Fit-scale exactly like PreviewView: without this, a window smaller than
  // the project resolution CROPS the frame — which reads as a different
  // camera angle/zoom than Preview even though both render the same camera.
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

  // Program liveness moved here now that `/program` serves this real renderer
  // instead of Rust-generated HTML with an injected heartbeat script.
  useEffect(() => {
    const fps = Math.max(1, Math.min(project?.fps ?? 30, 120));
    const intervalMs = 1000 / fps;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void fetch(TICK_URL).catch(() => {});
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [project?.fps]);

  const projW = project?.resolution.width ?? 1920;
  const projH = project?.resolution.height ?? 1080;
  const fitScale = Math.min(containerSize.width / projW, containerSize.height / projH, 1) || 1;

  return (
    <div ref={containerRef} className="fixed inset-0 flex items-center justify-center overflow-hidden">
      <DocumentRenderer
        project={project}
        sceneId={envelope?.programSceneId ?? undefined}
        scale={fitScale}
        layerPlayback={envelope?.layerPlayback}
        programSceneId={envelope?.programSceneId ?? null}
        previewSceneId={envelope?.previewSceneId ?? null}
        cameraMoves={envelope?.cameraMoves}
        cameraOrbits={envelope?.cameraOrbits}
        arFocus={envelope?.arFocus}
        role="program"
        // The one place a video/live source's real audio plays.
        audible
      />
    </div>
  );
}
