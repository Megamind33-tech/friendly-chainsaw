import type { Layer } from "@/document/types";
import { createElectionStrap, createResultsBoard } from "./politics";
import { createConditionsStrap, createForecastBoard } from "./weather";
import { createUpNextStrap, createPresenterStrap, createComingUpRundown } from "./program";
import { createScriptureBoard, createSpeakerStrap, createWorshipStrap } from "./faith";

/**
 * Genre template registry (Phase 5.7) — the non-sports show-graphics
 * families, grouped into categories for the Templates panel. Every builder
 * is sport-independent (unlike the sports templates) and binds to its own
 * live feed source (politics/weather/program/event). Clicking a card calls
 * `create()` fresh so the inserted layer gets new ids.
 */

export interface GenreTemplate {
  id: string;
  label: string;
  note: string;
  create: () => Layer;
}

export interface GenreCategory {
  id: string;
  label: string;
  templates: GenreTemplate[];
}

export const GENRE_CATEGORIES: GenreCategory[] = [
  {
    id: "politics",
    label: "Politics",
    templates: [
      { id: "politics-election-strap", label: "Election Strap", note: "lower third · live results", create: createElectionStrap },
      { id: "politics-results-board", label: "Results Board", note: "full-screen · animated", create: createResultsBoard },
    ],
  },
  {
    id: "weather",
    label: "Weather",
    templates: [
      { id: "weather-conditions", label: "Conditions Strap", note: "lower third · live", create: createConditionsStrap },
      { id: "weather-forecast", label: "5-Day Forecast", note: "full-screen · animated", create: createForecastBoard },
    ],
  },
  {
    id: "program",
    label: "Program",
    templates: [
      { id: "program-upnext", label: "Up Next Strap", note: "lower third", create: createUpNextStrap },
      { id: "program-presenter", label: "Presenter Strap", note: "name-strap", create: createPresenterStrap },
      { id: "program-rundown", label: "Coming Up Rundown", note: "full-screen · animated", create: createComingUpRundown },
    ],
  },
  {
    id: "faith",
    label: "Faith / Events",
    templates: [
      { id: "faith-scripture", label: "Scripture Board", note: "full-screen · verse", create: createScriptureBoard },
      { id: "faith-speaker", label: "Speaker Strap", note: "name-strap", create: createSpeakerStrap },
      { id: "faith-worship", label: "Worship Now-Playing", note: "lower third", create: createWorshipStrap },
    ],
  },
];
