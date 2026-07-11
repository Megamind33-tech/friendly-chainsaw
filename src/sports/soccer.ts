import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Canonical sport data schema — soccer. The scorebug itself is now built by
 * the shared modern builder (scorebug.ts) so all 8 sports render the same
 * broadcast-grade skewed-gloss bug; this file owns only the sport's live
 * data keys + defaults (the `soccer.<field>` source in dataSources.ts).
 */

export const SOCCER_KEYS = {
  homeTeam: "soccer.homeTeam",
  awayTeam: "soccer.awayTeam",
  homeScore: "soccer.homeScore",
  awayScore: "soccer.awayScore",
  clock: "soccer.clock",
  period: "soccer.period",
} as const;

/** Live defaults for the `soccer` data source — mirrors SOCCER_KEYS' fields. */
export const SOCCER_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "00:00",
  period: "1ST",
};

export function createSoccerScorebug(): Layer {
  return createScorebug("soccer", "Soccer");
}
