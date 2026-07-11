import type { Layer } from "@/document/types";
import { createScorebug } from "./scorebug";

/**
 * Hockey data schema. The bug is built by the shared modern builder
 * (scorebug.ts); this file owns the sport's live keys + defaults.
 * `powerPlay` stays available for the stat/full-screen templates.
 */

export const HOCKEY_KEYS = {
  homeTeam: "hockey.homeTeam",
  awayTeam: "hockey.awayTeam",
  homeScore: "hockey.homeScore",
  awayScore: "hockey.awayScore",
  clock: "hockey.clock",
  period: "hockey.period",
  powerPlay: "hockey.powerPlay",
} as const;

/** Live defaults for the `hockey` data source — mirrors HOCKEY_KEYS' fields. */
export const HOCKEY_DEFAULTS: Record<string, string> = {
  homeTeam: "HOME",
  awayTeam: "AWAY",
  homeScore: "0",
  awayScore: "0",
  clock: "00:00",
  period: "1ST",
  powerPlay: "",
};

export function createHockeyScorebug(): Layer {
  return createScorebug("hockey", "Hockey");
}
