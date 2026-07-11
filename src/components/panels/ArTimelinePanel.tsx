import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useDocStore } from "@/document/store";
import { useArLayer } from "./ar/useArLayer";
import { AR_ANIMATION_PRESETS } from "@/ar-engine/types";
import { defaultAnimationForPreset } from "@/ar-engine/arMotionEngine";
import { arToolbarButtonClass } from "./ar/arShared";
import type { ARAnimation, ARAnimationPreset, SetNode } from "@/document/types";

const PX_PER_SEC = 140;
const LABEL_W = 190;
const ROW_H = 40;
const ROW_H_SELECTED = 112;
const ROW_H_SELECTED_DIRECTIONAL = 134;
const SNAP_SEC = 0.05;

const EASING_CHOICES = ["power2.out", "power4.out", "expo.out", "back.out(1.6)", "none"];
const DIRECTION_CHOICES = ["bottom", "left", "right", "top"] as const;
const DIRECTIONAL_PRESETS = new Set<ARAnimationPreset>(["slide", "fly", "wipe"]);

/** Truthful, one-line summaries of what each preset actually does — mirrors
 * the real semantics in arMotionEngine.ts's computeArMotion, not marketing
 * copy, so the operator knows exactly what a bar will do before dragging it. */
const PRESET_TOOLTIPS: Record<ARAnimationPreset, string> = {
  none: "No entrance animation — appears instantly at full opacity/scale.",
  fade: "Fade — opacity ramps 0 → 1 in place, no movement or scale change.",
  slide: "Slide — travels in from the chosen direction while (by default) fading in.",
  scale: "Scale — grows uniformly from ~1% to full size in place.",
  pop: "Pop — bounces in from 72% scale with a back-out overshoot ease.",
  wipe: "Wipe — directional scale reveal (left/right/top/bottom axis), no position change.",
  rotate: "Rotate — spins in 90° on Y while scaling up from 0.",
  fly: "Fly — long-distance (3 unit) travel from the chosen direction, fast ease-out.",
  "count-up": "Count-up — scales in and interpolates a bound numeric text value from 0 to its target.",
  "bar-grow": "Bar-grow — one axis scales 0 → full along the chosen direction, like a stat bar filling.",
  "ticker-crawl": "Ticker-crawl — slides in, then continuously crawls sideways while the layer is on air.",
  "loop-pulse": "Loop-pulse — settles in, then breathes with a continuous scale pulse while on air.",
};

type DragMode = "move" | "resize";
interface DragState {
  nodeId: string;
  mode: DragMode;
  startX: number;
  startDelay: number;
  startDuration: number;
}

function snap(v: number): number {
  return Math.round(v / SNAP_SEC) * SNAP_SEC;
}

function fmtSec(t: number): string {
  return `${Math.max(0, t).toFixed(2)}s`;
}

function rowHeightFor(node: SetNode, selectedNodeId: string | null): number {
  if (node.id !== selectedNodeId || !node.animation) return ROW_H;
  return DIRECTIONAL_PRESETS.has(node.animation.preset) ? ROW_H_SELECTED_DIRECTIONAL : ROW_H_SELECTED;
}

/**
 * AE-style per-node animation timeline for the active AR layer. Each row is
 * one AR node's entrance choreography (its `animation` field: starts
 * `delay`s after Play IN, runs `duration`s) — this is authoring surface for
 * ArNodeAnimator's real playback (see SetNodes.tsx), not a mock preview.
 */
export function ArTimelinePanel() {
  const ar = useArLayer();
  const layerPlayback = useDocStore((s) => s.layerPlayback);
  const resetPlayback = useDocStore((s) => s.resetPlayback);
  const scrubPlayback = useDocStore((s) => s.scrubPlayback);

  const { scene, layer, arNodes, selectedNodeId } = ar;

  const [liveDrag, setLiveDrag] = useState<Record<string, { delay: number; duration: number }>>({});
  const [playheadSec, setPlayheadSec] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const scrubbingRef = useRef(false);
  const rulerRef = useRef<HTMLDivElement>(null);

  const playback = layer ? layerPlayback[layer.id] : undefined;

  // Follow real playback (or a post-scrub resume, since scrubPlayback just
  // back-dates startedAt) via rAF — same "derive elapsed from Date.now() -
  // startedAt" contract every Program/Preview consumer uses.
  useEffect(() => {
    if (!playback) return;
    let raf = 0;
    const tick = () => {
      setPlayheadSec(Math.max(0, (Date.now() - playback.startedAt) / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playback]);

  const latestEnd = useMemo(() => {
    let m = 0;
    for (const node of arNodes) {
      if (!node.animation) continue;
      const live = liveDrag[node.id];
      const delay = live?.delay ?? node.animation.delay;
      const duration = live?.duration ?? node.animation.duration;
      m = Math.max(m, delay + duration);
    }
    return m;
  }, [arNodes, liveDrag]);

  const maxEnd = Math.max(4, latestEnd + 0.5);
  const laneWidth = maxEnd * PX_PER_SEC;
  const tickCount = Math.round(maxEnd / 0.5);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * 0.5);

  const clientXToTime = (clientX: number) => {
    const el = rulerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(maxEnd, (clientX - rect.left) / PX_PER_SEC));
  };

  const onRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!layer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    const t = clientXToTime(e.clientX);
    setPlayheadSec(t);
    scrubPlayback(layer.id, "in", t);
  };
  const onRulerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current || !layer) return;
    const t = clientXToTime(e.clientX);
    setPlayheadSec(t);
    scrubPlayback(layer.id, "in", t);
  };
  const onRulerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const beginBarDrag = (e: ReactPointerEvent<HTMLDivElement>, node: SetNode, mode: DragMode) => {
    if (!node.animation) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    ar.selectSetNode(node.id);
    dragRef.current = { nodeId: node.id, mode, startX: e.clientX, startDelay: node.animation.delay, startDuration: node.animation.duration };
    setLiveDrag((prev) => ({ ...prev, [node.id]: { delay: node.animation!.delay, duration: node.animation!.duration } }));
  };

  const onBarDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dt = (e.clientX - d.startX) / PX_PER_SEC;
    if (d.mode === "move") {
      const delay = Math.max(0, snap(d.startDelay + dt));
      setLiveDrag((prev) => ({ ...prev, [d.nodeId]: { delay, duration: prev[d.nodeId]?.duration ?? d.startDuration } }));
    } else {
      const duration = Math.max(0.1, snap(d.startDuration + dt));
      setLiveDrag((prev) => ({ ...prev, [d.nodeId]: { delay: prev[d.nodeId]?.delay ?? d.startDelay, duration } }));
    }
  };

  const endBarDrag = (e: ReactPointerEvent<HTMLDivElement>, node: SetNode) => {
    const d = dragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    const val = liveDrag[d.nodeId];
    if (val && node.animation) {
      ar.updateNode(node, { animation: { ...node.animation, ...val } } as Partial<SetNode>);
    }
    setLiveDrag((prev) => {
      const next = { ...prev };
      delete next[d.nodeId];
      return next;
    });
  };

  const addGhostAnimation = (node: SetNode) => {
    ar.selectSetNode(node.id);
    ar.updateNode(node, {
      animation: { preset: "fade", duration: 0.6, delay: 0, easing: "power2.out", direction: "bottom" } as ARAnimation,
    } as Partial<SetNode>);
  };

  const applyPresetKeepTiming = (node: SetNode, preset: ARAnimationPreset) => {
    if (!node.animation) return;
    const def = defaultAnimationForPreset(preset);
    ar.updateNode(node, { animation: { ...def, delay: node.animation.delay, duration: node.animation.duration } } as Partial<SetNode>);
  };

  const setEasing = (node: SetNode, easing: string) => {
    if (!node.animation) return;
    ar.updateNode(node, { animation: { ...node.animation, easing } } as Partial<SetNode>);
  };

  const setDirection = (node: SetNode, direction: (typeof DIRECTION_CHOICES)[number]) => {
    if (!node.animation) return;
    ar.updateNode(node, { animation: { ...node.animation, direction } } as Partial<SetNode>);
  };

  const staggerAll = () => {
    const animated = arNodes.filter((n) => n.animation);
    animated.forEach((n, i) => {
      if (!n.animation) return;
      ar.updateNode(n, { animation: { ...n.animation, delay: Number((i * 0.08).toFixed(2)) } } as Partial<SetNode>);
    });
  };

  if (!ar.project) {
    return <div className="flex h-full items-center justify-center bg-bg-deepest font-mono text-xs text-text-muted">Loading…</div>;
  }

  if (!scene || !layer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-deepest p-4 text-center">
        <div className="font-mono text-xs text-text-muted-alt">No AR / 3D layer in this scene</div>
        <button onClick={ar.createArLayer} className={arToolbarButtonClass}>
          Create AR Layer
        </button>
      </div>
    );
  }

  if (arNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-deepest p-4 text-center font-mono text-xs text-text-muted">
        No AR objects yet — add elements from the Palette to build the animation timeline.
      </div>
    );
  }

  const clampedPlayhead = Math.min(playheadSec, maxEnd);

  return (
    <div className="flex h-full flex-col bg-bg-deepest text-xs">
      {/* Transport */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-panel px-2 py-1.5">
        <button onClick={() => ar.playIn(layer.id)} title="Play IN — runs every AR node's entrance choreography from this timeline" className={arToolbarButtonClass}>
          ▶ IN
        </button>
        <button onClick={() => ar.playOut(layer.id)} title="Play OUT" className={`${arToolbarButtonClass} text-live-red`}>
          ◀ OUT
        </button>
        <button
          onClick={() => {
            resetPlayback(layer.id);
            setPlayheadSec(0);
          }}
          title="Reset — clears playback, layer goes back to fully hidden"
          className={arToolbarButtonClass}
        >
          ⟲ RESET
        </button>
        <span className="ml-1 font-mono tabular-nums text-accent-blue-bright">{fmtSec(clampedPlayhead)}</span>
        <button onClick={staggerAll} title="Re-delay every animated node 0.08s apart, in row order" className={`ml-auto ${arToolbarButtonClass}`}>
          STAGGER 0.08s
        </button>
      </div>

      {/* Ruler */}
      <div className="flex shrink-0 border-b border-border-subtle bg-bg-panel">
        <div className="shrink-0 border-r border-border-subtle" style={{ width: LABEL_W }} />
        <div
          ref={rulerRef}
          className="relative h-6 flex-1 cursor-ew-resize overflow-hidden"
          onPointerDown={onRulerPointerDown}
          onPointerMove={onRulerPointerMove}
          onPointerUp={onRulerPointerUp}
          onPointerCancel={onRulerPointerUp}
          title="Drag to scrub — Program/Preview render this exact moment of the build."
        >
          <div className="relative h-full" style={{ width: laneWidth }}>
            {ticks.map((t) => (
              <div key={t} className={`absolute top-0 h-full border-l ${Number.isInteger(t) ? "border-border-subtle" : "border-border-subtle/40"}`} style={{ left: t * PX_PER_SEC }}>
                {Number.isInteger(t) && <span className="ml-1 font-mono text-[9px] text-text-muted">{t}s</span>}
              </div>
            ))}
            <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-live-red" style={{ left: clampedPlayhead * PX_PER_SEC }}>
              <div className="absolute -left-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-live-red" />
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="flex min-h-0 flex-1 overflow-auto">
        {/* Label column */}
        <div className="shrink-0 border-r border-border-subtle bg-bg-panel" style={{ width: LABEL_W }}>
          {arNodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const h = rowHeightFor(node, selectedNodeId);
            const directional = !!node.animation && DIRECTIONAL_PRESETS.has(node.animation.preset);
            return (
              <div key={node.id} style={{ height: h }} className={`flex flex-col justify-center gap-1 border-b border-border-subtle px-2 py-1 ${selected ? "bg-accent-blue/10" : "hover:bg-bg-surface"}`}>
                <button onClick={() => ar.selectSetNode(node.id)} className={`flex items-center gap-1.5 truncate text-left font-mono text-[10px] ${selected ? "text-accent-blue-bright" : "text-text-muted-alt"}`} title={node.name}>
                  <span className="truncate">{node.name}</span>
                  <span className="shrink-0 rounded border border-border-subtle px-1 text-[8px] uppercase text-text-muted">{node.kind}</span>
                </button>
                {selected && node.animation && (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-0.5">
                      {AR_ANIMATION_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => applyPresetKeepTiming(node, p.id)}
                          title={PRESET_TOOLTIPS[p.id]}
                          className={`rounded border px-1 py-0.5 font-mono text-[8px] ${
                            node.animation!.preset === p.id
                              ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright"
                              : "border-border-subtle text-text-muted hover:border-stripe-active"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {EASING_CHOICES.map((ease) => (
                        <button
                          key={ease}
                          onClick={() => setEasing(node, ease)}
                          title={`Easing: ${ease}`}
                          className={`rounded border px-1 py-0.5 font-mono text-[8px] ${
                            node.animation!.easing === ease
                              ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright"
                              : "border-border-subtle text-text-muted hover:border-stripe-active"
                          }`}
                        >
                          {ease}
                        </button>
                      ))}
                    </div>
                    {directional && (
                      <div className="flex flex-wrap gap-0.5">
                        {DIRECTION_CHOICES.map((dir) => (
                          <button
                            key={dir}
                            onClick={() => setDirection(node, dir)}
                            title={`Enter from ${dir}`}
                            className={`rounded border px-1 py-0.5 font-mono text-[8px] ${
                              node.animation!.direction === dir
                                ? "border-accent-blue bg-accent-blue/10 text-accent-blue-bright"
                                : "border-border-subtle text-text-muted hover:border-stripe-active"
                            }`}
                          >
                            {dir}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time area */}
        <div className="relative flex-1 overflow-hidden">
          <div className="relative" style={{ width: laneWidth }}>
            {ticks.map((t) => (
              <div key={t} className={`pointer-events-none absolute top-0 h-full border-l ${Number.isInteger(t) ? "border-border-subtle/40" : "border-border-subtle/15"}`} style={{ left: t * PX_PER_SEC }} />
            ))}
            {arNodes.map((node) => {
              const selected = node.id === selectedNodeId;
              const h = rowHeightFor(node, selectedNodeId);

              if (!node.animation) {
                return (
                  <div key={node.id} style={{ height: h }} className="relative flex items-center border-b border-border-subtle">
                    <button
                      onClick={() => addGhostAnimation(node)}
                      title="Click to add a default fade-in animation (0.6s, no delay)"
                      className="ml-1 flex h-6 w-24 items-center justify-center rounded border border-dashed border-border-subtle font-mono text-[9px] text-text-muted opacity-60 hover:border-accent-blue hover:text-accent-blue-bright hover:opacity-100"
                    >
                      + add
                    </button>
                  </div>
                );
              }

              const live = liveDrag[node.id];
              const delay = live?.delay ?? node.animation.delay;
              const duration = live?.duration ?? node.animation.duration;
              const left = delay * PX_PER_SEC;
              const width = Math.max(6, duration * PX_PER_SEC);

              return (
                <div key={node.id} style={{ height: h }} className="relative border-b border-border-subtle">
                  <div
                    onPointerDown={(e) => beginBarDrag(e, node, "move")}
                    onPointerMove={onBarDragMove}
                    onPointerUp={(e) => endBarDrag(e, node)}
                    onPointerCancel={(e) => endBarDrag(e, node)}
                    className={`absolute top-1/2 flex h-7 -translate-y-1/2 cursor-grab items-center overflow-hidden rounded active:cursor-grabbing ${
                      selected ? "bg-accent-blue/40 ring-1 ring-accent-blue" : "bg-accent-blue/20 ring-1 ring-accent-blue/40"
                    }`}
                    style={{ left, width }}
                    title={`${node.animation.preset} — delay ${delay.toFixed(2)}s, duration ${duration.toFixed(2)}s. ${PRESET_TOOLTIPS[node.animation.preset]} Drag body to move, drag right edge to resize.`}
                  >
                    <span className="mx-1 flex-1 truncate font-mono text-[9px] text-accent-blue-bright">{node.animation.preset}</span>
                    <div
                      onPointerDown={(e) => beginBarDrag(e, node, "resize")}
                      onPointerMove={onBarDragMove}
                      onPointerUp={(e) => endBarDrag(e, node)}
                      onPointerCancel={(e) => endBarDrag(e, node)}
                      className="h-full w-2 shrink-0 cursor-ew-resize bg-accent-blue/70"
                    />
                  </div>
                </div>
              );
            })}
            <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-live-red" style={{ left: clampedPlayhead * PX_PER_SEC }} />
          </div>
        </div>
      </div>
    </div>
  );
}
