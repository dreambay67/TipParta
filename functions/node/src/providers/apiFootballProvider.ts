import type { ProviderFixture, ProviderResult, SportsDataProvider } from "./types.js";
import { apiFootballKeySecret, secretValue, sportsDataApiKeySecret } from "../secrets.js";

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

type ApiFootballFixture = {
  fixture?: {
    id?: number | string;
    date?: string;
    status?: { short?: string };
  };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
  score?: {
    fulltime?: {
      home?: number | null;
      away?: number | null;
    };
  };
};

type ApiFootballResponse = {
  errors?: unknown;
  response?: ApiFootballFixture[];
};

type ApiFootballTournamentProfile = {
  leagueId: number;
  season: number;
  matchdayTimeZone: string;
  from?: string;
  to?: string;
};

function apiKey(): string {
  const key =
    secretValue(apiFootballKeySecret, "API_FOOTBALL_KEY") ??
    secretValue(sportsDataApiKeySecret, "SPORTS_DATA_API_KEY");

  if (!key) {
    throw new Error("API-Football is not configured. Add a new key only when the next tournament is approved.");
  }

  return key;
}

function configuredProfile(): ApiFootballTournamentProfile {
  const leagueId = Number(process.env.SPORTS_DATA_LEAGUE_ID);
  const season = Number(process.env.SPORTS_DATA_SEASON);

  if (!Number.isInteger(leagueId) || leagueId <= 0 || !Number.isInteger(season) || season <= 0) {
    throw new Error(
      "API-Football is dormant. Set SPORTS_DATA_LEAGUE_ID and SPORTS_DATA_SEASON for a new tournament before enabling imports."
    );
  }

  return {
    leagueId,
    season,
    matchdayTimeZone: process.env.SPORTS_DATA_MATCHDAY_TIME_ZONE?.trim() || "Europe/Bratislava",
    ...(process.env.SPORTS_DATA_FROM?.trim() ? { from: process.env.SPORTS_DATA_FROM.trim() } : {}),
    ...(process.env.SPORTS_DATA_TO?.trim() ? { to: process.env.SPORTS_DATA_TO.trim() } : {})
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`API-Football fixture is missing ${label}.`);
  }

  return value.trim();
}

function requireProviderMatchId(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new Error("API-Football fixture is missing fixture.id.");
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function profileIncludesFixture(fixture: ApiFootballFixture, profile: ApiFootballTournamentProfile): boolean {
  const kickoff = new Date(requireString(fixture.fixture?.date, "fixture.date"));
  const key = dateKeyInTimeZone(kickoff, profile.matchdayTimeZone);
  return (!profile.from || key >= profile.from) && (!profile.to || key <= profile.to);
}

function providerStatus(shortStatus: unknown): ProviderResult["status"] {
  if (shortStatus === "FT" || shortStatus === "AET" || shortStatus === "PEN") {
    return "finished";
  }

  if (typeof shortStatus === "string" && ["ABD", "AWD", "CANC", "PST", "WO"].includes(shortStatus)) {
    return "cancelled";
  }

  if (typeof shortStatus === "string" && ["1H", "HT", "2H", "ET", "BT", "P"].includes(shortStatus)) {
    return "live";
  }

  return "scheduled";
}

type ScorePair = { home?: number | null; away?: number | null };

function score(value: ScorePair | undefined): { home: number; away: number } | undefined {
  const home = value?.home;
  const away = value?.away;
  return typeof home === "number" && Number.isInteger(home) && home >= 0 && typeof away === "number" && Number.isInteger(away) && away >= 0
    ? { home, away }
    : undefined;
}

function errorMessage(errors: unknown): string | undefined {
  if (!errors) {
    return undefined;
  }

  const text = typeof errors === "string" ? errors : JSON.stringify(errors);
  return text && text !== "{}" && text !== "[]" ? text.replace(/\s+/g, " ").slice(0, 500) : undefined;
}

export class ApiFootballProvider implements SportsDataProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listFixtures(_tournamentKey: string): Promise<ProviderFixture[]> {
    const profile = configuredProfile();
    return (await this.fetchFixtures(profile))
      .filter((fixture) => profileIncludesFixture(fixture, profile) && providerStatus(fixture.fixture?.status?.short) !== "cancelled")
      .map((fixture) => {
        const kickoff = new Date(requireString(fixture.fixture?.date, "fixture.date"));
        if (!Number.isFinite(kickoff.getTime())) {
          throw new Error("API-Football fixture.date is not a valid ISO date.");
        }

        return {
          providerMatchId: requireProviderMatchId(fixture.fixture?.id),
          homeTeamName: requireString(fixture.teams?.home?.name, "teams.home.name"),
          awayTeamName: requireString(fixture.teams?.away?.name, "teams.away.name"),
          kickoffAtUtc: kickoff.toISOString(),
          officialMatchdayKey: dateKeyInTimeZone(kickoff, profile.matchdayTimeZone)
        };
      });
  }

  async listResults(_tournamentKey: string): Promise<ProviderResult[]> {
    const profile = configuredProfile();
    return (await this.fetchFixtures(profile))
      .filter((fixture) => profileIncludesFixture(fixture, profile))
      .map((fixture) => {
        const status = providerStatus(fixture.fixture?.status?.short);
        const finalScore = status === "finished" ? score(fixture.score?.fulltime) : undefined;
        const currentScore = status === "live" ? score(fixture.goals) : finalScore;

        return {
          providerMatchId: requireProviderMatchId(fixture.fixture?.id),
          homeTeamName: fixture.teams?.home?.name,
          awayTeamName: fixture.teams?.away?.name,
          kickoffAtUtc: fixture.fixture?.date ? new Date(fixture.fixture.date).toISOString() : undefined,
          status,
          ...(finalScore ? { finalScore } : {}),
          ...(currentScore ? { currentScore } : {})
        };
      });
  }

  private async fetchFixtures(profile: ApiFootballTournamentProfile): Promise<ApiFootballFixture[]> {
    const url = new URL("/fixtures", API_FOOTBALL_BASE_URL);
    url.searchParams.set("league", String(profile.leagueId));
    url.searchParams.set("season", String(profile.season));
    if (profile.from) {
      url.searchParams.set("from", profile.from);
    }
    if (profile.to) {
      url.searchParams.set("to", profile.to);
    }

    const response = await this.fetchImpl(url, { headers: { "x-apisports-key": apiKey() } });
    if (!response.ok) {
      throw new Error(`API-Football fixtures request failed with HTTP ${response.status}.`);
    }

    const json = (await response.json()) as ApiFootballResponse;
    const providerError = errorMessage(json.errors);
    if (providerError) {
      throw new Error(`API-Football fixtures request failed: ${providerError}`);
    }

    return Array.isArray(json.response) ? json.response : [];
  }
}
