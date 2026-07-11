import { create } from "zustand";
import { getDb } from "@/lib/db";
import { newId } from "@/document/ids";
import { useDataStore, FEED_IDS } from "@/document/dataSources";
import type { FeedId, SportId } from "@/document/dataSources";

/**
 * Data Pages — named snapshots of every live data-source value
 * (useDataStore), so an operator can prepare several data sets ahead of
 * time (e.g. "Halftime stats", "Final score") and swap the live show
 * between them with one click. `applyPage` writes straight back into
 * useDataStore's real setters, which persistence.ts already subscribes to
 * and re-pushes on any change — so applying a page live-updates every bound
 * graphic on air, the same as an operator editing a field by hand.
 */

const DATA_PAGES_KEY = "data_pages";

/** SportId has no exported id list in dataSources.ts (only FeedId's
 * FEED_IDS is exported) — mirrors DataSourcesPanel.tsx's local constant,
 * derived from the same fixed SportId union. */
const SPORT_IDS: SportId[] = ["soccer", "basketball", "football", "baseball", "hockey", "tennis", "volleyball", "rugby"];

/** Every live-editable data source a snapshot captures — all of useDataStore
 * except the two purely-derived clock fields (clockTime/nowEpochMs), which
 * are a live tick, not operator-authored content. */
const SNAPSHOT_SOURCE_IDS: string[] = ["mock", "brand", "ticker", ...FEED_IDS, ...SPORT_IDS];

export interface DataPage {
  id: string;
  name: string;
  /** sourceId -> (key -> value), one entry per SNAPSHOT_SOURCE_IDS member. */
  values: Record<string, Record<string, string>>;
}

interface AppStateRow {
  v: string;
}

/** Structural shape shared by every snapshot-able useDataStore source
 * (MockDataSource/SportDataSource) — DataState itself isn't exported from
 * dataSources.ts, so sources are read through this narrow shape instead. */
interface SourceLike {
  id: string;
  name: string;
  values: Record<string, string>;
}

interface DataPagesState {
  pages: DataPage[];
  loaded: boolean;
  loadPages: () => Promise<void>;
  savePage: (name: string) => Promise<void>;
  applyPage: (id: string) => void;
  renamePage: (id: string, name: string) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
}

async function persistPages(pages: DataPage[]): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO app_state (k, v) VALUES ($1, $2) ON CONFLICT(k) DO UPDATE SET v = excluded.v", [
    DATA_PAGES_KEY,
    JSON.stringify(pages),
  ]);
}

export const useDataPages = create<DataPagesState>((set, get) => ({
  pages: [],
  loaded: false,

  loadPages: async () => {
    if (get().loaded) return;
    try {
      const db = await getDb();
      const rows = await db.select<AppStateRow[]>("SELECT v FROM app_state WHERE k = $1", [DATA_PAGES_KEY]);
      const raw = rows[0]?.v;
      let pages: DataPage[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) pages = parsed as DataPage[];
        } catch (err) {
          console.error("data pages row failed to parse, resetting", err);
        }
      }
      set({ pages, loaded: true });
    } catch (err) {
      console.error("failed to load data pages", err);
      set({ pages: [], loaded: true });
    }
  },

  savePage: async (name) => {
    const state = useDataStore.getState() as unknown as Record<string, SourceLike>;
    const values: Record<string, Record<string, string>> = {};
    for (const sourceId of SNAPSHOT_SOURCE_IDS) {
      values[sourceId] = { ...state[sourceId].values };
    }
    const page: DataPage = { id: newId(), name, values };
    const pages = [...get().pages, page];
    set({ pages });
    await persistPages(pages);
  },

  applyPage: (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (!page) return;
    const { setMockValue, setBrandValue, setTickerValue, setFeedValue, setSportValue } = useDataStore.getState();
    const feedIds: string[] = FEED_IDS;
    for (const [sourceId, sourceValues] of Object.entries(page.values)) {
      for (const [key, value] of Object.entries(sourceValues)) {
        if (sourceId === "mock") setMockValue(key, value);
        else if (sourceId === "brand") setBrandValue(key, value);
        else if (sourceId === "ticker") setTickerValue(key, value);
        else if (feedIds.includes(sourceId)) setFeedValue(sourceId as FeedId, key, value);
        else setSportValue(sourceId as SportId, key, value);
      }
    }
  },

  renamePage: async (id, name) => {
    const pages = get().pages.map((p) => (p.id === id ? { ...p, name } : p));
    set({ pages });
    await persistPages(pages);
  },

  deletePage: async (id) => {
    const pages = get().pages.filter((p) => p.id !== id);
    set({ pages });
    await persistPages(pages);
  },
}));
