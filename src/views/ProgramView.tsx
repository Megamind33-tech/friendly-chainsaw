import { useEffect, useRef, useState } from "react";
import { TransitionCompositor } from "@/components/gfx/TransitionCompositor";
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
  //
  // Driven by requestAnimationFrame, NOT setInterval. status.rs treats these
  // hits as the sole evidence that Program is live and computes health_pct
  // from their rate — but a setInterval keeps firing at full rate while the
  // page paints nothing (occluded/suspended WebView, lost GPU process, a
  // renderer throwing every frame). The ON-AIR lamp then read a steady "Live /
  // 100%" over frozen output: precisely the failure it exists to catch. rAF is
  // driven by the compositor, so the heartbeat stops when painting stops.
  //
  // What this proves: the Program page is alive and presenting frames. What it
  // does NOT prove: that content changed (a static lower third is legitimately
  // on air), or that a downstream consumer received anything.
  useEffect(() => {
    const fps = Math.max(1, Math.min(project?.fps ?? 30, 120));
    const intervalMs = 1000 / fps;
    let cancelled = false;
    let rafId = 0;
    let lastSentAt = 0;
    // One hit in flight at a time. The old fire-and-forget loop could queue
    // requests faster than the sidecar drained them at 50/60fps.
    let inFlight = false;

    const frame = (now: number) => {
      if (cancelled) return;
      if (!inFlight && now - lastSentAt >= intervalMs) {
        lastSentAt = now;
        inFlight = true;
        void fetch(TICK_URL)
          .catch(() => {})
          .finally(() => {
            inFlight = false;
          });
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [project?.fps]);

  const projW = project?.resolution.width ?? 1920;
  const projH = project?.resolution.height ?? 1080;
  const fitScale = Math.min(containerSize.width / projW, containerSize.height / projH, 1) || 1;

  return (
    <div ref={containerRef} className="fixed inset-0 flex items-center justify-center overflow-hidden">
      <TransitionCompositor
        project={project}
        sceneId={envelope?.programSceneId ?? undefined}
        scale={fitScale}
        layerPlayback={envelope?.layerPlayback}
        programSceneId={envelope?.programSceneId ?? null}
        previewSceneId={envelope?.previewSceneId ?? null}
        cameraMoves={envelope?.cameraMoves}
        cameraOrbits={envelope?.cameraOrbits}
        arFocus={envelope?.arFocus}
        // Take transitions: Program is the surface that mixes. OBS reads this
        // same view through the sidecar, so it sees the identical dissolve.
        transition={envelope?.transition ?? null}
        role="program"
        // The one place a video/live source's real audio plays.
        audible
      />
    </div>
  );
}
