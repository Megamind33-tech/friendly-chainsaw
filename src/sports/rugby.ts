import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Rugby data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults. Period
 * format: "1ST HALF", "2ND HALF", "ET".
 */

export const RUGBY_KEYS = {
  homeTeam: "rugby.homeTeam",
  awayTeam: "rugby.awayTeam",
  homeScore: "rugby.homeScore",
  awayScore: "rugby.awayScore",
  clock: "rugby.clock",
  period: "rugby.period",
} as const;

/** Live defaults for the `rugby` data source — mirrors RUGBY_KEYS' fields. */
export const RUGBY_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "00:00",
  period: "1ST HALF",
};

export function createRugbyScorebug(): Layer {
  return createScorebug("rugby", "Rugby");
}
