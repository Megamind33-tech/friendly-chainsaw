import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Layer } from "@/document/types";
import { RenderSettingsApplier } from "./Set3dRenderer";
import { SetEnvironmentView, SetNodesView } from "./SetNodes";

/**
 * Real rendered thumbnails for the Set Library — a one-shot R3F snapshot of
 * each set through its own program camera, never placeholder/CSS art (hard
 * rule for this codebase). Mirrors Set3dRenderer's non-interactive render
 * path (RenderSettingsApplier + SetEnvironmentView + SetNodesView) at a
 * small fixed pixel size, captures a JPEG data URL after materials/env have
 * a couple of frames to settle, then unmounts.
 *
 * WebGL context budget: this app already fights "too many active WebGL
 * contexts" (see src/shims/three.ts), so only ONE snapshot <Canvas> is ever
 * mounted app-wide. A tiny module-level queue serializes requests; cards
 * waiting their turn show an honest dark "rendering…" placeholder instead of
 * fake art. Once a builderId is captured, the data URL is cached in memory
 * for the session — later mounts of the same card render <img> immediately.
 */

const snapshotCache = new Map<string, string>();
const failedIds = new Set<string>();

type QueueEntry = {
  builderId: string;
  create: () => Layer;
  width: number;
  height: number;
};

/** At most one entry is ever "active" (i.e. has a live Canvas capturing it)
 * app-wide; everything else waits in `queue`. Plain module state + a
 * subscriber set stands in for a store here — this is a tiny, self-contained
 * queue, not app document state. */
let activeEntry: QueueEntry | null = null;
const queue: QueueEntry[] = [];
const queuedIds = new Set<string>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function pump() {
  if (activeEntry) return;
  const next = queue.shift();
  if (!next) return;
  queuedIds.delete(next.builderId);
  activeEntry = next;
  notify();
}

function requestSnapshot(entry: QueueEntry) {
  if (snapshotCache.has(entry.builderId) || failedIds.has(entry.builderId)) return;
  if (activeEntry?.builderId === entry.builderId || queuedIds.has(entry.builderId)) return;
  queuedIds.add(entry.builderId);
  queue.push(entry);
  pump();
}

/** Releases the active slot (capture succeeded, failed, or its host
 * unmounted mid-flight) and advances the queue. Idempotent per entry via the
 * caller's own `doneRef` guard. */
function completeActive(builderId: string, dataUrl: string | null) {
  if (activeEntry?.builderId !== builderId) return;
  if (dataUrl) snapshotCache.set(builderId, dataUrl);
  else failedIds.add(builderId);
  activeEntry = null;
  notify();
  pump();
}

/** Lets a component re-render whenever the queue advances (used to notice
 * "it's my turn now" or "the cache just got my entry"). */
function useSnapshotQueueTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
}

/** Captures the canvas after a few frames (lets materials/env/shadows
 * settle) and reports the JPEG data URL up. */
function CaptureAfterSettle({ frames, onCapture }: { frames: number; onCapture: (url: string | null) => void }) {
  const frameCount = useRef(0);
  const captured = useRef(false);
  useFrame((state) => {
    if (captured.current) return;
    frameCount.current += 1;
    if (frameCount.current < frames) return;
    captured.current = true;
    try {
      onCapture(state.gl.domElement.toDataURL("image/jpeg", 0.72));
    } catch {
      onCapture(null);
    }
  });
  return null;
}

/** The single live snapshot Canvas — mounted offscreen (never display:none,
 * which would stop WebGL frames from being produced at all) at a fixed
 * pixel size matching the requesting card. Releases its queue slot on
 * unmount too, so a card closing mid-capture never deadlocks the queue. */
function SnapshotHost({ entry, onSettled }: { entry: QueueEntry; onSettled: (url: string | null) => void }) {
  const doneRef = useRef(false);
  const finish = (url: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onSettled(url);
  };

  useEffect(() => {
    return () => finish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const layer = useMemo(() => {
    try {
      return entry.create();
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  useEffect(() => {
    if (!layer || layer.props.kind !== "set3d") finish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  if (!layer || layer.props.kind !== "set3d") return null;
  const { nodes, environment, activeCameraId, render } = layer.props;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -99999,
        top: 0,
        width: entry.width,
        height: entry.height,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <Canvas
        dpr={1}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: [0, 1.7, 6], fov: 50, near: 0.1, far: 200 }}
        style={{ width: entry.width, height: entry.height }}
      >
        <RenderSettingsApplier exposure={render.exposure} shadows={render.shadows} />
        <SetEnvironmentView environment={environment} render={render} assets={[]} />
        <SetNodesView
          nodes={nodes}
          ctx={{
            interactive: false,
            assets: [],
            activeCameraId,
            project: null,
            programSceneId: null,
            previewSceneId: null,
            confidenceDepth: 0,
            render,
          }}
        />
        <CaptureAfterSettle frames={3} onCapture={finish} />
      </Canvas>
    </div>
  );
}

/**
 * A real rendered set thumbnail. Renders <img> from cache when available;
 * otherwise queues a snapshot and shows a quiet "rendering…" placeholder
 * until it's this card's turn and the capture lands.
 */
export function SetThumbnail({
  builderId,
  create,
  width = 300,
  height = 168,
  label,
}: {
  builderId: string;
  create: () => Layer;
  width?: number;
  height?: number;
  /** Shown in the waiting/error placeholder — an honest "rendering…" state,
   * never fake art. */
  label?: string;
}) {
  useSnapshotQueueTick();

  const cached = snapshotCache.get(builderId);
  const failed = failedIds.has(builderId);
  const isActive = activeEntry?.builderId === builderId;

  useEffect(() => {
    if (!cached && !failed) requestSnapshot({ builderId, create, width, height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderId, cached, failed]);

  const boxStyle = { width, height };

  if (cached) {
    return (
      <img
        src={cached}
        width={width}
        height={height}
        alt={label ?? builderId}
        style={{ ...boxStyle, display: "block", objectFit: "cover" }}
      />
    );
  }

  if (failed) {
    return (
      <div
        style={{ ...boxStyle }}
        className="flex items-center justify-center bg-bg-deepest font-mono text-[9px] text-live-red"
      >
        Preview failed
      </div>
    );
  }

  return (
    <>
      <div
        style={{ ...boxStyle }}
        className="flex items-center justify-center bg-bg-deepest font-mono text-[9px] text-text-muted"
      >
        {label ? `Rendering ${label}…` : "Rendering…"}
      </div>
      {isActive && (
        <SnapshotHost
          entry={activeEntry!}
          onSettled={(url) => completeActive(builderId, url)}
        />
      )}
    </>
  );
}
