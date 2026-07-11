import { create } from "zustand";
import { useDocStore } from "./store";

/**
 * Broadcast playout / rundown model (Phase C, rebuilt) — a real station
 * playout schedule, not a scene playlist. It lines up PROGRAMS with
 * time-of-day on-air times, runs them back-to-back automatically (a headless
 * ticker in this module, so transmission keeps running even when the operator
 * navigates away from the Playout page), maintains Now/Next, and records a
 * complete as-run log (scheduled vs actual start/end + status) the station can
 * export for compliance/billing.
 *
 * Program items air a scene to Program (`setProgramDirect`); `type` is real
 * broadcast metadata (program / live / clip / break / station id / filler)
 * carried into the rundown and the as-run log. Items + log + schedule start
 * persist; transport state does not (a reload comes up stopped, which is the
 * safe default for automation).
 */

export type ProgramType = "program" | "live" | "clip" | "break" | "id" | "filler";

export const PROGRAM_TYPE_LABEL: Record<ProgramType, string> = {
  program: "Program",
  live: "Live",
  clip: "Clip",
  break: "Break",
  id: "Station ID",
  filler: "Filler",
};

export interface ProgramItem {
  id: string;
  title: string;
  type: ProgramType;
  /** Scene aired to Program when this item goes on air (null = no video
   * change, e.g. a logged break that holds the previous picture). */
  sceneId: string | null;
  /** Planned on-air duration, seconds. */
  duration: number;
}

export type AsRunStatus = "on-air" | "completed" | "cut" | "skipped";

export interface AsRunEntry {
  id: string;
  title: string;
  type: ProgramType;
  /** Planned time-of-day (seconds since midnight) this was scheduled to air. */
  scheduledStartSec: number | null;
  /** Epoch ms it actually went to air. */
  actualStart: number;
  /** Epoch ms it left air (null while still on air). */
  actualEnd: number | null;
  /** Planned duration seconds. */
  plannedDuration: number;
  status: AsRunStatus;
}

interface PlayoutState {
  items: ProgramItem[];
  asRun: AsRunEntry[];
  /** Rundown anchor: the projected time-of-day (seconds since midnight) the
   * first item is scheduled to start. Each item's projected on-air time is
   * this plus the cumulative duration ahead of it. */
  scheduleStartSec: number;
  loop: boolean;

  // Transport (not persisted).
  currentId: string | null;
  isPlaying: boolean;
  /** Seconds elapsed into the current item. */
  progress: number;

  // Rundown editing.
  addProgram: (partial?: Partial<ProgramItem>) => void;
  updateProgram: (id: string, patch: Partial<ProgramItem>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, dir: -1 | 1) => void;
  duplicateItem: (id: string) => void;
  setScheduleStart: (sec: number) => void;
  setLoop: (loop: boolean) => void;

  // Transport controls.
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  /** Jump straight to an item and put it to air. */
  takeItem: (id: string) => void;

  clearAsRun: () => void;
}

const STORAGE_KEY = "playout-rundown-v2";

function nowSecOfDay(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function loadPersisted(): { items: ProgramItem[]; asRun: AsRunEntry[]; scheduleStartSec: number; loop: boolean } {
  const fallback = { items: [], asRun: [], scheduleStartSec: nowSecOfDay(), loop: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        items: p.items ?? [],
        asRun: p.asRun ?? [],
        scheduleStartSec: typeof p.scheduleStartSec === "number" ? p.scheduleStartSec : nowSecOfDay(),
        loop: !!p.loop,
      };
    }
  } catch {
    /* ignore corrupt persisted state */
  }
  return fallback;
}

let idCounter = 0;
function newId(): string {
  return `po-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

/** Projected time-of-day (sec since midnight) each item is scheduled to air. */
export function projectedStartSecs(items: ProgramItem[], scheduleStartSec: number): number[] {
  const out: number[] = [];
  let acc = scheduleStartSec;
  for (const item of items) {
    out.push(acc % 86400);
    acc += item.duration;
  }
  return out;
}

let ticker: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 250;

/**
 * Live items are open-ended: the control room ends them, so a manual take of a
 * live item is a normal completion, never an early "cut". Non-live items are
 * "cut" only when taken before their planned duration.
 */
function endStatusFor(item: ProgramItem | undefined, progress: number): "completed" | "cut" {
  if (!item) return "completed";
  if (item.type === "live") return "completed";
  return progress >= item.duration - 0.3 ? "completed" : "cut";
}

export const usePlayoutStore = create<PlayoutState>((set, get) => {
  const persist = () => {
    if (typeof window === "undefined") return;
    const { items, asRun, scheduleStartSec, loop } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, asRun, scheduleStartSec, loop }));
  };

  const scheduledStartFor = (id: string): number | null => {
    const { items, scheduleStartSec } = get();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    return projectedStartSecs(items, scheduleStartSec)[idx] ?? null;
  };

  /** Close the current on-air as-run entry with a final status. */
  const closeCurrentEntry = (status: Exclude<AsRunStatus, "on-air">) => {
    set((state) => {
      const entry = state.asRun.find((e) => e.status === "on-air");
      if (!entry) return {};
      entry.actualEnd = Date.now();
      entry.status = status;
      return { asRun: [...state.asRun] };
    });
  };

  /** Put an item to air: log it, set Program, reset progress. */
  const goOnAir = (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const entry: AsRunEntry = {
      id: newId(),
      title: item.title,
      type: item.type,
      scheduledStartSec: scheduledStartFor(id),
      actualStart: Date.now(),
      actualEnd: null,
      plannedDuration: item.duration,
      status: "on-air",
    };
    set((state) => ({ currentId: id, progress: 0, asRun: [entry, ...state.asRun].slice(0, 500) }));
    if (item.sceneId) useDocStore.getState().setProgramDirect(item.sceneId);
    queueMicrotask(persist);
  };

  const stopTicker = () => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };

  const startTicker = () => {
    if (ticker) return;
    ticker = setInterval(() => {
      const st = get();
      if (!st.isPlaying || !st.currentId) return;
      const item = st.items.find((i) => i.id === st.currentId);
      if (!item) {
        stopTicker();
        set({ isPlaying: false, currentId: null });
        return;
      }
      const np = st.progress + TICK_MS / 1000;
      if (np >= item.duration && item.type !== "live") {
        // Non-live item reached its planned end → completed; advance.
        advance("completed");
      } else {
        // Live items HOLD on air past their planned duration — automation
        // never cuts a live camera. Progress keeps climbing so the operator
        // sees the over-run; only a manual take/next (the control room ending
        // the program) advances off a live item.
        set({ progress: np });
      }
    }, TICK_MS);
  };

  /** End the current item and move to the next (or stop / loop). */
  const advance = (endStatus: Exclude<AsRunStatus, "on-air">) => {
    const { items, currentId, loop } = get();
    const idx = items.findIndex((i) => i.id === currentId);
    closeCurrentEntry(endStatus);
    const nextItem = idx >= 0 ? items[idx + 1] : items[0];
    if (nextItem) {
      goOnAir(nextItem.id);
    } else if (loop && items.length > 0) {
      goOnAir(items[0].id);
    } else {
      stopTicker();
      set({ isPlaying: false, currentId: null, progress: 0 });
    }
  };

  return {
    ...loadPersisted(),
    currentId: null,
    isPlaying: false,
    progress: 0,

    addProgram: (partial) =>
      set((state) => {
        const item: ProgramItem = {
          id: newId(),
          title: partial?.title ?? "New program",
          type: partial?.type ?? "program",
          sceneId: partial?.sceneId ?? null,
          duration: partial?.duration ?? 300,
        };
        queueMicrotask(persist);
        return { items: [...state.items, item] };
      }),

    updateProgram: (id, patch) =>
      set((state) => {
        const items = state.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
        queueMicrotask(persist);
        return { items };
      }),

    removeItem: (id) =>
      set((state) => {
        queueMicrotask(persist);
        return { items: state.items.filter((i) => i.id !== id) };
      }),

    moveItem: (id, dir) =>
      set((state) => {
        const idx = state.items.findIndex((i) => i.id === id);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= state.items.length) return {};
        const items = [...state.items];
        const [it] = items.splice(idx, 1);
        items.splice(to, 0, it);
        queueMicrotask(persist);
        return { items };
      }),

    duplicateItem: (id) =>
      set((state) => {
        const idx = state.items.findIndex((i) => i.id === id);
        if (idx < 0) return {};
        const copy = { ...state.items[idx], id: newId(), title: `${state.items[idx].title} (copy)` };
        const items = [...state.items];
        items.splice(idx + 1, 0, copy);
        queueMicrotask(persist);
        return { items };
      }),

    setScheduleStart: (sec) =>
      set(() => {
        queueMicrotask(persist);
        return { scheduleStartSec: ((sec % 86400) + 86400) % 86400 };
      }),

    setLoop: (loop) =>
      set(() => {
        queueMicrotask(persist);
        return { loop };
      }),

    play: () => {
      const { currentId, items } = get();
      if (items.length === 0) return;
      if (!currentId) goOnAir(items[0].id);
      set({ isPlaying: true });
      startTicker();
    },

    pause: () => {
      stopTicker();
      set({ isPlaying: false });
    },

    stop: () => {
      const { progress, currentId, items } = get();
      const item = items.find((i) => i.id === currentId);
      closeCurrentEntry(endStatusFor(item, progress));
      stopTicker();
      set({ isPlaying: false, currentId: null, progress: 0 });
    },

    next: () => {
      const { progress, currentId, items } = get();
      const item = items.find((i) => i.id === currentId);
      if (!currentId) {
        if (items[0]) goOnAir(items[0].id);
        return;
      }
      advance(endStatusFor(item, progress));
    },

    previous: () => {
      const { items, currentId, progress } = get();
      const idx = items.findIndex((i) => i.id === currentId);
      const prev = idx > 0 ? items[idx - 1] : items[0];
      if (!prev) return;
      closeCurrentEntry(endStatusFor(items[idx], progress));
      goOnAir(prev.id);
    },

    takeItem: (id) => {
      const { items, currentId, progress } = get();
      closeCurrentEntry(endStatusFor(items.find((i) => i.id === currentId), progress));
      goOnAir(id);
    },

    clearAsRun: () =>
      set(() => {
        queueMicrotask(persist);
        return { asRun: [] };
      }),
  };
});

// ---------------------------------------------------------------------------
// Formatting + as-run export helpers.
// ---------------------------------------------------------------------------

export function fmtTimeOfDay(sec: number | null): string {
  if (sec === null || sec === undefined) return "—";
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = m.toString().padStart(2, "0");
  const sss = ss.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}

function fmtEpochClock(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-GB", { hour12: false });
}

/** Builds an as-run CSV the station can archive/extract. Entries are newest-
 * first in the store; the CSV is emitted oldest-first (chronological). */
export function buildAsRunCsv(entries: AsRunEntry[]): string {
  const header = ["Title", "Type", "Scheduled", "Actual Start", "Actual End", "Planned", "Actual", "Status"];
  const rows = [...entries]
    .slice()
    .reverse()
    .map((e) => {
      const actualDur = e.actualEnd ? (e.actualEnd - e.actualStart) / 1000 : null;
      return [
        e.title,
        PROGRAM_TYPE_LABEL[e.type],
        fmtTimeOfDay(e.scheduledStartSec),
        fmtEpochClock(e.actualStart),
        fmtEpochClock(e.actualEnd),
        fmtDuration(e.plannedDuration),
        actualDur === null ? "" : fmtDuration(actualDur),
        e.status,
      ]
        .map(csvCell)
        .join(",");
    });
  return [header.join(","), ...rows].join("\r\n");
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Triggers a browser download of the as-run CSV. */
export function downloadAsRunCsv(entries: AsRunEntry[]): void {
  const csv = buildAsRunCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `as-run-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// HMR safety: the transport ticker is a module-level setInterval. Without
// this, a hot-reload of this module leaves the OLD module's interval running
// alongside the new one — two tickers advancing the schedule in parallel,
// which is exactly the "duplicate as-run entries" bug seen during dev. Vite's
// dispose hook clears the interval belonging to the module being replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  });
}
