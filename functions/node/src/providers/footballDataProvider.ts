import type { ProviderFixture, ProviderResult, SportsDataProvider } from "./types.js";
import { footballDataApiKeySecret, secretValue, sportsDataApiKeySecret } from "../secrets.js";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
const WORLD_CUP_COMPETITION_CODE = "WC";

type FootballDataMatch = {
  id?: number | string;
  utcDate?: string;
  status?: string;
  homeTeam?: { name?: string; shortName?: string; tla?: string };
  awayTeam?: { name?: string; shortName?: string; tla?: string };
  score?: {
    fullTime?: {
      home?: number | null;
      away?: number | null;
    };
  };
};

type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

function apiKey(): string {
  const key =
    secretValue(footballDataApiKeySecret, "FOOTBALL_DATA_API_KEY") ??
    secretValue(sportsDataApiKeySecret, "SPORTS_DATA_API_KEY");

  if (!key) {
    throw new Error("FOOTBALL_DATA_API_KEY or SPORTS_DATA_API_KEY is required for football-data.org.");
  }

  return key;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`football-data.org match is missing ${label}.`);
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

  throw new Error("football-data.org match is missing id.");
}

function parseMatchdayKeyOverrides(): Record<string, string> {
  const raw = process.env.FOOTBALL_DATA_MATCHDAY_KEYS_JSON;
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry[1]))
      .map(([matchId, key]) => [matchId.trim(), key])
  );
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

function explicitOfficialMatchdayKey(providerMatchId: string, kickoffAtUtc: string): string {
  const mapped = parseMatchdayKeyOverrides()[providerMatchId];
  if (mapped) {
    return mapped;
  }

  const timeZone = process.env.FOOTBALL_DATA_MATCHDAY_TIME_ZONE;
  if (timeZone) {
    return dateKeyInTimeZone(new Date(kickoffAtUtc), timeZone);
  }

  throw new Error(
    "FOOTBALL_DATA_MATCHDAY_KEYS_JSON or FOOTBALL_DATA_MATCHDAY_TIME_ZONE is required before football-data.org fixture import."
  );
}

function providerStatus(value: unknown): ProviderResult["status"] {
  if (value === "FINISHED") {
    return "finished";
  }

  if (value === "CANCELLED" || value === "POSTPONED" || value === "SUSPENDED") {
    return "cancelled";
  }

  if (value === "IN_PLAY" || value === "PAUSED") {
    return "live";
  }

  return "scheduled";
}

function fullTimeScore(match: FootballDataMatch): ProviderResult["finalScore"] {
  const home = match.score?.fullTime?.home;
  const away = match.score?.fullTime?.away;

  if (
    typeof home === "number" &&
    Number.isInteger(home) &&
    home >= 0 &&
    typeof away === "number" &&
    Number.isInteger(away) &&
    away >= 0
  ) {
    return { home, away };
  }

  return undefined;
}

export class FootballDataProvider implements SportsDataProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async listFixtures(_tournamentKey: string): Promise<ProviderFixture[]> {
    const matches = await this.fetchMatches();

    return matches.map((match) => {
      const providerMatchId = requireProviderMatchId(match.id);
      const kickoffAtUtc = new Date(requireString(match.utcDate, "utcDate")).toISOString();

      return {
        providerMatchId,
        homeTeamName: requireString(match.homeTeam?.name ?? match.homeTeam?.shortName ?? match.homeTeam?.tla, "homeTeam"),
        awayTeamName: requireString(match.awayTeam?.name ?? match.awayTeam?.shortName ?? match.awayTeam?.tla, "awayTeam"),
        kickoffAtUtc,
        officialMatchdayKey: explicitOfficialMatchdayKey(providerMatchId, kickoffAtUtc)
      };
    });
  }

  async listResults(_tournamentKey: string): Promise<ProviderResult[]> {
    const matches = await this.fetchMatches();

    return matches.map((match) => {
      const status = providerStatus(match.status);
      const kickoffAtUtc = match.utcDate ? new Date(match.utcDate).toISOString() : undefined;

      return {
        providerMatchId: requireProviderMatchId(match.id),
        homeTeamName: match.homeTeam?.name ?? match.homeTeam?.shortName ?? match.homeTeam?.tla,
        awayTeamName: match.awayTeam?.name ?? match.awayTeam?.shortName ?? match.awayTeam?.tla,
        kickoffAtUtc,
        status,
        finalScore: status === "finished" ? fullTimeScore(match) : undefined
      };
    });
  }

  private async fetchMatches(): Promise<FootballDataMatch[]> {
    const response = await this.fetchImpl(`${FOOTBALL_DATA_BASE_URL}/competitions/${WORLD_CUP_COMPETITION_CODE}/matches`, {
      headers: {
        "X-Auth-Token": apiKey()
      }
    });

    if (!response.ok) {
      throw new Error(`football-data.org matches request failed with HTTP ${response.status}.`);
    }

    const json = (await response.json()) as FootballDataMatchesResponse;
    return Array.isArray(json.matches) ? json.matches : [];
  }
}
