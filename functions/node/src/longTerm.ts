export type LongTermPredictionSlot = {
  key: "champion" | "second" | "third" | "fourth";
  label: string;
};

/** Placeholder identifiers: replace them during the next tournament setup. */
export const DEFAULT_TOURNAMENT_KEY = "configure-before-deploy";
export const DEFAULT_LONG_TERM_TICKET_ID = "configure-before-deploy_long-term";
export const DEFAULT_LONG_TERM_OFFICIAL_DAY = "2099-01-01";

export const LONG_TERM_PREDICTION_SLOTS: LongTermPredictionSlot[] = [
  { key: "champion", label: "Víťaz" },
  { key: "second", label: "2. miesto" },
  { key: "third", label: "3. miesto" },
  { key: "fourth", label: "4. miesto" }
];
