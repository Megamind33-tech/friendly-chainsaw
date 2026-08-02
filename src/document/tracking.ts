/**
 * Live camera tracking (FreeD).
 *
 * This is what turns the 3D renderer into an actual AR renderer: instead of a
 * virtual camera following authored moves, the render camera is locked to a
 * physical studio camera's measured pose, so graphics stay planted in the real
 * world as the camera moves.
 *
 * Transport is SSE from the sidecar (`/tracking/stream`), not a Tauri event,
 * for the same reason the document uses it — the OBS Browser Source is not a
 * Tauri window and has no IPC. One transport serves the Program window, the
 * Preview window and OBS identically, so a graphic cannot be locked in one and
 * floating in another.
 */

const STREAM_URL = "http://127.0.0.1:4977/tracking/stream";

/** No pose within this window means the tracker has stopped. */
export const TRACKING_STALE_MS = 500;

export interface TrackedPose {
  cameraId: number;
  panDeg: number;
  tiltDeg: number;
  rollDeg: number;
  xM: number;
  yM: number;
  zM: number;
  zoomRaw: number;
  focusRaw: number;
  receivedAtMs: number;
}

/**
 * Parse one SSE payload.
 *
 * Every field is validated. A partially-decoded pose would move the render
 * camera to a position derived from garbage, and on air a graphic frozen at
 * its last good pose is far better than one that jumps across the studio.
 */
export function parseTrackedPose(raw: string): TrackedPose | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const num = (key: string): number | null => {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const panDeg = num("panDeg");
  const tiltDeg = num("tiltDeg");
  const rollDeg = num("rollDeg");
  const xM = num("xM");
  const yM = num("yM");
  const zM = num("zM");
  if (panDeg === null || tiltDeg === null || rollDeg === null || xM === null || yM === null || zM === null) {
    return null;
  }
  return {
    cameraId: num("cameraId") ?? 0,
    panDeg,
    tiltDeg,
    rollDeg,
    xM,
    yM,
    zM,
    zoomRaw: num("zoomRaw") ?? 0,
    focusRaw: num("focusRaw") ?? 0,
    receivedAtMs: num("receivedAtMs") ?? Date.now(),
  };
}

/**
 * One measured point on a lens's zoom curve: at this encoder reading, the lens
 * has this horizontal field of view.
 *
 * Measured, not derived. A real lens's zoom curve is markedly non-linear, so a
 * straight encoder→FOV line is only ever an approximation, and graphics drift
 * in scale through a zoom under it. Two or more points make the mapping
 * piecewise-linear, which is what a lens file actually is.
 */
export interface LensCalibrationPoint {
  zoomRaw: number;
  fovDeg: number;
}

/**
 * Field of view for a zoom encoder reading, by piecewise-linear interpolation
 * between measured points.
 *
 * Outside the measured range the nearest point's value is held rather than
 * extrapolated: extrapolating a non-linear curve past where it was measured
 * produces confidently wrong numbers, and at the long end can produce a
 * negative FOV and an unusable frustum. Holding is visibly wrong at the
 * extremes, which is the better failure.
 *
 * Fewer than two points cannot define a curve, so the caller's fallback is
 * used — an operator part-way through calibrating still gets a usable camera.
 */
export function fovForZoom(
  points: LensCalibrationPoint[] | undefined,
  zoomRaw: number,
  fallback: number,
): number {
  if (!points || points.length === 0) return fallback;
  const valid = points
    .filter((p) => Number.isFinite(p.zoomRaw) && Number.isFinite(p.fovDeg))
    .sort((a, b) => a.zoomRaw - b.zoomRaw);
  if (valid.length === 0) return fallback;
  if (valid.length === 1) return valid[0].fovDeg;

  if (zoomRaw <= valid[0].zoomRaw) return valid[0].fovDeg;
  if (zoomRaw >= valid[valid.length - 1].zoomRaw) return valid[valid.length - 1].fovDeg;

  for (let i = 1; i < valid.length; i++) {
    const hi = valid[i];
    if (zoomRaw > hi.zoomRaw) continue;
    const lo = valid[i - 1];
    const span = hi.zoomRaw - lo.zoomRaw;
    // Duplicate encoder readings would divide by zero; take the later point.
    if (span === 0) return hi.fovDeg;
    const t = (zoomRaw - lo.zoomRaw) / span;
    return lo.fovDeg + (hi.fovDeg - lo.fovDeg) * t;
  }
  return valid[valid.length - 1].fovDeg;
}

/** A tracked feed that has stopped delivering must stop being treated as live. */
export function isPoseFresh(pose: TrackedPose | null, now: number, staleMs = TRACKING_STALE_MS): boolean {
  return pose !== null && now - pose.receivedAtMs <= staleMs;
}

// ---------------------------------------------------------------------------
// Store — a plain module-level store rather than Zustand.
//
// Poses arrive at frame rate (50/60 Hz). Routing that through a React store
// that notifies every subscriber would re-render the tree once per frame; the
// renderer instead reads the latest pose inside its own animation loop, which
// is already running.
// ---------------------------------------------------------------------------

let latest: TrackedPose | null = null;
let connected = false;
let source: EventSource | null = null;
let refCount = 0;
const listeners = new Set<() => void>();

export interface TrackingSnapshot {
  pose: TrackedPose | null;
  connected: boolean;
}

/** Stable identity between changes — the useSyncExternalStore rule. */
let snapshot: TrackingSnapshot = { pose: null, connected: false };

function publish(): void {
  snapshot = { pose: latest, connected };
  listeners.forEach((l) => l());
}

export function getTrackingSnapshot(): TrackingSnapshot {
  return snapshot;
}

export function subscribeTracking(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The latest pose, read directly — for per-frame consumers that must not
 * trigger a React render. */
export function getLatestPose(): TrackedPose | null {
  return latest;
}

/**
 * Open the stream, reference-counted so several surfaces can consume tracking
 * without each opening its own EventSource.
 */
export function acquireTrackingStream(): () => void {
  refCount += 1;
  if (refCount === 1 && typeof EventSource !== "undefined") {
    source = new EventSource(STREAM_URL);
    source.onopen = () => {
      connected = true;
      publish();
    };
    source.onmessage = (event) => {
      const pose = parseTrackedPose(event.data);
      // A malformed frame is dropped, keeping the last good pose. It must not
      // clear `latest` — that would blank a tracked graphic on one bad packet.
      if (!pose) return;
      latest = pose;
      // Deliberately no publish() per pose: at 50/60 Hz that is a React render
      // per frame. Per-frame consumers call getLatestPose() from their own
      // loop; the snapshot exists for status UI, which only needs connectivity.
    };
    source.onerror = () => {
      connected = false;
      publish();
    };
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      source?.close();
      source = null;
      connected = false;
      latest = null;
      publish();
    }
  };
}

/** Test seam. */
export function __resetTracking(): void {
  latest = null;
  connected = false;
  refCount = 0;
  source?.close();
  source = null;
  publish();
}

/** Test seam — injects a pose without a live stream. */
export function __setPose(pose: TrackedPose | null): void {
  latest = pose;
}
