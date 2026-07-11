import { create } from "zustand";
import { SOCCER_DEFAULTS } from "@/sports/soccer";
import { BASKETBALL_DEFAULTS } from "@/sports/basketball";
import { FOOTBALL_DEFAULTS } from "@/sports/football";
import { BASEBALL_DEFAULTS } from "@/sports/baseball";
import { HOCKEY_DEFAULTS } from "@/sports/hockey";
import { TENNIS_DEFAULTS } from "@/sports/tennis";
import { VOLLEYBALL_DEFAULTS } from "@/sports/volleyball";
import { RUGBY_DEFAULTS } from "@/sports/rugby";
import { BRAND_DEFAULTS, FULLSCREEN_DEFAULTS } from "@/sports/common";
import { SQUAD_DEFAULTS } from "@/sports/squads";
import { SPORTS_LIVE_DEFAULTS } from "@/sports/liveData";
import { MAP_DEFAULTS } from "@/graphics/maps";
import { TICKER_DEFAULTS } from "@/document/ticker";
import { SPORT_IDS, type SportId } from "@/sports/types";

/**
 * Phase 3's "mock feed" — a stand-in for a real data source adapter
 * (scoreboard API, CMS, weather service, ...). The shape (a flat
 * key/value bag under a source id) is what any future real adapter would
 * also produce; only the origin of the values differs.
 */
export interface MockDataSource {
  id: "mock";
  name: string;
  values: Record<string, string>;
}

/**
 * Phase 4's sport data sources — live-editable scoreboard feeds, one per
 * sport id, each seeded with that sport's `<SPORT>_DEFAULTS`. Structurally
 * identical to the Mock Feed; each is its own source so `<sport>.<field>`
 * keys stay namespaced and every scorebug is demonstrably data-driven the
 * same way the Mock Feed proves for lower-thirds. A real scoreboard adapter
 * would replace only the origin of these values, not the shape.
 */
export interface SportDataSource {
  id: string;
  name: string;
  values: Record<string, string>;
}

export type { SportId } from "@/sports/types";

/** Phase 5.7 show-genre feeds — politics, weather, program schedule, faith/
 * events, and (Phase 5.11) a countdown target. Structurally identical to
 * sport sources; a real adapter (election API, weather service, rundown
 * system) would replace only the origin. */
export type FeedId = "politics" | "weather" | "program" | "event" | "countdown" | "quote" | "squad" | "map" | "election" | "sports";

const POLITICS_DEFAULTS: Record<string, string> = {
  raceTitle: "ELECTION RESULTS",
  reporting: "0% REPORTING",
  candidate1: "CANDIDATE A",
  party1: "PARTY A",
  votes1: "0",
  pct1: "0%",
  candidate2: "CANDIDATE B",
  party2: "PARTY B",
  votes2: "0",
  pct2: "0%",
};

const WEATHER_DEFAULTS: Record<string, string> = {
  location: "CITY NAME",
  temp: "24°",
  condition: "PARTLY CLOUDY",
  high: "28°",
  low: "17°",
  wind: "12 KM/H",
  humidity: "58%",
  day1Name: "MON", day1Temp: "25°", day1Cond: "SUNNY",
  day2Name: "TUE", day2Temp: "23°", day2Cond: "CLOUDY",
  day3Name: "WED", day3Temp: "21°", day3Cond: "RAIN",
  day4Name: "THU", day4Temp: "22°", day4Cond: "SHOWERS",
  day5Name: "FRI", day5Temp: "26°", day5Cond: "SUNNY",
};

const PROGRAM_DEFAULTS: Record<string, string> = {
  programName: "PROGRAM NAME",
  startTime: "20:00",
  presenter: "PRESENTER NAME",
  presenterRole: "HOST",
  comingUp1: "EVENING NEWS", comingUp1Time: "20:00",
  comingUp2: "SPORTS TONIGHT", comingUp2Time: "21:00",
  comingUp3: "LATE SHOW", comingUp3Time: "22:00",
};

const EVENT_DEFAULTS: Record<string, string> = {
  eventTitle: "SUNDAY SERVICE",
  verseText: "For God so loved the world, that he gave his only begotten Son",
  verseRef: "JOHN 3:16",
  speaker: "SPEAKER NAME",
  speakerRole: "SENIOR PASTOR",
  songTitle: "AMAZING GRACE",
  songWriter: "JOHN NEWTON",
};

/** Countdown target (Phase 5.11) — `targetIso` is an operator-typed date/time
 * string (anything `new Date()` parses; a datetime-local input value works
 * directly), left empty by default (honest "not configured" rather than
 * silently counting down to a fake time). `countdown.remaining` is NOT
 * stored here — it's computed live in `buildDataValues` from `nowEpochMs`
 * every tick, the same "derive, don't fake" pattern `clock.time` already
 * uses. */
const COUNTDOWN_DEFAULTS: Record<string, string> = {
  label: "KICKOFF",
  targetIso: "",
};

/** Quote Card content (Phase 5.11) — its own source since it doesn't fit
 * Faith/Events (a quote card is generic, not always scripture). */
const QUOTE_DEFAULTS: Record<string, string> = {
  text: "Great things are done by a series of small things brought together.",
  author: "VINCENT VAN GOGH",
  role: "",
};

interface DataState {
  mock: MockDataSource;
  politics: SportDataSource;
  election: SportDataSource;
  weather: SportDataSource;
  program: SportDataSource;
  event: SportDataSource;
  countdown: SportDataSource;
  quote: SportDataSource;
  /** Squad/lineup feed (src/sports/squads.ts) — team meta + 11 starters. */
  squad: SportDataSource;
  /** Map board feed (src/graphics/maps.ts) — title + 4 pinned locations. */
  map: SportDataSource;
  /** Sports AR panel live feed (src/sports/liveData.ts) — the flat-key
   * projection of sports-live-data.schema.json. ALL defaults are empty by
   * design: the AR 3D Models must open blank. */
  sports: SportDataSource;
  soccer: SportDataSource;
  basketball: SportDataSource;
  football: SportDataSource;
  baseball: SportDataSource;
  hockey: SportDataSource;
  tennis: SportDataSource;
  volleyball: SportDataSource;
  rugby: SportDataSource;
  /** Brand Kit — station-wide theme colors every sport's scorebug chrome
   * binds to (see src/sports/common.ts's BRAND_KEYS). Editing `panelBg` here
   * re-themes all 8 sports' panel backgrounds at once. */
  brand: SportDataSource;
  /** Phase 4 ticker headlines — see document/ticker.ts. */
  ticker: SportDataSource;
  /** A genuinely live value (real wall-clock time, not a random-number
   * fake) — proves "a mock feed live-updates a bound field" honestly. */
  clockTime: string;
  /** Same tick as `clockTime`, as a raw epoch — `buildDataValues` uses this
   * (not the formatted display string) to compute `countdown.remaining`. */
  nowEpochMs: number;
  setMockValue: (key: string, value: string) => void;
  renameMockKey: (oldKey: string, newKey: string) => void;
  removeMockKey: (key: string) => void;
  setSportValue: (sport: SportId, key: string, value: string) => void;
  setFeedValue: (feed: FeedId, key: string, value: string) => void;
  /** Batch merge — ONE store update (one resolve+push) for a whole incoming
   * payload, instead of one per field. Live REST/WS sports feeds depend on
   * this: 25 sequential setFeedValue calls = 25 full output bakes. */
  mergeFeedValues: (feed: FeedId, values: Record<string, string>) => void;
  setBrandValue: (key: string, value: string) => void;
  setTickerValue: (key: string, value: string) => void;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export const useDataStore = create<DataState>((set) => ({
  mock: {
    id: "mock",
    name: "Mock Feed",
    values: {
      headline: "Rebuild in progress",
      // Lower-third fields (Phase 5.6) — kicker tab, sub-headline strip,
      // channel bug. All live-editable like every other source value.
      kicker: "BREAKING NEWS",
      subline: "Live coverage continues at the top of the hour",
      channel: "CHANNEL",
      tagline: "TAGLINE GOES HERE",
      score_home: "0",
      score_away: "0",
    },
  },
  politics: { id: "politics", name: "Politics", values: { ...POLITICS_DEFAULTS } },
  election: { id: "election", name: "Election Results", values: {} },
  weather: { id: "weather", name: "Weather", values: { ...WEATHER_DEFAULTS } },
  program: { id: "program", name: "Program", values: { ...PROGRAM_DEFAULTS } },
  event: { id: "event", name: "Faith / Events", values: { ...EVENT_DEFAULTS } },
  countdown: { id: "countdown", name: "Countdown", values: { ...COUNTDOWN_DEFAULTS } },
  quote: { id: "quote", name: "Quote Card", values: { ...QUOTE_DEFAULTS } },
  squad: { id: "squad", name: "Squad / Lineup", values: { ...SQUAD_DEFAULTS } },
  map: { id: "map", name: "Map Board", values: { ...MAP_DEFAULTS } },
  sports: { id: "sports", name: "Sports Live", values: { ...SPORTS_LIVE_DEFAULTS } },
  // FULLSCREEN_DEFAULTS adds the keys Phase 5.5's full-screen templates bind
  // (matchTitle/venue/players/stats) to every sport, all live-editable.
  soccer: { id: "soccer", name: "Soccer", values: { ...FULLSCREEN_DEFAULTS, ...SOCCER_DEFAULTS } },
  basketball: { id: "basketball", name: "Basketball", values: { ...FULLSCREEN_DEFAULTS, ...BASKETBALL_DEFAULTS } },
  football: { id: "football", name: "Football", values: { ...FULLSCREEN_DEFAULTS, ...FOOTBALL_DEFAULTS } },
  baseball: { id: "baseball", name: "Baseball", values: { ...FULLSCREEN_DEFAULTS, ...BASEBALL_DEFAULTS } },
  hockey: { id: "hockey", name: "Hockey", values: { ...FULLSCREEN_DEFAULTS, ...HOCKEY_DEFAULTS } },
  tennis: { id: "tennis", name: "Tennis", values: { ...FULLSCREEN_DEFAULTS, ...TENNIS_DEFAULTS } },
  volleyball: { id: "volleyball", name: "Volleyball", values: { ...FULLSCREEN_DEFAULTS, ...VOLLEYBALL_DEFAULTS } },
  rugby: { id: "rugby", name: "Rugby", values: { ...FULLSCREEN_DEFAULTS, ...RUGBY_DEFAULTS } },
  brand: { id: "brand", name: "Brand Kit", values: { ...BRAND_DEFAULTS } },
  ticker: { id: "ticker", name: "Ticker", values: { ...TICKER_DEFAULTS } },
  clockTime: formatClock(new Date()),
  nowEpochMs: Date.now(),

  setMockValue: (key, value) =>
    set((state) => ({ mock: { ...state.mock, values: { ...state.mock.values, [key]: value } } })),

  renameMockKey: (oldKey, newKey) =>
    set((state) => {
      if (!newKey || newKey === oldKey || oldKey in state.mock.values === false) return state;
      const values = { ...state.mock.values };
      const value = values[oldKey];
      delete values[oldKey];
      values[newKey] = value;
      return { mock: { ...state.mock, values } };
    }),

  removeMockKey: (key) =>
    set((state) => {
      const values = { ...state.mock.values };
      delete values[key];
      return { mock: { ...state.mock, values } };
    }),

  // One generic setter for every sport source (rather than CONVENTIONS.md's
  // literal `set<Sport>Value` per sport) — same behavior/UI outcome, less
  // repetition now that 8 sports exist side by side.
  setSportValue: (sport, key, value) =>
    set((state) => ({ [sport]: { ...state[sport], values: { ...state[sport].values, [key]: value } } }) as Partial<DataState>),

  setFeedValue: (feed, key, value) =>
    set((state) => ({ [feed]: { ...state[feed], values: { ...state[feed].values, [key]: value } } }) as Partial<DataState>),

  mergeFeedValues: (feed, values) =>
    set((state) => ({ [feed]: { ...state[feed], values: { ...state[feed].values, ...values } } }) as Partial<DataState>),

  setBrandValue: (key, value) =>
    set((state) => ({ brand: { ...state.brand, values: { ...state.brand.values, [key]: value } } })),

  setTickerValue: (key, value) =>
    set((state) => ({ ticker: { ...state.ticker, values: { ...state.ticker.values, [key]: value } } })),
}));

if (typeof window !== "undefined") {
  setInterval(() => {
    const now = new Date();
    useDataStore.setState({ clockTime: formatClock(now), nowEpochMs: now.getTime() });
  }, 1000);
}

export const FEED_IDS: FeedId[] = ["politics", "election", "weather", "program", "event", "countdown", "quote", "squad", "map", "sports"];

/** `mm:ss` under an hour, `h:mm:ss` at/above — matches `fmtDuration`'s
 * convention in playout.ts so countdown displays read consistently with the
 * rest of the app. */
function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = m.toString().padStart(2, "0");
  const sss = ss.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}

/** Per-state-snapshot memo of buildDataValues. A 3D scene subscribes MANY
 * components (one per node) to the data store; without this, every store
 * notify recomputes the full ~800-key flat map once PER NODE — heavy enough
 * that mounting a large AR model tree outlasted the 1-second clock tick,
 * which changes the snapshot mid-mount and drives React's
 * useSyncExternalStore consistency check into an infinite remount loop
 * ("Maximum update depth exceeded", caught live on the AR page). One
 * compute per state snapshot makes the per-node selectors O(1). */
let dataValuesCacheKey: unknown;
let dataValuesCache: Record<string, string> = {};
export function buildDataValuesCached(
  state: Pick<DataState, "mock" | "brand" | "ticker" | "clockTime" | "nowEpochMs" | SportId | FeedId>,
): Record<string, string> {
  if (state !== dataValuesCacheKey) {
    dataValuesCacheKey = state;
    dataValuesCache = buildDataValues(state);
  }
  return dataValuesCache;
}

/** Flattens all sources into the "source.key" -> value map bindings resolve against. */
export function buildDataValues(
  state: Pick<DataState, "mock" | "brand" | "ticker" | "clockTime" | "nowEpochMs" | SportId | FeedId>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.mock.values)) {
    values[`mock.${k}`] = v;
  }
  for (const [k, v] of Object.entries(state.brand.values)) {
    values[`brand.${k}`] = v;
  }
  for (const [k, v] of Object.entries(state.ticker.values)) {
    values[`ticker.${k}`] = v;
  }
  for (const sourceId of [...SPORT_IDS, ...FEED_IDS]) {
    const source = state[sourceId];
    for (const [k, v] of Object.entries(source.values)) {
      values[`${source.id}.${k}`] = v;
    }
  }
  values["clock.time"] = state.clockTime;
  // Derived live — never stored, so it can't drift from `nowEpochMs`/target.
  // Invalid/empty target is an honest "--:--", never a fake countdown.
  const targetMs = new Date(state.countdown.values.targetIso).getTime();
  const remainingSec = Number.isFinite(targetMs) ? Math.max(0, (targetMs - state.nowEpochMs) / 1000) : NaN;
  values["countdown.remaining"] = Number.isFinite(remainingSec) ? formatCountdown(remainingSec) : "--:--";
  values["countdown.expired"] = Number.isFinite(remainingSec) && remainingSec <= 0 ? "true" : "false";
  return values;
}
