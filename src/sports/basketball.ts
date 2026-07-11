import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Basketball data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults. `fouls`
 * stays available for the stat/full-screen templates even though the core
 * bug shows the 6 shared fields.
 */

export const BASKETBALL_KEYS = {
  homeTeam: "basketball.homeTeam",
  awayTeam: "basketball.awayTeam",
  homeScore: "basketball.homeScore",
  awayScore: "basketball.awayScore",
  clock: "basketball.clock",
  period: "basketball.period",
  fouls: "basketball.fouls",
} as const;

/** Live defaults for the `basketball` data source — mirrors BASKETBALL_KEYS' fields. */
export const BASKETBALL_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "12:00",
  period: "Q1",
  fouls: "0",
};

export function createBasketballScorebug(): Layer {
  return createScorebug("basketball", "Basketball");
}
