export type ProviderFixture = {
  providerMatchId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAtUtc: string;
  officialMatchdayKey: string;
};

export type ProviderResult = {
  providerMatchId: string;
  homeTeamName?: string;
  awayTeamName?: string;
  kickoffAtUtc?: string;
  status: "scheduled" | "live" | "finished" | "cancelled";
  finalScore?: { home: number; away: number };
  currentScore?: { home: number; away: number };
};

export interface SportsDataProvider {
  listFixtures(tournamentKey: string): Promise<ProviderFixture[]>;
  listResults(tournamentKey: string): Promise<ProviderResult[]>;
}
