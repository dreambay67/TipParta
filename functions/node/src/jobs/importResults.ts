import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { enqueueDailySettledAi, enqueueMatchSettledAi } from "../ai/events.js";
import { openRouterRecapProviderFromEnv } from "../ai/openRouterProvider.js";
import { adminDb } from "../firebaseAdmin.js";
import { buildMatchFingerprint, buildProviderMatchDocumentId, resolveImportedTeamSeed } from "./importFixtures.js";
import { triggerSettlementWorker, type TriggerSettlementResult } from "./triggerSettlement.js";
import { getSportsDataProvider, type SportsDataProviderKey } from "../providers/index.js";
import { aiProviderSecrets, resultImportSecrets } from "../secrets.js";
import { DEFAULT_TOURNAMENT_KEY } from "../longTerm.js";
import type { ProviderResult, SportsDataProvider } from "../providers/types.js";

const SK_TIME_ZONE = "Europe/Bratislava";

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
  ref?: DocRefLike;
};

type QuerySnapshotLike = {
  docs: SnapshotLike[];
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
  set(data: Record<string, unknown>, options: { merge: boolean }): Promise<unknown> | void;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  add(data: Record<string, unknown>): Promise<unknown>;
  where?(fieldPath: string, opStr: "==", value: unknown): QueryLike;
};

type QueryLike = {
  where(fieldPath: string, opStr: "==", value: unknown): QueryLike;
  limit(count: number): { get(): Promise<QuerySnapshotLike> };
};

type ResultImportDb = Pick<Firestore, "collection"> & {
  collection(name: string): CollectionLike;
};

export type ResultImportResult = {
  resultCount: number;
  finishedCount: number;
  liveCount: number;
  settlementTriggeredCount: number;
  missingMatchCount: number;
};

type Score = {
  home: number;
  away: number;
};

type TriggerSettlement = (matchId: string) => Promise<TriggerSettlementResult>;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function validFinalScore(value: unknown): value is Score {
  if (!value || typeof value !== "object") {
    return false;
  }

  const score = value as Record<string, unknown>;
  return (
    typeof score.home === "number" &&
    Number.isInteger(score.home) &&
    score.home >= 0 &&
    typeof score.away === "number" &&
    Number.isInteger(score.away) &&
    score.away >= 0
  );
}

function scoreChanged(previous: unknown, next: Score): boolean {
  return !validFinalScore(previous) || previous.home !== next.home || previous.away !== next.away;
}

function settlementAlreadyTriggeredForScore(data: Record<string, unknown>, score: Score): boolean {
  return data.settlementTriggerStatus === "success" && !scoreChanged(data.settlementTriggeredFinalScore, score);
}

function finishedStatus(value: unknown): boolean {
  return value === "finished" || value === "settled";
}

function cancelledStatus(value: unknown): boolean {
  return value === "cancelled";
}

function liveStatus(value: unknown): boolean {
  return value === "live";
}

function ticketCanBeFinalized(status: unknown): boolean {
  return status === "locked" || status === "settled";
}

function formatSettledAtSk(date: Date): string {
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: SK_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function dateFromEnv(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function resultImportScheduleIsActive(now: Date = new Date()): boolean {
  const from = dateFromEnv(process.env.RESULT_IMPORT_ACTIVE_FROM);
  const until = dateFromEnv(process.env.RESULT_IMPORT_ACTIVE_UNTIL);

  if (from && now.getTime() < from.getTime()) {
    return false;
  }

  if (until && now.getTime() > until.getTime()) {
    return false;
  }

  return true;
}

function ticketResultEmailJob(ticketId: string, nowIso: string): Record<string, unknown> {
  return {
    type: "ticketResult",
    status: "queued",
    ticketId,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function resultMatchFingerprint(tournamentKey: string, result: ProviderResult): string | undefined {
  if (!result.homeTeamName || !result.awayTeamName || !result.kickoffAtUtc) {
    return undefined;
  }

  const homeTeam = resolveImportedTeamSeed(tournamentKey, result.homeTeamName);
  const awayTeam = resolveImportedTeamSeed(tournamentKey, result.awayTeamName);
  if (!homeTeam || !awayTeam) {
    return undefined;
  }

  try {
    return buildMatchFingerprint(homeTeam.code, awayTeam.code, result.kickoffAtUtc);
  } catch {
    return undefined;
  }
}

function providerMatchConflictsWithFingerprint(
  match: { data: Record<string, unknown> } | null,
  matchFingerprint: string | undefined
): boolean {
  return (
    typeof match?.data.matchFingerprint === "string" &&
    matchFingerprint !== undefined &&
    match.data.matchFingerprint !== matchFingerprint
  );
}

async function firstMatchFromQuery(
  query: QueryLike
): Promise<{ id: string; ref: DocRefLike; data: Record<string, unknown> } | null> {
  const querySnap = await query.limit(1).get();
  const matchSnap = querySnap.docs[0];

  if (!matchSnap?.ref || !matchSnap.id) {
    return null;
  }

  return {
    id: matchSnap.id,
    ref: matchSnap.ref,
    data: matchSnap.data() ?? {}
  };
}

async function findMatchByProviderMatchId(
  db: ResultImportDb,
  tournamentKey: string,
  providerMatchId: string
): Promise<{ id: string; ref: DocRefLike; data: Record<string, unknown> } | null> {
  const deterministicId = buildProviderMatchDocumentId(tournamentKey, providerMatchId);
  const deterministicRef = db.collection("matches").doc(deterministicId);
  const deterministicSnap = await deterministicRef.get();

  if (deterministicSnap.exists) {
    return {
      id: deterministicId,
      ref: deterministicRef,
      data: deterministicSnap.data() ?? {}
    };
  }

  const matches = db.collection("matches");
  if (typeof matches.where === "function") {
    const byTournamentKey = await firstMatchFromQuery(
      matches.where("providerMatchId", "==", providerMatchId).where("tournamentKey", "==", tournamentKey)
    );
    if (byTournamentKey) {
      return byTournamentKey;
    }

    const byTournamentId = await firstMatchFromQuery(
      matches.where("providerMatchId", "==", providerMatchId).where("tournamentId", "==", tournamentKey)
    );
    if (byTournamentId) {
      return byTournamentId;
    }
  }

  return null;
}

async function findMatchByFingerprint(
  db: ResultImportDb,
  tournamentKey: string,
  matchFingerprint: string | undefined
): Promise<{ id: string; ref: DocRefLike; data: Record<string, unknown> } | null> {
  if (!matchFingerprint) {
    return null;
  }

  const matches = db.collection("matches");
  if (typeof matches.where !== "function") {
    return null;
  }

  const byTournamentKey = await firstMatchFromQuery(
    matches.where("tournamentKey", "==", tournamentKey).where("matchFingerprint", "==", matchFingerprint)
  );
  if (byTournamentKey) {
    return byTournamentKey;
  }

  return firstMatchFromQuery(
    matches.where("tournamentId", "==", tournamentKey).where("matchFingerprint", "==", matchFingerprint)
  );
}

async function writeImportLog(db: ResultImportDb, data: Record<string, unknown>): Promise<void> {
  await db.collection("providerImportLogs").add({
    ...data,
    createdAt: Timestamp.fromDate(new Date())
  });
}

async function finalizeTicketIfComplete(db: ResultImportDb, ticketId: string, now: Date): Promise<boolean> {
  const ticketRef = db.collection("tickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) {
    return false;
  }

  const ticket = ticketSnap.data() ?? {};
  if (!ticketCanBeFinalized(ticket.status)) {
    return false;
  }

  const matchIds = stringArray(ticket.matchIds);
  if (matchIds.length === 0) {
    return false;
  }

  const matches = await Promise.all(
    matchIds.map(async (matchId) => {
      const snap = await db.collection("matches").doc(matchId).get();
      return { id: matchId, ref: db.collection("matches").doc(matchId), data: snap.data() ?? {}, exists: snap.exists };
    })
  );

  const complete = matches.every((match) => {
    if (!match.exists) {
      return false;
    }

    if (cancelledStatus(match.data.status)) {
      return true;
    }

    return (
      finishedStatus(match.data.status) &&
      validFinalScore(match.data.finalScore) &&
      match.data.settlementTriggerStatus === "success"
    );
  });

  if (!complete) {
    return false;
  }

  const nowIso = now.toISOString();
  for (const match of matches) {
    if (cancelledStatus(match.data.status)) {
      continue;
    }

    await match.ref.set(
      {
        status: "settled",
        updatedAt: Timestamp.fromDate(now)
      },
      { merge: true }
    );
  }

  await ticketRef.set(
    {
      status: "settled",
      settledAt: nowIso,
      settledAtSk: formatSettledAtSk(now),
      updatedAt: nowIso
    },
    { merge: true }
  );

  const emailJobRef = db.collection("emailJobs").doc(`ticketResult_${ticketId}`);
  const emailJobSnap = await emailJobRef.get();
  if (!emailJobSnap.exists) {
    await emailJobRef.set(ticketResultEmailJob(ticketId, nowIso), { merge: true });
  }

  await enqueueDailySettledAi({
    db: db as never,
    ticketId,
    provider: openRouterRecapProviderFromEnv("daily"),
    now: () => now
  });

  return true;
}

async function assertAdmin(uid: string): Promise<void> {
  const snap = await adminDb.collection("players").doc(uid).get();

  if (snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Iba admin moze spustit import vysledkov.");
  }
}

export async function importResultsFromProvider({
  db = adminDb as unknown as ResultImportDb,
  provider,
  tournamentKey,
  triggerSettlement = (matchId: string) => triggerSettlementWorker(matchId),
  now = () => new Date()
}: {
  db?: ResultImportDb;
  provider: SportsDataProvider;
  tournamentKey: string;
  triggerSettlement?: TriggerSettlement;
  now?: () => Date;
}): Promise<ResultImportResult> {
  try {
    const results = await provider.listResults(tournamentKey);
    let finishedCount = 0;
    let liveCount = 0;
    let settlementTriggeredCount = 0;
    let missingMatchCount = 0;
    const touchedTicketIds = new Set<string>();

    for (const result of results) {
      if (result.status !== "finished" && result.status !== "cancelled" && result.status !== "live") {
        continue;
      }

      const matchFingerprint = resultMatchFingerprint(tournamentKey, result);
      const providerIdMatch = await findMatchByProviderMatchId(db, tournamentKey, result.providerMatchId);
      const match = providerMatchConflictsWithFingerprint(providerIdMatch, matchFingerprint)
        ? await findMatchByFingerprint(db, tournamentKey, matchFingerprint)
        : providerIdMatch ?? (await findMatchByFingerprint(db, tournamentKey, matchFingerprint));
      if (!match) {
        missingMatchCount += 1;
        continue;
      }

      if (result.status === "live") {
        if (!result.currentScore) {
          continue;
        }

        const changed = scoreChanged(match.data.currentScore, result.currentScore);
        if ((changed || !liveStatus(match.data.status)) && match.data.status !== "settled") {
          await match.ref.set(
            {
              status: "live",
              providerStatus: result.status,
              currentScore: result.currentScore,
              resultUpdatedAt: Timestamp.fromDate(new Date()),
              updatedAt: Timestamp.fromDate(new Date())
            },
            { merge: true }
          );
          liveCount += 1;
        }

        continue;
      }

      if (result.status === "cancelled") {
        if (!cancelledStatus(match.data.status)) {
          await match.ref.set(
            {
              status: "cancelled",
              providerStatus: result.status,
              finalScore: null,
              currentScore: null,
              settlementTriggeredFinalScore: null,
              settlementTriggerStatus: null,
              resultUpdatedAt: Timestamp.fromDate(new Date()),
              updatedAt: Timestamp.fromDate(new Date())
            },
            { merge: true }
          );
        }

        if (typeof match.data.ticketId === "string" && match.data.ticketId) {
          touchedTicketIds.add(match.data.ticketId);
        }

        continue;
      }

      if (!result.finalScore) {
        continue;
      }

      const changed = scoreChanged(match.data.finalScore, result.finalScore);
      const newlyFinished = !finishedStatus(match.data.status);
      const needsSettlement = changed || newlyFinished || !settlementAlreadyTriggeredForScore(match.data, result.finalScore);

      if (!needsSettlement) {
        continue;
      }

      const nextStatus = match.data.status === "settled" ? "settled" : "finished";

      if (changed || newlyFinished) {
        await match.ref.set(
          {
            status: nextStatus,
            providerStatus: result.status,
            finalScore: result.finalScore,
            currentScore: result.finalScore,
            resultUpdatedAt: Timestamp.fromDate(new Date()),
            updatedAt: Timestamp.fromDate(new Date())
          },
          { merge: true }
        );

        finishedCount += 1;
      }

      await triggerSettlement(match.id);
      settlementTriggeredCount += 1;

      await match.ref.set(
        {
          settlementTriggeredAt: Timestamp.fromDate(new Date()),
          settlementTriggeredFinalScore: result.finalScore,
          settlementTriggerStatus: "success",
          updatedAt: Timestamp.fromDate(new Date())
        },
        { merge: true }
      );

      if (typeof match.data.ticketId === "string" && match.data.ticketId) {
        touchedTicketIds.add(match.data.ticketId);
      }

      await enqueueMatchSettledAi({
        db: db as never,
        matchId: match.id,
        provider: openRouterRecapProviderFromEnv("ticker"),
        now
      });
    }

    for (const ticketId of touchedTicketIds) {
      await finalizeTicketIfComplete(db, ticketId, now());
    }

    const importResult = {
      resultCount: results.length,
      finishedCount,
      liveCount,
      settlementTriggeredCount,
      missingMatchCount
    };

    await writeImportLog(db, {
      type: "results",
      status: "success",
      tournamentKey,
      ...importResult
    });

    return importResult;
  } catch (error) {
    await writeImportLog(db, {
      type: "results",
      status: "error",
      tournamentKey,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function importResultsJob({
  tournamentKey = process.env.SPORTS_DATA_TOURNAMENT_KEY ?? DEFAULT_TOURNAMENT_KEY,
  providerKey
}: {
  tournamentKey?: string;
  providerKey?: SportsDataProviderKey;
} = {}): Promise<ResultImportResult> {
  return importResultsFromProvider({
    provider: getSportsDataProvider({ providerKey }),
    tournamentKey
  });
}

export const importResults = onCall({ secrets: [...resultImportSecrets, ...aiProviderSecrets] }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlasenie je povinne.");
  }

  await assertAdmin(request.auth.uid);

  const data = request.data && typeof request.data === "object" ? (request.data as Record<string, unknown>) : {};
  const tournamentKey = typeof data.tournamentKey === "string" && data.tournamentKey ? data.tournamentKey : undefined;
  const providerKey = typeof data.providerKey === "string" ? (data.providerKey as SportsDataProviderKey) : undefined;

  return importResultsJob({ tournamentKey, providerKey });
});

export const importResultsScheduled = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: SK_TIME_ZONE,
    secrets: [...resultImportSecrets, ...aiProviderSecrets]
  },
  async () => {
    if (!resultImportScheduleIsActive()) {
      return;
    }

    await importResultsJob();
  }
);
