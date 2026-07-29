import type { Firestore } from "firebase-admin/firestore";
import type { ProviderFixture, ProviderResult, SportsDataProvider } from "./types.js";

type ProviderDoc = Record<string, unknown>;

type ManualProviderDb = Pick<Firestore, "collection">;

function stringField(data: ProviderDoc, field: string): string {
  const value = data[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Manual provider document is missing ${field}.`);
  }

  return value.trim();
}

function optionalStringField(data: ProviderDoc, field: string): string | undefined {
  const value = data[field];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalScore(data: ProviderDoc, field: "finalScore" | "currentScore"): ProviderResult["finalScore"] {
  const value = data[field];

  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== "object") {
    throw new Error(`Manual provider ${field} must be an object.`);
  }

  const score = value as Record<string, unknown>;
  if (
    typeof score.home !== "number" ||
    !Number.isInteger(score.home) ||
    score.home < 0 ||
    typeof score.away !== "number" ||
    !Number.isInteger(score.away) ||
    score.away < 0
  ) {
    throw new Error(`Manual provider ${field} must contain non-negative integer home and away scores.`);
  }

  return { home: score.home, away: score.away };
}

function providerStatus(data: ProviderDoc): ProviderResult["status"] {
  const value = data.status;

  if (value === "scheduled" || value === "live" || value === "finished" || value === "cancelled") {
    return value;
  }

  throw new Error("Manual provider result status must be scheduled, live, finished, or cancelled.");
}

export function normalizeManualFixture(data: ProviderDoc): ProviderFixture {
  return {
    providerMatchId: stringField(data, "providerMatchId"),
    homeTeamName: stringField(data, "homeTeamName"),
    awayTeamName: stringField(data, "awayTeamName"),
    kickoffAtUtc: stringField(data, "kickoffAtUtc"),
    officialMatchdayKey: stringField(data, "officialMatchdayKey")
  };
}

export function normalizeManualResult(data: ProviderDoc): ProviderResult {
  const finalScore = optionalScore(data, "finalScore");
  const currentScore = optionalScore(data, "currentScore");

  return {
    providerMatchId: stringField(data, "providerMatchId"),
    homeTeamName: optionalStringField(data, "homeTeamName"),
    awayTeamName: optionalStringField(data, "awayTeamName"),
    kickoffAtUtc: optionalStringField(data, "kickoffAtUtc"),
    status: providerStatus(data),
    ...(finalScore ? { finalScore } : {}),
    ...(currentScore ? { currentScore } : {})
  };
}

export class ManualSportsDataProvider implements SportsDataProvider {
  constructor(private readonly db: ManualProviderDb) {}

  async listFixtures(tournamentKey: string): Promise<ProviderFixture[]> {
    const snap = await this.db
      .collection("providerFixtures")
      .doc(tournamentKey)
      .collection("fixtures")
      .get();

    return snap.docs.map((doc) => normalizeManualFixture(doc.data() ?? {}));
  }

  async listResults(tournamentKey: string): Promise<ProviderResult[]> {
    const snap = await this.db
      .collection("providerResults")
      .doc(tournamentKey)
      .collection("results")
      .get();

    return snap.docs.map((doc) => normalizeManualResult(doc.data() ?? {}));
  }
}
