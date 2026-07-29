import { formatInTimeZone } from "date-fns-tz";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DEFAULT_LONG_TERM_OFFICIAL_DAY,
  DEFAULT_LONG_TERM_TICKET_ID,
  DEFAULT_TOURNAMENT_KEY,
  LONG_TERM_PREDICTION_SLOTS,
} from "../longTerm.js";
import {
  resolveTournamentTeamSeed,
  type TeamSeed,
  type TeamTier
} from "../teams.js";
import { adminDb } from "../firebaseAdmin.js";
import {
  buildTicketLockAt,
  buildTicketLockAtSk,
  buildTicketLockAtUtc,
  groupMatchesForTicketDisplay,
  type TicketLockOptions
} from "../tickets.js";
import { getSportsDataProvider, type SportsDataProviderKey } from "../providers/index.js";
import { sportsDataSecrets } from "../secrets.js";
import { tournamentRuntimeConfig } from "../tournamentConfig.js";
import type { ProviderFixture, SportsDataProvider } from "../providers/types.js";

const SK_TIME_ZONE = "Europe/Bratislava";

type SnapshotLike = {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  add(data: Record<string, unknown>): Promise<unknown>;
};

type BatchLike = {
  set(ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }): void;
  commit(): Promise<unknown>;
};

type FixtureImportDb = Pick<Firestore, "batch" | "collection"> & {
  collection(name: string): CollectionLike;
  batch(): BatchLike;
};

type ImportedMatch = {
  id: string;
  providerMatchId: string;
  tournamentId: string;
  tournamentKey: string;
  ticketId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamTier: TeamTier;
  awayTeamTier: TeamTier;
  kickoffAtUtc: string;
  kickoffAtSk: string;
  matchFingerprint: string;
  officialMatchdayKey: string;
  status: "scheduled" | "live" | "finished" | "settled";
};

type FixtureImportWarning = Record<string, string>;

export type FixtureImportResult = {
  fixtureCount: number;
  matchIds: string[];
  ticketIds: string[];
  warningCount: number;
};

function safeIdPart(value: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();

  if (!safe) {
    throw new Error("Provider id produced an empty Firestore id part.");
  }

  return safe;
}

export function buildProviderMatchDocumentId(tournamentKey: string, providerMatchId: string): string {
  return `${safeIdPart(tournamentKey)}_${safeIdPart(providerMatchId)}`;
}

export function buildMatchFingerprint(homeTeamCode: string, awayTeamCode: string, kickoffAtUtc: string): string {
  return `${homeTeamCode}_${awayTeamCode}_${parseKickoffAtUtc(kickoffAtUtc)}`;
}

export function resolveImportedTeamSeed(tournamentKey: string, teamName: string): TeamSeed | undefined {
  const seed = resolveTournamentTeamSeed(tournamentKey, teamName);
  if (seed) {
    return seed;
  }

  const name = teamName.trim().replace(/\s+/g, " ");
  if (!name) {
    return undefined;
  }

  return {
    code: safeIdPart(name).toUpperCase().slice(0, 24),
    nameSk: name,
    nameEn: name,
    tier: "neutral"
  };
}

export function ticketDocumentId(tournamentKey: string, officialMatchdayKey: string): string {
  return `${safeIdPart(tournamentKey)}_${officialMatchdayKey}`;
}

function assertOfficialMatchdayKey(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`Invalid officialMatchdayKey ${value}. Expected YYYY-MM-DD.`);
  }
}

function parseKickoffAtUtc(value: string): string {
  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid kickoffAtUtc ${value}. Expected ISO date/time.`);
  }

  return parsed.toISOString();
}

function kickoffAtSk(kickoffAtUtc: string): string {
  return formatInTimeZone(new Date(kickoffAtUtc), SK_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function matchStartsBeforeTicketLock(match: ImportedMatch, ticketLock: TicketLockOptions): boolean {
  return Date.parse(match.kickoffAtUtc) < Date.parse(buildTicketLockAtUtc(match.officialMatchdayKey, ticketLock));
}

function ticketLabel(officialMatchdayKey: string): string {
  const [year, month, day] = officialMatchdayKey.split("-").map(Number);

  return `${day}. ${month}. ${year}`;
}

function preserveImportedMatchStatus(value: unknown): ImportedMatch["status"] {
  return value === "live" || value === "finished" || value === "settled" ? value : "scheduled";
}

function preserveTicketStatus(value: unknown): "open" | "locked" | "settled" {
  return value === "locked" || value === "settled" ? value : "open";
}

function ticketIsFrozen(value: unknown): boolean {
  return value === "locked" || value === "settled";
}

function normalizeFixture(tournamentKey: string, fixture: ProviderFixture): ImportedMatch {
  assertOfficialMatchdayKey(fixture.officialMatchdayKey);

  const homeTeam = resolveImportedTeamSeed(tournamentKey, fixture.homeTeamName);
  const awayTeam = resolveImportedTeamSeed(tournamentKey, fixture.awayTeamName);

  if (!homeTeam) {
    throw new Error(`Could not resolve home team "${fixture.homeTeamName}".`);
  }

  if (!awayTeam) {
    throw new Error(`Could not resolve away team "${fixture.awayTeamName}".`);
  }

  const kickoff = parseKickoffAtUtc(fixture.kickoffAtUtc);
  const ticketId = ticketDocumentId(tournamentKey, fixture.officialMatchdayKey);

  return {
    id: buildProviderMatchDocumentId(tournamentKey, fixture.providerMatchId),
    providerMatchId: fixture.providerMatchId,
    tournamentId: tournamentKey,
    tournamentKey,
    ticketId,
    homeTeamCode: homeTeam.code,
    awayTeamCode: awayTeam.code,
    homeTeamName: homeTeam.nameEn,
    awayTeamName: awayTeam.nameEn,
    homeTeamTier: homeTeam.tier,
    awayTeamTier: awayTeam.tier,
    kickoffAtUtc: kickoff,
    kickoffAtSk: kickoffAtSk(kickoff),
    matchFingerprint: buildMatchFingerprint(homeTeam.code, awayTeam.code, kickoff),
    officialMatchdayKey: fixture.officialMatchdayKey,
    status: "scheduled"
  };
}

async function ensureLongTermTicket({
  batch,
  config,
  db,
  ticketIds,
  tournamentKey
}: {
  batch: BatchLike;
  config: ReturnType<typeof tournamentRuntimeConfig>;
  db: FixtureImportDb;
  ticketIds: string[];
  tournamentKey: string;
}): Promise<void> {
  if (tournamentKey !== DEFAULT_TOURNAMENT_KEY) {
    return;
  }

  const ticketRef = db.collection("tickets").doc(DEFAULT_LONG_TERM_TICKET_ID);
  const existing = await ticketRef.get();
  const existingData = existing.data() ?? {};

  batch.set(
    ticketRef,
    {
      id: DEFAULT_LONG_TERM_TICKET_ID,
      tournamentId: tournamentKey,
      tournamentKey,
      kind: "longTerm",
      label: "Dlhodobé tipy",
      officialMatchdayKey: DEFAULT_LONG_TERM_OFFICIAL_DAY,
      lockAt: buildTicketLockAt(DEFAULT_LONG_TERM_OFFICIAL_DAY, config.ticketLock),
      lockAtSk: buildTicketLockAtSk(DEFAULT_LONG_TERM_OFFICIAL_DAY, config.ticketLock),
      lockAtUtc: buildTicketLockAtUtc(DEFAULT_LONG_TERM_OFFICIAL_DAY, config.ticketLock),
      status: preserveTicketStatus(existingData.status),
      matchIds: [],
      predictionSlots: LONG_TERM_PREDICTION_SLOTS.map((slot) => ({ ...slot })),
      updatedAt: Timestamp.fromDate(new Date())
    },
    { merge: true }
  );

  if (!ticketIds.includes(DEFAULT_LONG_TERM_TICKET_ID)) {
    ticketIds.push(DEFAULT_LONG_TERM_TICKET_ID);
  }
}

async function writeImportLog(
  db: FixtureImportDb,
  data: Record<string, unknown>
): Promise<void> {
  await db.collection("providerImportLogs").add({
    ...data,
    createdAt: Timestamp.fromDate(new Date())
  });
}

async function assertAdmin(uid: string): Promise<void> {
  const snap = await adminDb.collection("players").doc(uid).get();

  if (snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Iba admin moze spustit import zapasov.");
  }
}

export async function importFixturesFromProvider({
  db = adminDb as unknown as FixtureImportDb,
  provider,
  tournamentKey
}: {
  db?: FixtureImportDb;
  provider: SportsDataProvider;
  tournamentKey: string;
}): Promise<FixtureImportResult> {
  try {
    const config = tournamentRuntimeConfig(tournamentKey);
    const fixtures = await provider.listFixtures(tournamentKey);
    const matches = fixtures
      .map((fixture) => normalizeFixture(tournamentKey, fixture))
      .sort((left, right) => left.kickoffAtUtc.localeCompare(right.kickoffAtUtc) || left.id.localeCompare(right.id));
    const warnings: FixtureImportWarning[] = matches
      .filter((match) => matchStartsBeforeTicketLock(match, config.ticketLock))
      .map((match) => ({
        kind: "kickoff_before_ticket_lock",
        matchId: match.id,
        providerMatchId: match.providerMatchId,
        officialMatchdayKey: match.officialMatchdayKey,
        kickoffAtUtc: match.kickoffAtUtc,
        lockAtUtc: buildTicketLockAtUtc(match.officialMatchdayKey, config.ticketLock)
      }));
    const batch = db.batch();
    const groups = groupMatchesForTicketDisplay(matches, config.ticketLock);
    const frozenTicketIds = new Set<string>();
    const ticketExistingData = new Map<string, Record<string, unknown>>();
    const ticketExists = new Map<string, boolean>();
    const skippedMatchIds = new Set<string>();

    for (const group of groups) {
      const ticketId = ticketDocumentId(tournamentKey, group.officialMatchdayKey);
      const ticketRef = db.collection("tickets").doc(ticketId);
      const existing = await ticketRef.get();
      const existingData = existing.data() ?? {};
      ticketExistingData.set(ticketId, existingData);
      ticketExists.set(ticketId, existing.exists);

      if (ticketIsFrozen(existingData.status)) {
        frozenTicketIds.add(ticketId);
        warnings.push({
          kind: "frozen_ticket_skipped",
          ticketId,
          officialMatchdayKey: group.officialMatchdayKey,
          status: String(existingData.status)
        });
      }
    }

    for (const match of matches) {
      if (frozenTicketIds.has(match.ticketId)) {
        continue;
      }

      const matchRef = db.collection("matches").doc(match.id);
      const existing = await matchRef.get();
      const existingData = existing.data() ?? {};
      const oldTicketId = typeof existingData.ticketId === "string" ? existingData.ticketId : undefined;

      if (oldTicketId) {
        const oldTicketExistingData =
          ticketExistingData.get(oldTicketId) ??
          ((await db.collection("tickets").doc(oldTicketId).get()).data() ?? {});
        ticketExistingData.set(oldTicketId, oldTicketExistingData);

        if (ticketIsFrozen(oldTicketExistingData.status)) {
          skippedMatchIds.add(match.id);
          warnings.push({
            kind: "existing_frozen_ticket_match_skipped",
            matchId: match.id,
            providerMatchId: match.providerMatchId,
            oldTicketId,
            newTicketId: match.ticketId,
            status: String(oldTicketExistingData.status)
          });
          continue;
        }
      }

      batch.set(
        matchRef,
        {
          ...match,
          status: preserveImportedMatchStatus(existingData.status),
          kickoffAt: Timestamp.fromDate(new Date(match.kickoffAtUtc)),
          updatedAt: Timestamp.fromDate(new Date())
        },
        { merge: true }
      );
    }

    for (const group of groups) {
      const ticketId = ticketDocumentId(tournamentKey, group.officialMatchdayKey);
      const existingData = ticketExistingData.get(ticketId) ?? {};

      if (ticketIsFrozen(existingData.status)) {
        continue;
      }

      const ticketRef = db.collection("tickets").doc(ticketId);
      const matchIds = group.matchIds.filter((matchId) => !skippedMatchIds.has(matchId));

      if (matchIds.length === 0 && !ticketExists.get(ticketId)) {
        continue;
      }

      batch.set(
        ticketRef,
        {
          id: ticketId,
          tournamentId: tournamentKey,
          tournamentKey,
          label: ticketLabel(group.officialMatchdayKey),
          officialMatchdayKey: group.officialMatchdayKey,
          lockAt: buildTicketLockAt(group.officialMatchdayKey, config.ticketLock),
          lockAtSk: buildTicketLockAtSk(group.officialMatchdayKey, config.ticketLock),
          lockAtUtc: buildTicketLockAtUtc(group.officialMatchdayKey, config.ticketLock),
          status: preserveTicketStatus(existingData.status),
          matchIds,
          updatedAt: Timestamp.fromDate(new Date())
        },
        { merge: true }
      );
    }

    const ticketIds = groups.map((group) => ticketDocumentId(tournamentKey, group.officialMatchdayKey)).sort();
    await ensureLongTermTicket({
      batch,
      config,
      db,
      ticketIds,
      tournamentKey
    });

    await batch.commit();

    const result = {
      fixtureCount: fixtures.length,
      matchIds: matches.map((match) => match.id).sort(),
      ticketIds: ticketIds.sort(),
      warningCount: warnings.length
    };

    await writeImportLog(db, {
      type: "fixtures",
      status: "success",
      tournamentKey,
      ...result,
      warnings
    });

    return result;
  } catch (error) {
    await writeImportLog(db, {
      type: "fixtures",
      status: "error",
      tournamentKey,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function importFixturesJob({
  tournamentKey = process.env.SPORTS_DATA_TOURNAMENT_KEY ?? DEFAULT_TOURNAMENT_KEY,
  providerKey
}: {
  tournamentKey?: string;
  providerKey?: SportsDataProviderKey;
} = {}): Promise<FixtureImportResult> {
  return importFixturesFromProvider({
    provider: getSportsDataProvider({ providerKey }),
    tournamentKey
  });
}

export const importFixtures = onCall({ secrets: sportsDataSecrets }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlasenie je povinne.");
  }

  await assertAdmin(request.auth.uid);

  const data = request.data && typeof request.data === "object" ? (request.data as Record<string, unknown>) : {};
  const tournamentKey = typeof data.tournamentKey === "string" && data.tournamentKey ? data.tournamentKey : undefined;
  const providerKey = typeof data.providerKey === "string" ? (data.providerKey as SportsDataProviderKey) : undefined;

  return importFixturesJob({ tournamentKey, providerKey });
});

export const importFixturesScheduled = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: SK_TIME_ZONE,
    secrets: sportsDataSecrets
  },
  async () => {
    await importFixturesJob();
  }
);
