import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SelfieSegmentation, type Results } from "@mediapipe/selfie_segmentation";

/**
 * AI talent matte — keying WITHOUT a physical green screen. MediaPipe's
 * Selfie Segmenter (~1.4MB tflite, real-time on modest CPUs/GPUs) produces
 * a per-frame person mask that the chroma shader consumes as an alpha matte
 * instead of color distance. All runtime files are VENDORED into
 * /public/mediapipe (this network blocks CDNs; the npm package ships the
 * model + wasm, copied at build setup — see 3d-stack-facts memory).
 *
 * One segmenter per underlying <video> element, refcounted like
 * videoFeeds.ts, throttled to ~24 fps: segmentation costs real CPU/GPU, so
 * two planes showing the same talent share one matte.
 */

interface MaskEntry {
  seg: SelfieSegmentation;
  canvas: HTMLCanvasElement;
  refs: number;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  /** True once the first real mask frame landed (before that the matte is
   * fully opaque so the talent never flashes invisible while loading). */
  ready: boolean;
}

const entries = new Map<HTMLVideoElement, MaskEntry>();

function acquireMask(video: HTMLVideoElement): MaskEntry {
  let entry = entries.get(video);
  if (entry) {
    entry.refs += 1;
    return entry;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d")!;
  // Opaque until the first inference — "not ready" must show the talent,
  // never hide them.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const seg = new SelfieSegmentation({ locateFile: (file) => `/mediapipe/${file}` });
  // Model 1 = landscape model — tuned for subjects further from camera,
  // the studio-presenter framing (0 is a selfie/close-up model).
  seg.setOptions({ modelSelection: 1 });
  const localEntry: MaskEntry = { seg, canvas, refs: 1, running: false, timer: null, ready: false };
  seg.onResults((results: Results) => {
    // Broadcast-grade matte conditioning, done once here (cheap, 2D):
    //  - EMA temporal smoothing: 65% new frame over 35% previous kills the
    //    frame-to-frame flicker raw segmentation masks always have.
    //  - 1.5px blur softens the model's stair-stepped boundary; the shader's
    //    choke/feather then re-sharpens it controllably.
    // First frame draws fully opaque-new (no EMA against the white init).
    ctx.filter = "blur(1.5px)";
    ctx.globalAlpha = localEntry.ready ? 0.65 : 1;
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    localEntry.ready = true;
    localEntry.running = false;
  });

  localEntry.timer = setInterval(() => {
    // Skip a tick rather than queue if inference hasn't finished — never
    // build a backlog on slow machines (graceful degradation to lower fps).
    if (localEntry.running || video.readyState < 2) return;
    localEntry.running = true;
    seg.send({ image: video }).catch((err) => {
      localEntry.running = false;
      console.error("selfie segmentation failed", err);
    });
  }, 1000 / 24);

  entries.set(video, localEntry);
  return localEntry;
}

function releaseMask(video: HTMLVideoElement): void {
  const entry = entries.get(video);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entry.timer) clearInterval(entry.timer);
  entry.seg.close().catch(() => {});
  entries.delete(video);
}

/**
 * The matte as a live THREE texture for the keyed plane's shader. Returns a
 * stable texture object; its contents update per inference frame (needsUpdate
 * flagged from the render loop). Pass `null` video to disable (color-key
 * mode) — the hook then costs nothing.
 */
export function useSegmentationMask(video: HTMLVideoElement | null): THREE.CanvasTexture | null {
  const entryRef = useRef<MaskEntry | null>(null);

  const texture = useMemo(() => {
    if (!video) return null;
    const entry = acquireMask(video);
    entryRef.current = entry;
    const t = new THREE.CanvasTexture(entry.canvas);
    t.colorSpace = THREE.NoColorSpace;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  useEffect(() => {
    if (!video || !texture) return;
    return () => {
      releaseMask(video);
      texture.dispose();
      entryRef.current = null;
    };
  }, [video, texture]);

  useFrame(() => {
    if (texture) texture.needsUpdate = true;
  });

  return texture;
}
