/**
 * Shared sports domain identifiers.  This deliberately lives in the sports
 * domain rather than document/dataSources so scorebug factories do not need
 * to reach back into the data-store implementation just to name a sport.
 */
export const SPORT_IDS = [
  "soccer",
  "basketball",
  "football",
  "baseball",
  "hockey",
  "tennis",
  "volleyball",
  "rugby",
] as const;

export type SportId = (typeof SPORT_IDS)[number];
