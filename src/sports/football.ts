import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * American football data schema. The bug is built by the shared modern
 * builder (scorebug.ts); this file owns the sport's live keys + defaults.
 * `down`/`distance` stay available for the stat/full-screen templates.
 */

export const FOOTBALL_KEYS = {
  homeTeam: "football.homeTeam",
  awayTeam: "football.awayTeam",
  homeScore: "football.homeScore",
  awayScore: "football.awayScore",
  clock: "football.clock",
  period: "football.period",
  down: "football.down",
  distance: "football.distance",
} as const;

/** Live defaults for the `football` data source — mirrors FOOTBALL_KEYS' fields. */
export const FOOTBALL_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "00:00",
  period: "Q1",
  down: "1ST",
  distance: "& 10",
};

export function createFootballScorebug(): Layer {
  return createScorebug("football", "Football");
}
