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
  /** Phase 7 CSV/JSON import: replace the current rundown items entirely.
   * Deliberately not "append": operators importing a new schedule expect
   * the old one gone, and merge semantics are ambiguous (dedup by title?
   * by scene?). Persists immediately; does not affect the as-run log. */
  replaceRundown: (items: ProgramItem[]) => void;
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
 *
 * Exported so Phase 8's verification harness can pin this invariant directly
 * (a live take must never register as a cut) — the behavior is operator-
 * visible in the as-run log and would silently regress if this ever changed.
 */
export function endStatusFor(item: ProgramItem | undefined, progress: number): "completed" | "cut" {
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

    replaceRundown: (items) => {
      // If we're currently airing an item that won't survive the import,
      // stop cleanly first — otherwise the ticker keeps advancing a
      // ghost currentId that no longer resolves. `stop()` closes the
      // as-run entry with the honest end status.
      const { currentId } = get();
      if (currentId && !items.some((i) => i.id === currentId)) {
        get().stop();
      }
      set(() => {
        queueMicrotask(persist);
        return { items };
      });
    },
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

/**
 * Rundown CSV parser (Phase 7 import). Columns (order-tolerant, matched by
 * header name, case-insensitive): `title` (required), `type`, `duration`,
 * `sceneName`. Missing `title` on a row skips the row silently rather than
 * failing the whole import — real spreadsheets have trailing blank rows.
 *
 * `duration` accepts either a bare number ("300") or `mm:ss` / `hh:mm:ss`.
 * `type` is validated against ProgramType and defaults to "program" when
 * blank/unknown (never silently coerced to an invalid enum).
 * `sceneName` looks up an existing scene id by name; a name that doesn't
 * match any scene yields `sceneId: null` (not an error — the operator will
 * assign later).
 */
export function parseRundownCsv(
  csv: string,
  sceneNameToId: Record<string, string>,
): ProgramItem[] {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idxOf = (name: string): number => header.indexOf(name);
  const titleIdx = idxOf("title");
  const typeIdx = idxOf("type");
  const durIdx = idxOf("duration");
  const sceneIdx = idxOf("scenename");
  if (titleIdx < 0) return [];

  const out: ProgramItem[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = (row[titleIdx] ?? "").trim();
    if (!title) continue;
    const typeRaw = typeIdx >= 0 ? (row[typeIdx] ?? "").trim().toLowerCase() : "";
    const type: ProgramType = (["program", "live", "clip", "break", "id", "filler"] as const).includes(
      typeRaw as ProgramType,
    )
      ? (typeRaw as ProgramType)
      : "program";
    const duration = durIdx >= 0 ? parseDuration(row[durIdx] ?? "") : 300;
    const sceneName = sceneIdx >= 0 ? (row[sceneIdx] ?? "").trim() : "";
    const sceneId = sceneName ? sceneNameToId[sceneName] ?? null : null;
    out.push({
      id: newId(),
      title,
      type,
      sceneId,
      duration: Math.max(1, Math.round(duration)),
    });
  }
  return out;
}

/** Serializes the current rundown to CSV (round-trips through `parseRundownCsv`). */
export function buildRundownCsv(items: ProgramItem[], sceneIdToName: Record<string, string>): string {
  const header = ["title", "type", "duration", "sceneName"];
  const rows = items.map((item) => {
    const sceneName = item.sceneId ? sceneIdToName[item.sceneId] ?? "" : "";
    return [item.title, item.type, String(item.duration), sceneName].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}

/** JSON export of the rundown — smaller/tighter than CSV, keeps native shapes. */
export function buildRundownJson(items: ProgramItem[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
    },
    null,
    2,
  );
}

export function parseRundownJson(text: string): ProgramItem[] {
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(items)) return [];
  const out: ProgramItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) continue;
    const typeVal = typeof raw.type === "string" ? raw.type : "program";
    const type: ProgramType = (["program", "live", "clip", "break", "id", "filler"] as const).includes(
      typeVal as ProgramType,
    )
      ? (typeVal as ProgramType)
      : "program";
    const duration = typeof raw.duration === "number" && raw.duration > 0 ? Math.round(raw.duration) : 300;
    const sceneId = typeof raw.sceneId === "string" ? raw.sceneId : null;
    out.push({ id: newId(), title, type, sceneId, duration });
  }
  return out;
}

/** Duration parse: bare number of seconds OR `mm:ss` OR `hh:mm:ss`. */
function parseDuration(raw: string): number {
  const s = raw.trim();
  if (!s) return 300;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(":").map((p) => Number(p.trim()));
  if (parts.some(Number.isNaN)) return 300;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 300;
}

/**
 * Minimal CSV row parser — RFC 4180 subset. Handles quoted cells with
 * embedded commas, embedded quotes ("" → "), and \r\n or \n line endings.
 * Explicitly not a general-purpose parser; the input surface here is only
 * ever this project's own exports or a spreadsheet-authored rundown.
 */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // Only emit a row on the first EOL char; skip a following \n after \r.
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
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
