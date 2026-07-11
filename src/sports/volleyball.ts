import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Volleyball data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults. Volleyball
 * has no game clock (clock "-"), period is the current set, and
 * homeSets/awaySets stay available for the full-screen templates.
 */

export const VOLLEYBALL_KEYS = {
  homeTeam: "volleyball.homeTeam",
  awayTeam: "volleyball.awayTeam",
  homeScore: "volleyball.homeScore",
  awayScore: "volleyball.awayScore",
  clock: "volleyball.clock",
  period: "volleyball.period",
  homeSets: "volleyball.homeSets",
  awaySets: "volleyball.awaySets",
} as const;

/** Live defaults for the `volleyball` data source — mirrors VOLLEYBALL_KEYS' fields. */
export const VOLLEYBALL_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "-",
  period: "SET 1",
  homeSets: "0",
  awaySets: "0",
};

export function createVolleyballScorebug(): Layer {
  return createScorebug("volleyball", "Volleyball");
}
