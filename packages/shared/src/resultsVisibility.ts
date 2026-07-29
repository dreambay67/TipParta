export type ResultsVisibilitySection = "leaderboards" | "previousDay" | "badges" | "records";

export type ResultsVisibilitySettings = {
  leaderboardsHidden: boolean;
  previousDayHidden: boolean;
  badgesHidden: boolean;
  recordsHidden: boolean;
};

export const DEFAULT_RESULTS_VISIBILITY: ResultsVisibilitySettings = {
  leaderboardsHidden: false,
  previousDayHidden: false,
  badgesHidden: false,
  recordsHidden: false,
};

const sectionKeyByName: Record<ResultsVisibilitySection, keyof ResultsVisibilitySettings> = {
  leaderboards: "leaderboardsHidden",
  previousDay: "previousDayHidden",
  badges: "badgesHidden",
  records: "recordsHidden",
};

export function normalizeResultsVisibility(value: unknown): ResultsVisibilitySettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RESULTS_VISIBILITY };
  }

  const source = value as Partial<Record<keyof ResultsVisibilitySettings, unknown>>;

  return {
    leaderboardsHidden: source.leaderboardsHidden === true,
    previousDayHidden: source.previousDayHidden === true,
    badgesHidden: source.badgesHidden === true,
    recordsHidden: source.recordsHidden === true,
  };
}

export function isResultsSectionHidden(
  settings: ResultsVisibilitySettings,
  section: ResultsVisibilitySection,
): boolean {
  return settings[sectionKeyByName[section]];
}

export function toggleResultsSectionVisibility(
  settings: ResultsVisibilitySettings,
  section: ResultsVisibilitySection,
): ResultsVisibilitySettings {
  const key = sectionKeyByName[section];

  return {
    ...settings,
    [key]: !settings[key],
  };
}
