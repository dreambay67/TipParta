import type { Firestore } from "firebase-admin/firestore";
import { adminDb } from "../firebaseAdmin.js";
import { ApiFootballProvider } from "./apiFootballProvider.js";
import { FootballDataProvider } from "./footballDataProvider.js";
import { ManualSportsDataProvider } from "./manualProvider.js";
import type { SportsDataProvider } from "./types.js";

export type SportsDataProviderKey = "api-football" | "football-data" | "manual";

export function getSportsDataProvider({
  providerKey = (process.env.SPORTS_DATA_PROVIDER as SportsDataProviderKey | undefined) ?? "api-football",
  db = adminDb
}: {
  providerKey?: SportsDataProviderKey;
  db?: Firestore;
} = {}): SportsDataProvider {
  if (providerKey === "api-football") {
    return new ApiFootballProvider();
  }

  if (providerKey === "football-data") {
    return new FootballDataProvider();
  }

  if (providerKey === "manual") {
    return new ManualSportsDataProvider(db);
  }

  throw new Error(`Unknown sports data provider: ${providerKey}`);
}

export * from "./types.js";

