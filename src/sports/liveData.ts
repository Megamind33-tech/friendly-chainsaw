/**
 * The shared live sports data feed (`sports.*`) every Sports AR Panel binds
 * against — the flat-key projection of `sports-live-data.schema.json`.
 *
 * EVERY default is deliberately empty: the AR models must open with no
 * team, no score, no competition, no words. Values arrive from manual
 * entry (Data workspace), local JSON/CSV import, the REST connector, a
 * WebSocket push or the test simulator — all through the same flat keys,
 * so no model ever depends on one provider.
 */

export const SPORTS_LIVE_KEYS = [
  // Event
  "event.id",
  "event.sport",
  "event.competition",
  "event.season",
  "event.round",
  "event.venue",
  "event.startTime",
  "event.status",
  "event.period",
  "event.clock",
  "event.isLive",
  // Home team
  "home.id",
  "home.name",
  "home.shortName",
  "home.logo",
  "home.score",
  "home.colourPrimary",
  "home.colourSecondary",
  // Away team
  "away.id",
  "away.name",
  "away.shortName",
  "away.logo",
  "away.score",
  "away.colourPrimary",
  "away.colourSecondary",
  // Score block
  "score.home",
  "score.away",
  "score.display",
  // Headline statistics (sport-agnostic slots; sport extensions add more)
  "stats.line1",
  "stats.line2",
  "stats.possessionHome",
  "stats.possessionAway",
  // Player spotlight
  "player.name",
  "player.number",
  "player.position",
  "player.photo",
  "player.statLine",
  // Metadata
  "metadata.provider",
  "metadata.updatedAt",
  "metadata.language",
] as const;

/** All-empty seed — the "model opens empty" guarantee lives here. */
export const SPORTS_LIVE_DEFAULTS: Record<string, string> = Object.fromEntries(
  SPORTS_LIVE_KEYS.map((k) => [k, ""]),
);

/**
 * Sport-specific extension keys — added to the SAME `sports.` namespace
 * without changing any model manifest (models bind to whatever keys exist).
 */
export const SPORT_EXTENSION_KEYS: Record<string, string[]> = {
  football: ["ext.goals", "ext.cards", "ext.subs", "ext.possession", "ext.shots", "ext.shotsOnTarget", "ext.corners", "ext.fouls", "ext.offside", "ext.formation", "ext.addedTime"],
  basketball: ["ext.quarter", "ext.gameClock", "ext.teamFouls", "ext.timeouts", "ext.fgPct", "ext.threePct", "ext.rebounds", "ext.assists", "ext.playerPoints"],
  rugby: ["ext.tries", "ext.conversions", "ext.penalties", "ext.dropGoals", "ext.cards", "ext.possession", "ext.territory", "ext.scrums", "ext.lineouts"],
  cricket: ["ext.runs", "ext.wickets", "ext.overs", "ext.runRate", "ext.target", "ext.batsman", "ext.bowler", "ext.partnership", "ext.requiredRunRate"],
  tennis: ["ext.sets", "ext.games", "ext.points", "ext.serve", "ext.tieBreak", "ext.seed", "ext.matchStatus"],
  hockey: ["ext.period", "ext.goals", "ext.penalties", "ext.powerPlay", "ext.shots", "ext.saves"],
};

/** A realistic test payload for the built-in simulator — NEVER part of any
 * model's defaults; the operator explicitly loads it to rehearse. */
export function buildSportsTestPayload(): Record<string, string> {
  return {
    "event.id": "test-0001",
    "event.sport": "football",
    "event.competition": "TEST LEAGUE",
    "event.round": "MATCHDAY 1",
    "event.venue": "TEST ARENA",
    "event.status": "LIVE",
    "event.period": "1H",
    "event.clock": "23:41",
    "event.isLive": "true",
    "home.name": "HOME UNITED",
    "home.shortName": "HOM",
    "home.score": "1",
    "home.colourPrimary": "#2a6fd4",
    "away.name": "AWAY CITY",
    "away.shortName": "AWY",
    "away.score": "0",
    "away.colourPrimary": "#d43a3a",
    "score.home": "1",
    "score.away": "0",
    "score.display": "1 - 0",
    "stats.possessionHome": "58",
    "stats.possessionAway": "42",
    "player.name": "PLAYER ONE",
    "player.number": "9",
    "metadata.provider": "simulator",
  };
}
