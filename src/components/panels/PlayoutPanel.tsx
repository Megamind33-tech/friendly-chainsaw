import { useEffect, useState } from "react";
import { useDocStore } from "@/document/store";
import {
  usePlayoutStore,
  projectedStartSecs,
  fmtTimeOfDay,
  fmtDuration,
  downloadAsRunCsv,
  PROGRAM_TYPE_LABEL,
  type ProgramType,
  type AsRunStatus,
} from "@/document/playout";
import { Play, Pause, Square, SkipForward, SkipBack, Plus, Trash2, ChevronUp, ChevronDown, Copy, Radio, Repeat, Download, Clock } from "lucide-react";

const TYPES: ProgramType[] = ["program", "live", "clip", "break", "id", "filler"];

const STATUS_DOT: Record<string, string> = {
  "on-air": "bg-live-red",
  next: "bg-live-amber",
  done: "bg-text-muted/40",
  upcoming: "bg-accent-blue/40",
};

function hhmmToSec(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}
function secToHHMM(sec: number): string {
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  return `${Math.floor(s / 3600).toString().padStart(2, "0")}:${Math.floor((s % 3600) / 60).toString().padStart(2, "0")}`;
}

/**
 * Playout (Phase C, rebuilt) — a station rundown that lines up upcoming
 * PROGRAMS with time-of-day on-air times, runs them automatically (headless
 * ticker in playout.ts, so it keeps airing off-page), shows Now/Next, and
 * records a full as-run log (scheduled vs actual start/end + status) that
 * exports to CSV. This is the real "what's coming up / what ended" surface.
 */
export function PlayoutPanel() {
  const project = useDocStore((s) => s.project);

  const items = usePlayoutStore((s) => s.items);
  const asRun = usePlayoutStore((s) => s.asRun);
  const scheduleStartSec = usePlayoutStore((s) => s.scheduleStartSec);
  const loop = usePlayoutStore((s) => s.loop);
  const currentId = usePlayoutStore((s) => s.currentId);
  const isPlaying = usePlayoutStore((s) => s.isPlaying);
  const progress = usePlayoutStore((s) => s.progress);

  const addProgram = usePlayoutStore((s) => s.addProgram);
  const updateProgram = usePlayoutStore((s) => s.updateProgram);
  const removeItem = usePlayoutStore((s) => s.removeItem);
  const moveItem = usePlayoutStore((s) => s.moveItem);
  const duplicateItem = usePlayoutStore((s) => s.duplicateItem);
  const setScheduleStart = usePlayoutStore((s) => s.setScheduleStart);
  const setLoop = usePlayoutStore((s) => s.setLoop);
  const play = usePlayoutStore((s) => s.play);
  const pause = usePlayoutStore((s) => s.pause);
  const stop = usePlayoutStore((s) => s.stop);
  const next = usePlayoutStore((s) => s.next);
  const previous = usePlayoutStore((s) => s.previous);
  const takeItem = usePlayoutStore((s) => s.takeItem);
  const clearAsRun = usePlayoutStore((s) => s.clearAsRun);

  const [tab, setTab] = useState<"rundown" | "asrun">("rundown");
  const [nowClock, setNowClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!project) {
    return <div className="flex h-full items-center justify-center bg-bg-deepest font-mono text-xs text-text-muted">Loading…</div>;
  }

  const starts = projectedStartSecs(items, scheduleStartSec);
  const totalDur = items.reduce((sum, i) => sum + i.duration, 0);
  const currentIndex = items.findIndex((i) => i.id === currentId);
  const current = currentIndex >= 0 ? items[currentIndex] : undefined;
  const nextIdx = currentIndex >= 0 ? currentIndex + 1 : 0;
  const nextItem = items[nextIdx];
  const remaining = current ? current.duration - progress : 0;
  const isLiveOnAir = current?.type === "live";
  const overBy = current ? progress - current.duration : 0; // >0 = past planned end
  const sceneName = (id: string | null) => (id ? project.scenes.find((s) => s.id === id)?.name ?? "(missing)" : "—");

  const rowStatus = (index: number): AsRunStatus | "next" | "done" | "upcoming" => {
    if (currentIndex >= 0) {
      if (index === currentIndex) return "on-air";
      if (index < currentIndex) return "done";
      if (index === currentIndex + 1) return "next";
      return "upcoming";
    }
    return index === 0 ? "next" : "upcoming";
  };

  const ctrlBtn = "flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg-surface text-text-muted-alt hover:border-accent-blue hover:text-accent-blue-bright";

  return (
    <div className="flex h-full flex-col bg-bg-deepest text-xs">
      {/* Transport + schedule */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-bg-base px-2 py-1.5">
        <button onClick={previous} title="Previous" className={ctrlBtn}><SkipBack className="h-3.5 w-3.5" /></button>
        <button onClick={() => (isPlaying ? pause() : play())} title={isPlaying ? "Pause" : "Play schedule"} className={ctrlBtn}>
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button onClick={stop} title="Stop" className={ctrlBtn}><Square className="h-3.5 w-3.5" /></button>
        <button onClick={next} title="Next / take" className={ctrlBtn}><SkipForward className="h-3.5 w-3.5" /></button>
        <button onClick={() => setLoop(!loop)} title="Loop schedule" className={`${ctrlBtn} ${loop ? "border-accent-blue text-accent-blue-bright" : ""}`}>
          <Repeat className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        <label className="flex items-center gap-1 font-mono text-[10px] text-text-muted">
          <Clock className="h-3 w-3" /> start
          <input
            type="time"
            value={secToHHMM(scheduleStartSec)}
            onChange={(e) => setScheduleStart(hhmmToSec(e.target.value))}
            className="h-6 rounded border border-border-subtle bg-bg-surface px-1 text-text-muted-alt outline-none"
          />
        </label>

        <div className="ml-auto flex items-center gap-3 font-mono text-[10px] text-text-muted">
          <span>{items.length} items</span>
          <span>runs {fmtDuration(totalDur)}</span>
          <span>ends {fmtTimeOfDay(scheduleStartSec + totalDur)}</span>
          <span className="tabular-nums text-text-muted-alt">{new Date(nowClock).toLocaleTimeString("en-GB", { hour12: false })}</span>
        </div>
      </div>

      {/* Now / Next */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border-subtle bg-bg-base px-2 py-2">
        <div className={`flex flex-col gap-1 rounded border px-2 py-1.5 ${current ? "border-live-red/60 bg-live-red/5" : "border-border-subtle"}`}>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded bg-live-red px-1 py-0.5 text-[9px] font-bold text-white"><Radio className="h-2.5 w-2.5" /> ON AIR</span>
            {current && <span className="rounded border border-border-subtle px-1 text-[9px] text-text-muted">{PROGRAM_TYPE_LABEL[current.type]}</span>}
            {isLiveOnAir && <span className="rounded bg-live-red/20 px-1 text-[9px] font-bold text-live-red">LIVE · HOLDS</span>}
          </div>
          <span className="truncate font-mono text-[12px] text-text-muted-alt">{current ? current.title : "— idle —"}</span>
          {current && (
            <>
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-text-muted">{fmtDuration(progress)}</span>
                {isLiveOnAir ? (
                  overBy > 0 ? (
                    <span className="tabular-nums font-semibold text-live-red">OVER +{fmtDuration(overBy)}</span>
                  ) : (
                    <span className="tabular-nums text-text-muted">planned −{fmtDuration(remaining)}</span>
                  )
                ) : (
                  <span className="tabular-nums text-live-amber">−{fmtDuration(remaining)}</span>
                )}
              </div>
              <div className="h-1 overflow-hidden rounded bg-bg-surface">
                <div
                  className={`h-full transition-all ${isLiveOnAir && overBy > 0 ? "bg-live-amber" : "bg-live-red"}`}
                  style={{ width: `${Math.min(100, (progress / current.duration) * 100)}%` }}
                />
              </div>
              {isLiveOnAir && (
                <span className="font-mono text-[9px] text-text-muted">won't auto-cut — take Next to end the live program</span>
              )}
            </>
          )}
        </div>

        <div className={`flex flex-col gap-1 rounded border px-2 py-1.5 ${nextItem ? "border-live-amber/50 bg-live-amber/5" : "border-border-subtle"}`}>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-live-amber px-1 py-0.5 text-[9px] font-bold text-black">NEXT</span>
            {nextItem && <span className="rounded border border-border-subtle px-1 text-[9px] text-text-muted">{PROGRAM_TYPE_LABEL[nextItem.type]}</span>}
          </div>
          <span className="truncate font-mono text-[12px] text-text-muted-alt">{nextItem ? nextItem.title : "— end of schedule —"}</span>
          {nextItem && (
            <div className="font-mono text-[10px] text-text-muted">
              at {fmtTimeOfDay(starts[nextIdx])}
              {current &&
                (isLiveOnAir ? (
                  <span className="ml-1 text-live-red">on take</span>
                ) : (
                  <span className="ml-1 text-live-amber">(in {fmtDuration(remaining)})</span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1">
        {(["rundown", "asrun"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-1 font-mono text-[10px] tracking-wide ${tab === t ? "bg-accent-blue text-white" : "text-text-muted-alt hover:text-accent-blue-bright"}`}
          >
            {t === "rundown" ? "RUNDOWN" : `AS-RUN LOG (${asRun.length})`}
          </button>
        ))}
        {tab === "rundown" && (
          <button onClick={() => addProgram()} className="ml-auto flex items-center gap-1 rounded border border-border-subtle bg-bg-surface px-2 py-1 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue">
            <Plus className="h-3 w-3" /> Program
          </button>
        )}
        {tab === "asrun" && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => downloadAsRunCsv(asRun)} disabled={asRun.length === 0} className="flex items-center gap-1 rounded border border-border-subtle bg-bg-surface px-2 py-1 font-mono text-[10px] text-text-muted-alt hover:border-accent-blue disabled:opacity-30">
              <Download className="h-3 w-3" /> Export CSV
            </button>
            <button onClick={clearAsRun} className="rounded px-1.5 py-1 font-mono text-[10px] text-text-muted hover:text-live-red">clear</button>
          </div>
        )}
      </div>

      {/* Body */}
      {tab === "rundown" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {/* Column header */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <span className="w-3" />
            <span className="w-5 text-right">#</span>
            <span className="w-16">on-air</span>
            <span className="flex-1">title</span>
            <span className="w-16">type</span>
            <span className="w-24">scene</span>
            <span className="w-12 text-right">dur</span>
            <span className="w-16">end</span>
            <span className="w-8" />
          </div>
          {items.length === 0 && (
            <div className="p-4 text-center font-mono text-[10px] text-text-muted">
              Empty schedule — add programs to line up your transmission.
            </div>
          )}
          {items.map((item, i) => {
            const st = rowStatus(i);
            return (
              <div key={item.id} className={`group flex items-center gap-2 border-b border-border-subtle/60 px-2 py-1 font-mono ${st === "on-air" ? "bg-live-red/5" : st === "next" ? "bg-live-amber/5" : "hover:bg-bg-surface"}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[st]}`} title={st} />
                <span className="w-5 shrink-0 text-right text-[10px] text-text-muted">{i + 1}</span>
                <button onClick={() => takeItem(item.id)} title="Take to air" className="w-16 shrink-0 text-left text-[10px] tabular-nums text-accent-blue-bright hover:underline">
                  {fmtTimeOfDay(starts[i])}
                </button>
                <input
                  value={item.title}
                  onChange={(e) => updateProgram(item.id, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[11px] text-text-muted-alt outline-none hover:bg-bg-surface focus:bg-bg-surface focus:ring-1 focus:ring-accent-blue"
                />
                <select
                  value={item.type}
                  onChange={(e) => updateProgram(item.id, { type: e.target.value as ProgramType })}
                  className="w-16 shrink-0 rounded border border-border-subtle/0 bg-transparent text-[10px] text-text-muted hover:border-border-subtle"
                >
                  {TYPES.map((t) => <option key={t} value={t}>{PROGRAM_TYPE_LABEL[t]}</option>)}
                </select>
                <select
                  value={item.sceneId ?? ""}
                  onChange={(e) => updateProgram(item.id, { sceneId: e.target.value || null })}
                  className="w-24 shrink-0 truncate rounded border border-border-subtle/0 bg-transparent text-[10px] text-text-muted hover:border-border-subtle"
                  title={sceneName(item.sceneId)}
                >
                  <option value="">— none —</option>
                  {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={item.duration}
                  onChange={(e) => updateProgram(item.id, { duration: Math.max(1, Math.round(Number(e.target.value))) })}
                  className="w-12 shrink-0 rounded bg-transparent px-1 py-0.5 text-right text-[10px] text-text-muted-alt outline-none hover:bg-bg-surface focus:bg-bg-surface"
                  title="Duration (seconds)"
                />
                <span className="w-16 shrink-0 text-[10px] tabular-nums text-text-muted">{fmtTimeOfDay((starts[i] + item.duration) % 86400)}</span>
                <div className="flex w-8 shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={() => moveItem(item.id, -1)} className="text-text-muted hover:text-accent-blue-bright" title="Up"><ChevronUp className="h-3 w-3" /></button>
                  <button onClick={() => moveItem(item.id, 1)} className="text-text-muted hover:text-accent-blue-bright" title="Down"><ChevronDown className="h-3 w-3" /></button>
                  <button onClick={() => duplicateItem(item.id)} className="text-text-muted hover:text-accent-blue-bright" title="Duplicate"><Copy className="h-3 w-3" /></button>
                  <button onClick={() => removeItem(item.id)} className="text-text-muted hover:text-live-red" title="Remove"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-subtle bg-bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-text-muted">
            <span className="flex-1">title</span>
            <span className="w-14">type</span>
            <span className="w-16">sched</span>
            <span className="w-16">start</span>
            <span className="w-16">end</span>
            <span className="w-12 text-right">actual</span>
            <span className="w-16">status</span>
          </div>
          {asRun.length === 0 && <div className="p-4 text-center font-mono text-[10px] text-text-muted">Nothing aired yet.</div>}
          {asRun.map((e) => {
            const actualDur = e.actualEnd ? (e.actualEnd - e.actualStart) / 1000 : null;
            const statusColor = e.status === "on-air" ? "text-live-red" : e.status === "completed" ? "text-accent-blue-bright" : e.status === "cut" ? "text-live-amber" : "text-text-muted";
            return (
              <div key={e.id} className="flex items-center gap-2 border-b border-border-subtle/40 px-2 py-1 font-mono text-[10px]">
                <span className="min-w-0 flex-1 truncate text-text-muted-alt">{e.title}</span>
                <span className="w-14 text-text-muted">{PROGRAM_TYPE_LABEL[e.type]}</span>
                <span className="w-16 tabular-nums text-text-muted">{fmtTimeOfDay(e.scheduledStartSec)}</span>
                <span className="w-16 tabular-nums text-text-muted-alt">{new Date(e.actualStart).toLocaleTimeString("en-GB", { hour12: false })}</span>
                <span className="w-16 tabular-nums text-text-muted">{e.actualEnd ? new Date(e.actualEnd).toLocaleTimeString("en-GB", { hour12: false }) : "—"}</span>
                <span className="w-12 text-right tabular-nums text-text-muted">{actualDur === null ? "—" : fmtDuration(actualDur)}</span>
                <span className={`w-16 ${statusColor}`}>{e.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
