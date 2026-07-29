export const DAILY_LOCK_HOUR_SK = 18;
export const DAILY_LOCK_MINUTE_SK = 0;
export const DAILY_LOCK_TIME_SK = "18:00";

/** Placeholder identifiers: replace them during the next tournament setup. */
export const DEFAULT_TOURNAMENT_KEY = "configure-before-deploy";
export const DEFAULT_LONG_TERM_TICKET_ID = "configure-before-deploy_long-term";
export const DEFAULT_LONG_TERM_OFFICIAL_DAY = "2099-01-01";

export const LONG_TERM_PREDICTION_SLOTS = [
  { key: "champion", label: "Víťaz" },
  { key: "second", label: "2. miesto" },
  { key: "third", label: "3. miesto" },
  { key: "fourth", label: "4. miesto" }
] as const;
