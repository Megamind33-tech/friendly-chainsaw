import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Tennis data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults.
 * homeScore/awayScore carry game points (0/15/30/40/AD), period the set,
 * and homeSets/awaySets stay available for the full-screen templates.
 */

export const TENNIS_KEYS = {
  homeTeam: "tennis.homeTeam",
  awayTeam: "tennis.awayTeam",
  homeScore: "tennis.homeScore",
  awayScore: "tennis.awayScore",
  clock: "tennis.clock",
  period: "tennis.period",
  homeSets: "tennis.homeSets",
  awaySets: "tennis.awaySets",
} as const;

/** Live defaults for the `tennis` data source — mirrors TENNIS_KEYS' fields. */
export const TENNIS_DEFAULTS: Record<string, string> = {
  homeTeam: "PLAYER 1",
  awayTeam: "PLAYER 2",
  homeScore: "0",
  awayScore: "0",
  clock: "-",
  period: "SET 1",
  homeSets: "0",
  awaySets: "0",
};

export function createTennisScorebug(): Layer {
  return createScorebug("tennis", "Tennis");
}
