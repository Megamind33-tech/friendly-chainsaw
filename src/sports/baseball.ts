import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Baseball data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults.
 * `balls`/`strikes`/`outs` stay available for the stat/full-screen templates.
 */

export const BASEBALL_KEYS = {
  homeTeam: "baseball.homeTeam",
  awayTeam: "baseball.awayTeam",
  homeScore: "baseball.homeScore",
  awayScore: "baseball.awayScore",
  clock: "baseball.clock",
  period: "baseball.period",
  balls: "baseball.balls",
  strikes: "baseball.strikes",
  outs: "baseball.outs",
} as const;

/** Live defaults for the `baseball` data source — mirrors BASEBALL_KEYS' fields. */
export const BASEBALL_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "-",
  period: "TOP 1",
  balls: "0",
  strikes: "0",
  outs: "0",
};

export function createBaseballScorebug(): Layer {
  return createScorebug("baseball", "Baseball");
}
