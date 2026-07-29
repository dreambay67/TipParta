import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { enqueueTicketLockedAi } from "./ai/events.js";
import { openRouterRecapProviderFromEnv } from "./ai/openRouterProvider.js";
import { adminDb } from "./firebaseAdmin.js";
import { LONG_TERM_PREDICTION_SLOTS, type LongTermPredictionSlot } from "./longTerm.js";
import { aiProviderSecrets } from "./secrets.js";

const SK_TIME_ZONE = "Europe/Bratislava";
const DAILY_LOCK_HOUR_SK = 18;
const DAILY_LOCK_MINUTE_SK = 0;
const MAX_ID_PART_LENGTH = 256;
const MISSING_TIPS_REMINDER_MS = 60 * 60 * 1000;

export type TicketLockOptions = {
  hourSk?: number;
  minuteSk?: number;
  dateOverrides?: Record<string, { hourSk?: number; minuteSk?: number }>;
};

type Score = {
  home: number;
  away: number;
};

type TicketDisplayMatch = {
  id: string;
  officialMatchdayKey: string;
  kickoffAtSk?: string;
  kickoffAtUtc?: string;
};

export type TicketDisplayGroup = {
  officialMatchdayKey: string;
  label: string;
  lockAt: Timestamp;
  lockAtSk: string;
  lockAtUtc: string;
  matchIds: string[];
};

type SnapshotPlayerInput = {
  id: string;
  displayName?: string;
  isPlayer?: boolean;
  status?: unknown;
  registrationOrder?: unknown;
};

type SnapshotBetInput = {
  playerId: string;
  matchId: string;
  ticketId?: string;
  score?: Score | null;
};

type LongTermPickInput = {
  playerId: string;
  ticketId?: string;
  picks: Partial<Record<LongTermPredictionSlot["key"], string>>;
  registrationOrder?: unknown;
};

export type TicketSnapshotPayload = {
  ticketId: string;
  lockedAt: string;
  matchIds: string[];
  playerIds: string[];
  bets: Array<{
    playerId: string;
    matchId: string;
    score: Score | null;
    registrationOrder: number;
  }>;
};

export type LongTermSnapshotPayload = {
  ticketId: string;
  lockedAt: string;
  playerIds: string[];
  slots: LongTermPredictionSlot[];
  picks: Array<{
    playerId: string;
    picks: Partial<Record<LongTermPredictionSlot["key"], string>>;
    registrationOrder: number;
  }>;
};

type LockDueTicketsInput = {
  db?: Firestore;
  now?: Date;
};

type TicketDoc = {
  id: string;
  kind?: unknown;
  lockAt: unknown;
  lockAtUtc: unknown;
  officialMatchdayKey?: unknown;
  matchIds?: unknown;
  predictionSlots?: unknown;
  status?: unknown;
};

function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Datum listka musi byt vo formate YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Datum listka nie je platny.");
  }

  return { year, month, day };
}

function getTimeZoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(utcDate);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  const zoneMillis = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return Math.round((zoneMillis - utcDate.getTime()) / 60000);
}

function normalizeLockOptions(options: TicketLockOptions = {}, date?: string): { hourSk: number; minuteSk: number } {
  const override = date ? options.dateOverrides?.[date] : undefined;
  const hourSk = override?.hourSk ?? options.hourSk ?? DAILY_LOCK_HOUR_SK;
  const minuteSk = override?.minuteSk ?? options.minuteSk ?? DAILY_LOCK_MINUTE_SK;

  if (!Number.isInteger(hourSk) || hourSk < 0 || hourSk > 23) {
    throw new Error("Hodina uzavierky musi byt medzi 0 a 23.");
  }

  if (!Number.isInteger(minuteSk) || minuteSk < 0 || minuteSk > 59) {
    throw new Error("Minuta uzavierky musi byt medzi 0 a 59.");
  }

  return { hourSk, minuteSk };
}

function buildSlovakiaLock(
  date: string,
  options: TicketLockOptions = {}
): { utcDate: Date; offsetMinutes: number; hourSk: number; minuteSk: number } {
  const { year, month, day } = parseIsoDate(date);
  const { hourSk, minuteSk } = normalizeLockOptions(options, date);
  const localMillis = Date.UTC(
    year,
    month - 1,
    day,
    hourSk,
    minuteSk,
    0
  );
  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(localMillis), SK_TIME_ZONE);
  let utcDate = new Date(localMillis - offsetMinutes * 60_000);
  const correctedOffsetMinutes = getTimeZoneOffsetMinutes(utcDate, SK_TIME_ZONE);

  if (correctedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = correctedOffsetMinutes;
    utcDate = new Date(localMillis - offsetMinutes * 60_000);
  }

  return { utcDate, offsetMinutes, hourSk, minuteSk };
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
}

function formatOfficialDateLabel(officialMatchdayKey: string): string {
  const { year, month, day } = parseIsoDate(officialMatchdayKey);

  return `${day}. ${month}. ${year}`;
}

function assertSafeIdPart(value: string): void {
  if (
    value.length === 0 ||
    value.length > MAX_ID_PART_LENGTH ||
    value.includes("/") ||
    value.trim() !== value
  ) {
    throw new Error("Neplatne ID.");
  }
}

function registrationOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 9999;
}

function isActivePlayablePlayer(player: SnapshotPlayerInput): boolean {
  return player.isPlayer === true && player.status === "active";
}

function scoreIsValid(score: unknown): score is Score {
  if (!score || typeof score !== "object") {
    return false;
  }

  const candidate = score as Record<string, unknown>;
  return (
    typeof candidate.home === "number" &&
    Number.isInteger(candidate.home) &&
    candidate.home >= 0 &&
    typeof candidate.away === "number" &&
    Number.isInteger(candidate.away) &&
    candidate.away >= 0
  );
}

function timestampToMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (value && typeof value === "object" && "toMillis" in value) {
    const maybeTimestamp = value as { toMillis?: unknown };
    if (typeof maybeTimestamp.toMillis === "function") {
      return maybeTimestamp.toMillis();
    }
  }

  if (typeof value === "string") {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
  }

  return null;
}

function ticketIsDue(ticket: TicketDoc, now: Date): boolean {
  const explicitLockMillis = timestampToMillis(ticket.lockAt) ?? timestampToMillis(ticket.lockAtUtc);
  const fallbackLockMillis =
    explicitLockMillis === null && typeof ticket.officialMatchdayKey === "string"
      ? Date.parse(buildTicketLockAtUtc(ticket.officialMatchdayKey))
      : explicitLockMillis;

  return fallbackLockMillis !== null && fallbackLockMillis <= now.getTime();
}

function normalizeTicketDoc(id: string, data: Record<string, unknown>): TicketDoc {
  return {
    id,
    kind: data.kind,
    lockAt: data.lockAt,
    lockAtUtc: data.lockAtUtc,
    officialMatchdayKey: data.officialMatchdayKey,
    matchIds: data.matchIds,
    predictionSlots: data.predictionSlots,
    status: data.status
  };
}

function normalizeSnapshotPlayer(id: string, data: Record<string, unknown>): SnapshotPlayerInput {
  return {
    id,
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    isPlayer: data.isPlayer === true,
    status: data.status,
    registrationOrder: data.registrationOrder
  };
}

function normalizeSnapshotBet(data: Record<string, unknown>): SnapshotBetInput | null {
  if (
    typeof data.playerId !== "string" ||
    typeof data.matchId !== "string" ||
    typeof data.ticketId !== "string"
  ) {
    return null;
  }

  return {
    playerId: data.playerId,
    matchId: data.matchId,
    ticketId: data.ticketId,
    score: scoreIsValid(data.score) ? data.score : null
  };
}

function normalizeLongTermSlot(value: unknown): LongTermPredictionSlot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const key = data.key;
  const label = data.label;
  if (
    (key !== "champion" && key !== "second" && key !== "third" && key !== "fourth") ||
    typeof label !== "string" ||
    !label.trim()
  ) {
    return null;
  }

  return { key, label };
}

function longTermSlotsFromTicket(ticket: TicketDoc): LongTermPredictionSlot[] {
  const slots = Array.isArray(ticket.predictionSlots)
    ? ticket.predictionSlots
        .map((slot) => normalizeLongTermSlot(slot))
        .filter((slot): slot is LongTermPredictionSlot => slot !== null)
    : [];

  return slots.length > 0 ? slots : LONG_TERM_PREDICTION_SLOTS.map((slot) => ({ ...slot }));
}

function normalizeLongTermPick(data: Record<string, unknown>): LongTermPickInput | null {
  if (typeof data.playerId !== "string" || typeof data.ticketId !== "string") {
    return null;
  }

  const rawPicks = data.picks && typeof data.picks === "object" ? (data.picks as Record<string, unknown>) : {};
  const picks: Partial<Record<LongTermPredictionSlot["key"], string>> = {};

  for (const slot of LONG_TERM_PREDICTION_SLOTS) {
    const value = rawPicks[slot.key];
    if (typeof value === "string" && value.trim()) {
      picks[slot.key] = value.trim().toUpperCase();
    }
  }

  return {
    playerId: data.playerId,
    ticketId: data.ticketId,
    picks,
    registrationOrder: data.registrationOrder
  };
}

async function assertAdmin(uid: string): Promise<void> {
  const snap = await adminDb.collection("players").doc(uid).get();

  if (snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Iba admin moze spustit uzavierku listkov.");
  }
}

async function listDueTickets(db: Firestore, now: Date): Promise<TicketDoc[]> {
  const snap = await db.collection("tickets").where("status", "==", "open").get();

  return snap.docs
    .map((doc) => normalizeTicketDoc(doc.id, doc.data()))
    .filter((ticket) => ticket.status === "open" && ticketIsDue(ticket, now));
}

async function listActivePlayers(db: Firestore): Promise<SnapshotPlayerInput[]> {
  const snap = await db.collection("players").get();

  return snap.docs.map((doc) => normalizeSnapshotPlayer(doc.id, doc.data()));
}

async function listTicketBets(db: Firestore, ticketId: string): Promise<SnapshotBetInput[]> {
  const snap = await db.collection("bets").where("ticketId", "==", ticketId).get();

  return snap.docs
    .map((doc) => normalizeSnapshotBet(doc.data()))
    .filter((bet): bet is SnapshotBetInput => bet !== null);
}

async function listLongTermPicks(db: Firestore, ticketId: string): Promise<LongTermPickInput[]> {
  const snap = await db.collection("longTermPicks").where("ticketId", "==", ticketId).get();

  return snap.docs
    .map((doc) => normalizeLongTermPick(doc.data()))
    .filter((pick): pick is LongTermPickInput => pick !== null);
}

function matchIdsFromTicket(ticket: TicketDoc): string[] {
  if (!Array.isArray(ticket.matchIds)) {
    return [];
  }

  return ticket.matchIds.filter((matchId): matchId is string => typeof matchId === "string");
}

export function buildTicketLockAtSk(
  officialMatchdayKey: string,
  options: TicketLockOptions = {}
): string {
  const { offsetMinutes, hourSk, minuteSk } = buildSlovakiaLock(officialMatchdayKey, options);
  const hour = String(hourSk).padStart(2, "0");
  const minute = String(minuteSk).padStart(2, "0");

  return `${officialMatchdayKey}T${hour}:${minute}:00${formatOffset(offsetMinutes)}`;
}

export function buildTicketLockAt(
  officialMatchdayKey: string,
  options: TicketLockOptions = {}
): Timestamp {
  return Timestamp.fromDate(buildSlovakiaLock(officialMatchdayKey, options).utcDate);
}

export function buildTicketLockAtUtc(
  officialMatchdayKey: string,
  options: TicketLockOptions = {}
): string {
  return buildSlovakiaLock(officialMatchdayKey, options).utcDate.toISOString();
}

export function groupMatchesForTicketDisplay(
  matches: TicketDisplayMatch[],
  options: TicketLockOptions = {}
): TicketDisplayGroup[] {
  const grouped = new Map<string, TicketDisplayMatch[]>();

  for (const match of matches) {
    const current = grouped.get(match.officialMatchdayKey) ?? [];
    current.push(match);
    grouped.set(match.officialMatchdayKey, current);
  }

  return [...grouped.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([officialMatchdayKey, groupMatches]) => {
      const lockAt = buildTicketLockAt(officialMatchdayKey, options);

      return {
        officialMatchdayKey,
        label: formatOfficialDateLabel(officialMatchdayKey),
        lockAt,
        lockAtSk: buildTicketLockAtSk(officialMatchdayKey, options),
        lockAtUtc: lockAt.toDate().toISOString(),
        matchIds: groupMatches
          .sort((left, right) => {
            const leftKickoff = left.kickoffAtSk ?? left.kickoffAtUtc ?? "";
            const rightKickoff = right.kickoffAtSk ?? right.kickoffAtUtc ?? "";
            return leftKickoff.localeCompare(rightKickoff) || left.id.localeCompare(right.id);
          })
          .map((match) => match.id)
      };
    });
}

export function buildBetDocumentId(playerId: string, matchId: string): string {
  assertSafeIdPart(playerId);
  assertSafeIdPart(matchId);

  return `${playerId}_${matchId}`;
}

export function buildTicketSnapshotPayload({
  ticketId,
  matchIds,
  lockedAt,
  players,
  bets
}: {
  ticketId: string;
  matchIds: string[];
  lockedAt: string;
  players: SnapshotPlayerInput[];
  bets: SnapshotBetInput[];
}): TicketSnapshotPayload {
  const activePlayers = players
    .filter(isActivePlayablePlayer)
    .sort((left, right) => {
      const order = registrationOrder(left.registrationOrder) - registrationOrder(right.registrationOrder);
      return order === 0 ? left.id.localeCompare(right.id) : order;
    });
  const betByPlayerAndMatch = new Map<string, Score>();

  for (const bet of bets) {
    if (bet.ticketId && bet.ticketId !== ticketId) {
      continue;
    }

    if (scoreIsValid(bet.score)) {
      betByPlayerAndMatch.set(`${bet.playerId}\n${bet.matchId}`, bet.score);
    }
  }

  return {
    ticketId,
    lockedAt,
    matchIds: [...matchIds],
    playerIds: activePlayers.map((player) => player.id),
    bets: activePlayers.flatMap((player) =>
      matchIds.map((matchId) => ({
        playerId: player.id,
        matchId,
        score: betByPlayerAndMatch.get(`${player.id}\n${matchId}`) ?? null,
        registrationOrder: registrationOrder(player.registrationOrder)
      }))
    )
  };
}

export function buildLongTermSnapshotPayload({
  ticketId,
  lockedAt,
  players,
  picks,
  slots
}: {
  ticketId: string;
  lockedAt: string;
  players: SnapshotPlayerInput[];
  picks: LongTermPickInput[];
  slots: LongTermPredictionSlot[];
}): LongTermSnapshotPayload {
  const activePlayers = players
    .filter(isActivePlayablePlayer)
    .sort((left, right) => {
      const order = registrationOrder(left.registrationOrder) - registrationOrder(right.registrationOrder);
      return order === 0 ? left.id.localeCompare(right.id) : order;
    });
  const picksByPlayer = new Map<string, Partial<Record<LongTermPredictionSlot["key"], string>>>();

  for (const pick of picks) {
    if (pick.ticketId && pick.ticketId !== ticketId) {
      continue;
    }

    picksByPlayer.set(pick.playerId, pick.picks);
  }

  return {
    ticketId,
    lockedAt,
    playerIds: activePlayers.map((player) => player.id),
    slots: slots.map((slot) => ({ ...slot })),
    picks: activePlayers.map((player) => ({
      playerId: player.id,
      picks: picksByPlayer.get(player.id) ?? {},
      registrationOrder: registrationOrder(player.registrationOrder)
    }))
  };
}

function buildTicketOverviewEmailJob(ticketId: string, lockedAt: string): Record<string, unknown> {
  return {
    type: "ticketOverview",
    status: "queued",
    ticketId,
    snapshotId: ticketId,
    createdAt: lockedAt,
    updatedAt: lockedAt
  };
}

function buildMissingTipsReminderEmailJob(ticketId: string, createdAt: string): Record<string, unknown> {
  return {
    type: "missingTipsReminder",
    status: "queued",
    ticketId,
    createdAt,
    updatedAt: createdAt
  };
}

function buildLongTermOverviewEmailJob(ticketId: string, lockedAt: string): Record<string, unknown> {
  return {
    type: "longTermOverview",
    status: "queued",
    ticketId,
    snapshotId: ticketId,
    createdAt: lockedAt,
    updatedAt: lockedAt
  };
}

function reminderIsDue(ticket: TicketDoc, now: Date): boolean {
  const lockMillis = timestampToMillis(ticket.lockAt) ?? timestampToMillis(ticket.lockAtUtc);
  if (lockMillis === null) {
    return false;
  }

  const nowMillis = now.getTime();
  return nowMillis >= lockMillis - MISSING_TIPS_REMINDER_MS && nowMillis < lockMillis;
}

async function listReminderDueTickets(db: Firestore, now: Date): Promise<TicketDoc[]> {
  const snap = await db.collection("tickets").where("status", "==", "open").get();

  return snap.docs
    .map((doc) => normalizeTicketDoc(doc.id, doc.data()))
    .filter(
      (ticket) =>
        ticket.status === "open" &&
        reminderIsDue(ticket, now) &&
        (ticket.kind === "longTerm" || matchIdsFromTicket(ticket).length > 0)
    );
}

export async function enqueueMissingTipsRemindersForNow({
  db = adminDb,
  now = new Date()
}: LockDueTicketsInput = {}): Promise<{ queuedTicketIds: string[] }> {
  const dueTickets = await listReminderDueTickets(db, now);
  const createdAt = now.toISOString();
  const queuedTicketIds: string[] = [];

  for (const ticket of dueTickets) {
    const emailJobRef = db.collection("emailJobs").doc(`missingTips_${ticket.id}`);
    const emailJobSnap = await emailJobRef.get();
    if (emailJobSnap.exists) {
      continue;
    }

    await emailJobRef.set(buildMissingTipsReminderEmailJob(ticket.id, createdAt), { merge: true });
    queuedTicketIds.push(ticket.id);
  }

  return { queuedTicketIds };
}

export async function lockDueTicketsForNow({
  db = adminDb,
  now = new Date()
}: LockDueTicketsInput = {}): Promise<{ lockedTicketIds: string[] }> {
  const dueTickets = await listDueTickets(db, now);
  const lockedAt = now.toISOString();
  const players = await listActivePlayers(db);
  const lockedTicketIds: string[] = [];

  for (const ticket of dueTickets) {
    if (ticket.kind === "longTerm") {
      const picks = await listLongTermPicks(db, ticket.id);
      const snapshot = buildLongTermSnapshotPayload({
        ticketId: ticket.id,
        lockedAt,
        players,
        picks,
        slots: longTermSlotsFromTicket(ticket)
      });
      const ticketRef = db.collection("tickets").doc(ticket.id);
      const snapshotRef = db.collection("longTermSnapshots").doc(ticket.id);
      const emailJobRef = db.collection("emailJobs").doc(`longTermOverview_${ticket.id}`);
      const locked = await db.runTransaction(async (transaction) => {
        const currentTicketSnap = await transaction.get(ticketRef);
        const currentEmailJobSnap = await transaction.get(emailJobRef);

        if (!currentTicketSnap.exists) {
          return false;
        }

        const currentTicket = normalizeTicketDoc(ticket.id, currentTicketSnap.data() ?? {});
        if (currentTicket.status !== "open" || !ticketIsDue(currentTicket, now)) {
          return false;
        }

        transaction.set(snapshotRef, snapshot);
        transaction.update(ticketRef, {
          status: "locked",
          lockedAt,
          lockedAtUtc: lockedAt,
          updatedAt: lockedAt
        });

        if (!currentEmailJobSnap.exists) {
          transaction.set(emailJobRef, buildLongTermOverviewEmailJob(ticket.id, lockedAt));
        }

        return true;
      });

      if (locked) {
        lockedTicketIds.push(ticket.id);
      }

      continue;
    }

    const matchIds = matchIdsFromTicket(ticket);
    const bets = await listTicketBets(db, ticket.id);
    const snapshot = buildTicketSnapshotPayload({
      ticketId: ticket.id,
      matchIds,
      lockedAt,
      players,
      bets
    });
    const ticketRef = db.collection("tickets").doc(ticket.id);
    const snapshotRef = db.collection("ticketSnapshots").doc(ticket.id);
    const emailJobRef = db.collection("emailJobs").doc(`ticketOverview_${ticket.id}`);
    const locked = await db.runTransaction(async (transaction) => {
      const currentTicketSnap = await transaction.get(ticketRef);
      const currentEmailJobSnap = await transaction.get(emailJobRef);

      if (!currentTicketSnap.exists) {
        return false;
      }

      const currentTicket = normalizeTicketDoc(ticket.id, currentTicketSnap.data() ?? {});
      if (currentTicket.status !== "open" || !ticketIsDue(currentTicket, now)) {
        return false;
      }

      transaction.set(snapshotRef, snapshot);
      transaction.update(ticketRef, {
        status: "locked",
        lockedAt,
        lockedAtUtc: lockedAt,
        updatedAt: lockedAt
      });

      if (!currentEmailJobSnap.exists) {
        transaction.set(emailJobRef, buildTicketOverviewEmailJob(ticket.id, lockedAt));
      }

      return true;
    });

    if (locked) {
      lockedTicketIds.push(ticket.id);
      await enqueueTicketLockedAi({
        db: db as never,
        ticketId: ticket.id,
        provider: openRouterRecapProviderFromEnv("ticker"),
        now: () => now
      });
    }
  }

  return { lockedTicketIds };
}

export const lockDueTicketsScheduled = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: SK_TIME_ZONE,
    secrets: aiProviderSecrets
  },
  async () => {
    await lockDueTicketsForNow();
  }
);

export const enqueueMissingTipsRemindersScheduled = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: SK_TIME_ZONE
  },
  async () => {
    await enqueueMissingTipsRemindersForNow();
  }
);

export const enqueueMissingTipsReminders = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlasenie je povinne.");
  }

  await assertAdmin(request.auth.uid);

  return enqueueMissingTipsRemindersForNow();
});

export const lockDueTickets = onCall({ secrets: aiProviderSecrets }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlasenie je povinne.");
  }

  await assertAdmin(request.auth.uid);

  return lockDueTicketsForNow();
});
