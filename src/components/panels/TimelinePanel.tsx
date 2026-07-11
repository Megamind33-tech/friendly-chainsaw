import { useEffect, useRef, useState } from "react";
import { useDocStore } from "@/document/store";
import { useSequenceStore, type Clip } from "@/document/sequence";
import type { Layer } from "@/document/types";
import { Play, Pause, Square, SkipBack, Layers as LayersIcon, Box as BoxIcon } from "lucide-react";

const PX_PER_SEC = 48;
const LABEL_W = 168;

function fmt(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ds = Math.floor((s * 10) % 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ds}`;
}

type Phase = "off" | "in" | "out";
type DragMode = "move" | "in" | "out";

/**
 * Timeline (Phase B) — sequences the active scene's layers on a real
 * seconds-based track. Each layer is a track; its clip is [inTime, outTime].
 * The transport walks a playhead across the tracks and fires the actual
 * `playIn`/`playOut`/`resetPlayback` as the head crosses each clip edge, so
 * playing here genuinely animates Program & Preview — this is the on-air
 * choreography surface, not a mock. Clips persist per scene (see sequence.ts).
 */
export function TimelinePanel() {
  const project = useDocStore((s) => s.project);
  const activeSceneId = useDocStore((s) => s.activeSceneId);
  const playIn = useDocStore((s) => s.playIn);
  const playOut = useDocStore((s) => s.playOut);
  const resetPlayback = useDocStore((s) => s.resetPlayback);

  const clipsForScene = useSequenceStore((s) => s.clips);
  const getClip = useSequenceStore((s) => s.getClip);
  const hasClip = useSequenceStore((s) => s.hasClip);
  const setClip = useSequenceStore((s) => s.setClip);
  const duration = useSequenceStore((s) => s.duration);
  const setDuration = useSequenceStore((s) => s.setDuration);

  const scene = project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0];
  const layers: Layer[] = scene ? [...scene.layers].sort((a, b) => a.zIndex - b.zIndex) : [];

  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const appliedRef = useRef<Record<string, Phase>>({});
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ layerId: string; mode: DragMode; startX: number; startClip: Clip } | null>(null);

  // Transport: advance the playhead in real time while playing.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const np = p + dt;
        if (np >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return np;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration]);

  // Fire real playback transitions as the head crosses clip edges. Only fires
  // on a phase CHANGE (tracked in appliedRef) so a held phase doesn't restart
  // its animation every frame.
  //
  // Gated on hasClip, NOT just getClip's fallback: every layer renders a
  // ghost default clip [0,5] in the lane below so it CAN be dragged onto the
  // timeline, but a layer the operator never actually dragged must stay
  // fully outside the sequencer's control. Without this guard, simply
  // opening this page fired playIn for every layer in the scene (playhead
  // starts at 0, default inTime is 0) and scrubbing/Stop fired playOut on
  // all of them — silently overriding whatever the operator had set by hand
  // via Play In/Out in the Layers panel for graphics never meant to be
  // sequenced here at all.
  useEffect(() => {
    if (!scene) return;
    for (const layer of layers) {
      if (!hasClip(scene.id, layer.id)) continue;
      const clip = getClip(scene.id, layer.id);
      let desired: Phase = "off";
      if (playhead >= clip.outTime) desired = "out";
      else if (playhead >= clip.inTime) desired = "in";
      if (appliedRef.current[layer.id] !== desired) {
        appliedRef.current[layer.id] = desired;
        if (desired === "in") playIn(layer.id);
        else if (desired === "out") playOut(layer.id);
        else resetPlayback(layer.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, scene?.id, clipsForScene, layers.length]);

  const stop = () => {
    setIsPlaying(false);
    setPlayhead(0);
    if (scene) for (const layer of layers) if (hasClip(scene.id, layer.id)) resetPlayback(layer.id);
    appliedRef.current = {};
  };

  const scrubToClientX = (clientX: number) => {
    const el = laneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(duration, (clientX - rect.left + el.scrollLeft) / PX_PER_SEC));
    setIsPlaying(false);
    setPlayhead(t);
  };

  // Clip drag / resize.
  const onClipPointerDown = (e: React.PointerEvent, layer: Layer, mode: DragMode) => {
    e.stopPropagation();
    if (!scene) return;
    dragRef.current = { layerId: layer.id, mode, startX: e.clientX, startClip: getClip(scene.id, layer.id) };

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !scene) return;
      const dt = (ev.clientX - d.startX) / PX_PER_SEC;
      let { inTime, outTime } = d.startClip;
      if (d.mode === "move") {
        const len = outTime - inTime;
        inTime = Math.max(0, Math.min(duration - len, inTime + dt));
        outTime = inTime + len;
      } else if (d.mode === "in") {
        inTime = Math.max(0, Math.min(outTime - 0.2, inTime + dt));
      } else {
        outTime = Math.min(duration, Math.max(inTime + 0.2, outTime + dt));
      }
      setClip(scene.id, d.layerId, { inTime: round1(inTime), outTime: round1(outTime) });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!project || !scene) {
    return <div className="flex h-full items-center justify-center bg-bg-deepest font-mono text-xs text-text-muted">No scene</div>;
  }

  const laneWidth = duration * PX_PER_SEC;
  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);

  return (
    <div className="flex h-full flex-col bg-bg-deepest text-xs">
      {/* Transport */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-base px-2 py-1.5">
        <button onClick={() => setIsPlaying((p) => !p)} title={isPlaying ? "Pause" : "Play"} className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg-surface text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright">
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button onClick={stop} title="Stop / rewind" className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg-surface text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright">
          <Square className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setIsPlaying(false); setPlayhead(0); }} title="Go to start" className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg-surface text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <span className="ml-1 font-mono tabular-nums text-accent-blue-bright">{fmt(playhead)}</span>
        <span className="font-mono text-text-muted">/ {fmt(duration)}</span>
        <div className="ml-auto flex items-center gap-1 font-mono text-[10px] text-text-muted">
          <span>length</span>
          <input
            type="number"
            min={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="h-6 w-14 rounded border border-border-subtle bg-bg-surface px-1 text-text-muted-alt outline-none"
          />
          <span>s</span>
        </div>
      </div>

      {/* Ruler */}
      <div className="flex shrink-0 border-b border-border-subtle bg-bg-base">
        <div className="shrink-0 border-r border-border-subtle" style={{ width: LABEL_W }} />
        <div className="relative h-6 flex-1 overflow-hidden">
          <div className="relative h-full" style={{ width: laneWidth }}>
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-border-subtle/60" style={{ left: t * PX_PER_SEC }}>
                {t % 2 === 0 && <span className="ml-1 font-mono text-[9px] text-text-muted">{t}s</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tracks */}
      <div className="flex min-h-0 flex-1 overflow-auto">
        {/* Label column */}
        <div className="shrink-0 border-r border-border-subtle bg-bg-panel" style={{ width: LABEL_W }}>
          {layers.map((layer) => (
            <div key={layer.id} className="flex h-11 items-center gap-1.5 border-b border-border-subtle px-2">
              {layer.props.kind === "set3d" ? <BoxIcon className="h-3 w-3 shrink-0 text-text-muted" /> : <LayersIcon className="h-3 w-3 shrink-0 text-text-muted" />}
              <span className="truncate font-mono text-[11px] text-text-muted-alt">{layer.name}</span>
            </div>
          ))}
          {layers.length === 0 && <div className="p-3 font-mono text-[10px] text-text-muted">No layers in this scene</div>}
        </div>

        {/* Lanes */}
        <div ref={laneRef} className="relative flex-1 overflow-hidden" onPointerDown={(e) => scrubToClientX(e.clientX)}>
          <div className="relative" style={{ width: laneWidth }}>
            {layers.map((layer) => {
              const clip = getClip(scene.id, layer.id);
              const sequenced = hasClip(scene.id, layer.id);
              const left = clip.inTime * PX_PER_SEC;
              const width = Math.max(6, (clip.outTime - clip.inTime) * PX_PER_SEC);
              const live = sequenced && playhead >= clip.inTime && playhead < clip.outTime;
              return (
                <div key={layer.id} className="relative h-11 border-b border-border-subtle">
                  <div
                    onPointerDown={(e) => onClipPointerDown(e, layer, "move")}
                    className={`absolute top-1.5 flex h-8 cursor-grab items-center overflow-hidden rounded active:cursor-grabbing ${
                      !sequenced
                        ? "border border-dashed border-border-subtle bg-transparent opacity-50"
                        : live
                          ? "bg-accent-blue/40 ring-1 ring-accent-blue"
                          : "bg-accent-blue/20 ring-1 ring-accent-blue/40"
                    }`}
                    style={{ left, width }}
                    title={
                      sequenced
                        ? `${layer.name} — in ${fmt(clip.inTime)}, out ${fmt(clip.outTime)}`
                        : `${layer.name} — not on the timeline yet, drag to sequence`
                    }
                  >
                    <div onPointerDown={(e) => onClipPointerDown(e, layer, "in")} className="h-full w-1.5 shrink-0 cursor-ew-resize bg-accent-blue/70" />
                    <span className="mx-1 flex-1 truncate font-mono text-[9px] text-accent-blue-bright">{layer.name}</span>
                    <div onPointerDown={(e) => onClipPointerDown(e, layer, "out")} className="h-full w-1.5 shrink-0 cursor-ew-resize bg-accent-blue/70" />
                  </div>
                </div>
              );
            })}
            {/* Playhead */}
            <div className="pointer-events-none absolute top-0 z-10 h-full w-px bg-live-red" style={{ left: playhead * PX_PER_SEC }}>
              <div className="absolute -left-1 -top-0 h-2 w-2 rounded-full bg-live-red" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
