import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { assertAdminAuth } from "../adminBootstrap.js";
import { teamDisplayLabel } from "../teams.js";
import { adminDb } from "../firebaseAdmin.js";
import { aiItemId, loadPublishedAiText } from "../ai/aiItems.js";
import { buildInviteEmail } from "../invites.js";
import { LONG_TERM_PREDICTION_SLOTS, type LongTermPredictionSlot } from "../longTerm.js";
import { buildDailyResultTable, type DailyResultTable } from "../results/dailyResultTable.js";
import { aiProviderSecrets, emailProviderSecrets } from "../secrets.js";
import { buildMissingTipsEmail } from "./templates/missingTipsEmail.js";
import {
  buildLongTermOverviewEmail,
  type LongTermOverviewPick
} from "./templates/longTermOverviewEmail.js";
import {
  buildOverviewEmail,
  type EmailBadgeChip,
  type OverviewEmailBet,
  type OverviewEmailMatch,
  type OverviewEmailPlayer
} from "./templates/overviewEmail.js";
import { buildResultEmail } from "./templates/resultEmail.js";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "./provider.js";

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
  set?(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
};

type TransactionLike = {
  get(ref: DocRefLike): Promise<SnapshotLike>;
  update(ref: DocRefLike, data: Record<string, unknown>): unknown;
};

type QuerySnapshotLike = {
  docs: Array<{
    id: string;
    data(): Record<string, unknown>;
  }>;
};

type QueryOperator = "==" | "<=";

type LimitedQueryLike = {
  get(): Promise<QuerySnapshotLike>;
};

type OrderedQueryLike = {
  limit(count: number): LimitedQueryLike;
};

type QueryLike = {
  where(field: string, operator: QueryOperator, value: unknown): QueryLike;
  limit(count: number): LimitedQueryLike;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  get(): Promise<QuerySnapshotLike>;
  orderBy(field: string, direction: "asc" | "desc"): OrderedQueryLike;
  where(field: string, operator: QueryOperator, value: unknown): QueryLike;
};

type EmailJobDb = {
  collection(name: string): CollectionLike;
  runTransaction<T>(updateFunction: (transaction: TransactionLike) => Promise<T>): Promise<T>;
};

type QueuedEmailJobCandidate = {
  id: string;
  data: Record<string, unknown>;
};

type ClaimedEmailJob = {
  id: string;
  data: Record<string, unknown>;
};

type EmailJob = ClaimedEmailJob & {
  type: "invite" | "ticketOverview" | "ticketResult" | "missingTipsReminder" | "longTermOverview";
};

type RecipientSendResult = {
  to: string;
  status: SendEmailResult["status"];
  emailId?: string;
  error?: string;
};

type ResultEmailRow = {
  playerId: string;
  playerName: string;
  resultLabel: string;
  totalLabel: string;
  exactHits: number;
  note?: string;
};

type ResultEmailMatchRow = {
  matchLabel: string;
  finalScore: string;
  winnerLabel: string;
};

type ProcessEmailJobsInput = {
  db?: EmailJobDb;
  sendEmailImpl?: (input: SendEmailInput) => Promise<SendEmailResult>;
  appUrl?: string;
  limit?: number;
  now?: () => Date;
};

export type ProcessEmailJobsResult = {
  processed: number;
  sent: number;
  failed: number;
};

type EmailJobDiagnosticRow = {
  id: string;
  type: string;
  status: string;
  email: string | null;
  sentCount: number | null;
  failedCount: number | null;
  error: string | null;
  updatedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
};

type EmailAttemptDiagnosticRow = {
  id: string;
  provider: string | null;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
};

export type EmailJobDiagnosticsResult = {
  counts: Record<string, number>;
  recent: EmailJobDiagnosticRow[];
  recentEmailAttempts: EmailAttemptDiagnosticRow[];
};

const DEFAULT_APP_URL = "https://app.tipparta.fun";
const DEFAULT_JOB_LIMIT = 20;
const EMAIL_JOB_LEASE_MS = 15 * 60 * 1000;

function stringField(data: Record<string, unknown>, field: string): string {
  const value = data[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Email job is missing ${field}.`);
  }

  return value.trim();
}

function optionalStringField(data: Record<string, unknown>, field: string): string | undefined {
  const value = data[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function validScore(value: unknown): { home: number; away: number } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const score = value as Record<string, unknown>;
  return Number.isInteger(score.home) &&
    Number(score.home) >= 0 &&
    Number.isInteger(score.away) &&
    Number(score.away) >= 0
    ? { home: Number(score.home), away: Number(score.away) }
    : null;
}

function numericField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function registrationOrder(player: { registrationOrder?: number }): number {
  return typeof player.registrationOrder === "number" && Number.isFinite(player.registrationOrder)
    ? player.registrationOrder
    : 9999;
}

function moneyLabel(units: number): string {
  const sign = units > 0 ? "+" : units < 0 ? "-" : "";
  const absolute = Math.abs(units) * 0.05;
  return `${sign}${absolute.toFixed(2).replace(".", ",")} €`;
}

function teamLabel(
  tournamentKey: string | null,
  code: unknown,
  fallback: unknown,
  options: { flag?: boolean } = {}
): string {
  return teamDisplayLabel(tournamentKey, code, fallback, options);

  return "Tím";
}

async function getRequiredDoc(db: EmailJobDb, collection: string, id: string): Promise<Record<string, unknown>> {
  const snap = await db.collection(collection).doc(id).get();

  if (!snap.exists) {
    throw new Error(`Missing ${collection}/${id}.`);
  }

  return snap.data() ?? {};
}

async function getOptionalDoc(db: EmailJobDb, collection: string, id: string): Promise<Record<string, unknown> | null> {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() ?? {} : null;
}

async function saveDailyResultTable(
  db: EmailJobDb,
  ticketId: string,
  table: DailyResultTable,
  settledAtSk: string
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const payload = {
    ...table,
    label: table.ticketLabel,
    settledAtSk,
    updatedAt
  };

  for (const collectionName of ["dailyResultTables", "resultTables"]) {
    const ref = db.collection(collectionName).doc(ticketId);
    if (typeof ref.set !== "function") {
      throw new Error(`Daily result table write is not supported for ${collectionName}/${ticketId}.`);
    }

    await ref.set(payload, { merge: true });
  }
}

function isKnownEmailJobType(type: unknown): type is EmailJob["type"] {
  return (
    type === "invite" ||
    type === "ticketOverview" ||
    type === "ticketResult" ||
    type === "missingTipsReminder" ||
    type === "longTermOverview"
  );
}

function toCandidate(doc: { id: string; data(): Record<string, unknown> }): QueuedEmailJobCandidate {
  return {
    id: doc.id,
    data: doc.data()
  };
}

async function listClaimableJobs(
  db: EmailJobDb,
  limit: number,
  nowIso: string
): Promise<QueuedEmailJobCandidate[]> {
  const queuedSnap = await db.collection("emailJobs").where("status", "==", "queued").limit(limit).get();
  const candidates = queuedSnap.docs.map(toCandidate);

  if (candidates.length >= limit) {
    return candidates;
  }

  const remaining = limit - candidates.length;
  const staleScanLimit = Math.max(remaining, Math.min(limit * 5, 100));
  const seenIds = new Set(candidates.map((job) => job.id));
  const staleSnap = await db
    .collection("emailJobs")
    .where("status", "==", "processing")
    .limit(staleScanLimit)
    .get();

  for (const doc of staleSnap.docs) {
    const candidate = toCandidate(doc);
    const leaseUntil = candidate.data.processingLeaseUntil;
    if (typeof leaseUntil !== "string" || leaseUntil > nowIso) {
      continue;
    }

    if (!seenIds.has(candidate.id)) {
      candidates.push(candidate);
      seenIds.add(candidate.id);
    }

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates;
}

async function sendOne(
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>,
  input: SendEmailInput
): Promise<RecipientSendResult> {
  try {
    const result = await sendEmailImpl(input);
    return {
      to: input.to,
      status: result.status,
      emailId: result.id
    };
  } catch (error) {
    return {
      to: input.to,
      status: "failed",
      error: error instanceof Error ? error.message : "Neznáma chyba odosielania e-mailu."
    };
  }
}

async function sendInviteJob(
  job: EmailJob,
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>
): Promise<RecipientSendResult[]> {
  const email = buildInviteEmail({
    displayName: stringField(job.data, "displayName"),
    inviteUrl: stringField(job.data, "inviteUrl"),
    extraMessage: optionalStringField(job.data, "extraMessage")
  });

  return [
    await sendOne(sendEmailImpl, {
      to: stringField(job.data, "email"),
      subject: email.subject,
      html: email.html,
      text: email.text
    })
  ];
}

function normalizeSnapshotBets(value: unknown): OverviewEmailBet[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((bet) => {
      if (!bet || typeof bet !== "object") {
        return null;
      }

      const data = bet as Record<string, unknown>;
      if (typeof data.playerId !== "string" || typeof data.matchId !== "string") {
        return null;
      }

      return {
        playerId: data.playerId,
        matchId: data.matchId,
        score: validScore(data.score)
      };
    })
    .filter((bet): bet is OverviewEmailBet => bet !== null);
}

function idsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
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

  return { key, label: label.trim() };
}

function normalizeLongTermSlots(value: unknown): LongTermPredictionSlot[] {
  const slots = Array.isArray(value)
    ? value
        .map((slot) => normalizeLongTermSlot(slot))
        .filter((slot): slot is LongTermPredictionSlot => slot !== null)
    : [];

  return slots.length > 0 ? slots : LONG_TERM_PREDICTION_SLOTS.map((slot) => ({ ...slot }));
}

function normalizeLongTermOverviewPicks(
  value: unknown,
  tournamentKey: string | null
): LongTermOverviewPick[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const data = row as Record<string, unknown>;
      if (typeof data.playerId !== "string" || !data.playerId.trim()) {
        return null;
      }

      const rawPicks = data.picks && typeof data.picks === "object" ? (data.picks as Record<string, unknown>) : {};
      const picks: LongTermOverviewPick["picks"] = {};
      for (const slot of LONG_TERM_PREDICTION_SLOTS) {
        const teamCode = rawPicks[slot.key];
        if (typeof teamCode === "string" && teamCode.trim()) {
          picks[slot.key] = teamLabel(tournamentKey, teamCode, teamCode, { flag: true });
        }
      }

      return {
        playerId: data.playerId,
        picks
      };
    })
    .filter((pick): pick is LongTermOverviewPick => pick !== null);
}

async function overviewMatches(
  db: EmailJobDb,
  matchIds: string[],
  tournamentKey: string | null
): Promise<OverviewEmailMatch[]> {
  const matches: OverviewEmailMatch[] = [];

  for (const matchId of matchIds) {
    const match = await getRequiredDoc(db, "matches", matchId);
    matches.push({
      id: matchId,
      homeTeam: teamLabel(tournamentKey, match.homeTeamCode, match.homeTeamName, { flag: true }),
      awayTeam: teamLabel(tournamentKey, match.awayTeamCode, match.awayTeamName, { flag: true }),
      kickoffAtSk: optionalStringField(match, "kickoffAtSk")
    });
  }

  return matches;
}

async function overviewPlayers(db: EmailJobDb, playerIds: string[]): Promise<Array<OverviewEmailPlayer & { email: string }>> {
  const players: Array<OverviewEmailPlayer & { email: string }> = [];

  for (const playerId of playerIds) {
    const player = await getRequiredDoc(db, "players", playerId);
    players.push({
      id: playerId,
      displayName: optionalStringField(player, "displayName") ?? playerId,
      email: stringField(player, "email"),
      registrationOrder: typeof player.registrationOrder === "number" ? player.registrationOrder : undefined
    });
  }

  return players;
}

function badgeBelongsToTournament(data: Record<string, unknown>, tournamentKey: string | null): boolean {
  if (!tournamentKey) {
    return true;
  }

  const badgeTournament = data.tournamentKey ?? data.tournamentId;
  return badgeTournament === tournamentKey || badgeTournament === undefined || badgeTournament === null;
}

function badgeLeaderPlayerId(data: Record<string, unknown>): string | null {
  if (data.leader && typeof data.leader === "object") {
    const leader = data.leader as Record<string, unknown>;
    return optionalStringField(leader, "playerId") ?? optionalStringField(leader, "player_id") ?? null;
  }

  return optionalStringField(data, "leaderPlayerId") ?? optionalStringField(data, "leader_player_id") ?? null;
}

async function badgeChipsByPlayer(
  db: EmailJobDb,
  tournamentKey: string | null,
  playerIds: string[]
): Promise<Map<string, EmailBadgeChip[]>> {
  const playerIdSet = new Set(playerIds);
  const chipsByPlayer = new Map<string, EmailBadgeChip[]>();
  const snap = await db.collection("badges").get();

  for (const badgeDoc of snap.docs) {
    const data = badgeDoc.data();
    if (!badgeBelongsToTournament(data, tournamentKey)) {
      continue;
    }

    const playerId = badgeLeaderPlayerId(data);
    if (!playerId || !playerIdSet.has(playerId)) {
      continue;
    }

    const current = chipsByPlayer.get(playerId) ?? [];
    current.push({
      badgeKey: optionalStringField(data, "badgeKey") ?? badgeDoc.id,
      title: optionalStringField(data, "title") ?? optionalStringField(data, "name") ?? badgeDoc.id,
      emoji: optionalStringField(data, "emoji") ?? "🏷️"
    });
    chipsByPlayer.set(playerId, current);
  }

  return chipsByPlayer;
}

function attachBadgeChips<T extends OverviewEmailPlayer>(players: T[], chipsByPlayer: Map<string, EmailBadgeChip[]>): T[] {
  return players.map((player) => ({
    ...player,
    badges: chipsByPlayer.get(player.id) ?? []
  }));
}

async function sendTicketOverviewJob(
  db: EmailJobDb,
  job: EmailJob,
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>,
  appUrl: string
): Promise<RecipientSendResult[]> {
  const ticketId = stringField(job.data, "ticketId");
  const snapshotId = optionalStringField(job.data, "snapshotId") ?? ticketId;
  const snapshot = await getRequiredDoc(db, "ticketSnapshots", snapshotId);
  const ticket = await getRequiredDoc(db, "tickets", ticketId);
  const matchIds = idsFrom(snapshot.matchIds);
  const playerIds = idsFrom(snapshot.playerIds);
  const tournamentKey = tournamentKeyFrom(ticket);
  const matches = await overviewMatches(db, matchIds, tournamentKey);
  const players = attachBadgeChips(
    await overviewPlayers(db, playerIds),
    await badgeChipsByPlayer(db, tournamentKey, playerIds)
  );
  const bets = normalizeSnapshotBets(snapshot.bets);
  const ticketLabel = optionalStringField(ticket, "label") ?? ticketId;
  const lockedAtSk = optionalStringField(ticket, "lockAtSk") ?? optionalStringField(snapshot, "lockedAt") ?? "";
  const recapText = await loadPublishedAiText(db as never, aiItemId("ticket_lock", ticketId));
  const results: RecipientSendResult[] = [];

  for (const player of players) {
    const email = buildOverviewEmail({
      appUrl,
      currentPlayerId: player.id,
      ticketLabel,
      lockedAtSk,
      matches,
      players,
      bets,
      recapText
    });

    results.push(
      await sendOne(sendEmailImpl, {
        to: player.email,
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    );
  }

  if (results.length === 0) {
    throw new Error("Ticket overview email job has no recipients.");
  }

  return results;
}

async function sendLongTermOverviewJob(
  db: EmailJobDb,
  job: EmailJob,
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>,
  appUrl: string
): Promise<RecipientSendResult[]> {
  const ticketId = stringField(job.data, "ticketId");
  const snapshotId = optionalStringField(job.data, "snapshotId") ?? ticketId;
  const snapshot = await getRequiredDoc(db, "longTermSnapshots", snapshotId);
  const ticket = await getRequiredDoc(db, "tickets", ticketId);
  const playerIds = idsFrom(snapshot.playerIds);
  const tournamentKey = tournamentKeyFrom(ticket) ?? tournamentKeyFrom(snapshot);
  const slots = normalizeLongTermSlots(snapshot.slots);
  const players = attachBadgeChips(
    await overviewPlayers(db, playerIds),
    await badgeChipsByPlayer(db, tournamentKey, playerIds)
  );
  const picks = normalizeLongTermOverviewPicks(snapshot.picks, tournamentKey);
  const ticketLabel = optionalStringField(ticket, "label") ?? "Dlhodobé tipy";
  const lockedAtSk =
    optionalStringField(ticket, "lockAtSk") ??
    optionalStringField(snapshot, "lockedAt") ??
    "";
  const results: RecipientSendResult[] = [];

  for (const player of players) {
    const email = buildLongTermOverviewEmail({
      appUrl,
      currentPlayerId: player.id,
      ticketLabel,
      lockedAtSk,
      slots,
      players,
      picks
    });

    results.push(
      await sendOne(sendEmailImpl, {
        to: player.email,
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    );
  }

  if (results.length === 0) {
    throw new Error("Long-term overview email job has no recipients.");
  }

  return results;
}

async function activeReminderPlayers(db: EmailJobDb): Promise<Array<OverviewEmailPlayer & { email: string }>> {
  const snap = await db.collection("players").get();
  return snap.docs
    .map((doc): (OverviewEmailPlayer & { email: string }) | null => {
      const data = doc.data();
      if (data.isPlayer !== true || data.status !== "active") {
        return null;
      }

      const email = typeof data.email === "string" && data.email.trim() ? data.email.trim() : null;
      if (!email) {
        return null;
      }

      const player: OverviewEmailPlayer & { email: string } = {
        id: doc.id,
        displayName: optionalStringField(data, "displayName") ?? doc.id,
        email
      };

      if (typeof data.registrationOrder === "number") {
        player.registrationOrder = data.registrationOrder;
      }

      return player;
    })
    .filter((player): player is OverviewEmailPlayer & { email: string } => player !== null)
    .sort((left, right) => registrationOrder(left) - registrationOrder(right));
}

async function ticketBetsForReminder(db: EmailJobDb, ticketId: string): Promise<OverviewEmailBet[]> {
  const snap = await db.collection("bets").where("ticketId", "==", ticketId).limit(500).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      if (typeof data.playerId !== "string" || typeof data.matchId !== "string") {
        return null;
      }

      return {
        playerId: data.playerId,
        matchId: data.matchId,
        score: validScore(data.score)
      };
    })
    .filter((bet): bet is OverviewEmailBet => bet !== null);
}

async function longTermPicksForReminder(db: EmailJobDb, ticketId: string): Promise<LongTermOverviewPick[]> {
  const snap = await db.collection("longTermPicks").where("ticketId", "==", ticketId).limit(500).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      if (typeof data.playerId !== "string" || !data.playerId.trim()) {
        return null;
      }

      const rawPicks = data.picks && typeof data.picks === "object" ? (data.picks as Record<string, unknown>) : {};
      const picks: LongTermOverviewPick["picks"] = {};
      for (const slot of LONG_TERM_PREDICTION_SLOTS) {
        const teamCode = rawPicks[slot.key];
        if (typeof teamCode === "string" && teamCode.trim()) {
          picks[slot.key] = teamCode.trim().toUpperCase();
        }
      }

      return {
        playerId: data.playerId,
        picks
      };
    })
    .filter((pick): pick is LongTermOverviewPick => pick !== null);
}

function playerHasCompleteTicket(playerId: string, matchIds: string[], bets: OverviewEmailBet[]): boolean {
  const saved = new Set(
    bets
      .filter((bet) => bet.playerId === playerId && bet.score)
      .map((bet) => bet.matchId)
  );

  return matchIds.every((matchId) => saved.has(matchId));
}

function playerHasCompleteLongTermTicket(
  playerId: string,
  slots: LongTermPredictionSlot[],
  picks: LongTermOverviewPick[]
): boolean {
  const playerPicks = picks.find((pick) => pick.playerId === playerId)?.picks ?? {};
  const selectedTeams = new Set<string>();

  for (const slot of slots) {
    const teamCode = playerPicks[slot.key];
    if (!teamCode || selectedTeams.has(teamCode)) {
      return false;
    }

    selectedTeams.add(teamCode);
  }

  return true;
}

async function sendMissingTipsReminderJob(
  db: EmailJobDb,
  job: EmailJob,
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>,
  appUrl: string
): Promise<RecipientSendResult[]> {
  const ticketId = stringField(job.data, "ticketId");
  const ticket = await getRequiredDoc(db, "tickets", ticketId);
  const matchIds = idsFrom(ticket.matchIds);
  const players = await activeReminderPlayers(db);
  const ticketLabel = optionalStringField(ticket, "label") ?? ticketId;
  const lockAtSk = optionalStringField(ticket, "lockAtSk") ?? "";
  const isLongTerm = ticket.kind === "longTerm";
  let missingPlayers: Array<OverviewEmailPlayer & { email: string }>;

  if (isLongTerm) {
    const slots = normalizeLongTermSlots(ticket.predictionSlots);
    const picks = await longTermPicksForReminder(db, ticketId);
    missingPlayers = players.filter(
      (player) => !playerHasCompleteLongTermTicket(player.id, slots, picks)
    );
  } else {
    const bets = await ticketBetsForReminder(db, ticketId);
    missingPlayers = players.filter((player) => !playerHasCompleteTicket(player.id, matchIds, bets));
  }

  const results: RecipientSendResult[] = [];

  for (const player of missingPlayers) {
    const email = buildMissingTipsEmail({
      appUrl,
      displayName: player.displayName,
      ticketLabel,
      lockAtSk,
      ticketKind: isLongTerm ? "longTerm" : "matchday"
    });

    results.push(
      await sendOne(sendEmailImpl, {
        to: player.email,
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    );
  }

  return results;
}

function settlementPlayerId(line: Record<string, unknown>): string | null {
  const playerId = line.playerId ?? line.player_id;
  return typeof playerId === "string" && playerId ? playerId : null;
}

function settlementExactHit(line: Record<string, unknown>): boolean {
  return line.exactHit === true || line.exact_hit === true;
}

function settlementLines(data: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(data.settlements)
    ? data.settlements.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    : [];
}

function tournamentKeyFrom(data: Record<string, unknown>): string | null {
  const key = data.tournamentKey ?? data.tournamentId;
  return typeof key === "string" && key ? key : null;
}

function sameTournament(match: Record<string, unknown>, tournamentKey: string | null): boolean {
  if (!tournamentKey) {
    return true;
  }

  return match.tournamentKey === tournamentKey || match.tournamentId === tournamentKey;
}

function addSettlementImpact(
  target: Map<string, { units: number; exactHits: number }>,
  settlement: Record<string, unknown>
): void {
  for (const line of settlementLines(settlement)) {
    const playerId = settlementPlayerId(line);
    if (!playerId) {
      continue;
    }

    const current = target.get(playerId) ?? { units: 0, exactHits: 0 };
    current.units += numericField(line.units);
    current.exactHits += settlementExactHit(line) ? 1 : 0;
    target.set(playerId, current);
  }
}

function exactHitPlayerNames(
  settlement: Record<string, unknown>,
  playersById: Map<string, OverviewEmailPlayer & { email: string }>
): string[] {
  return settlementLines(settlement)
    .filter(settlementExactHit)
    .map((line) => {
      const playerId = settlementPlayerId(line);
      return playerId ? playersById.get(playerId)?.displayName ?? playerId : null;
    })
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

async function ticketResultMatches(
  db: EmailJobDb,
  matchIds: string[],
  playersById: Map<string, OverviewEmailPlayer & { email: string }>,
  tournamentKey: string | null
): Promise<ResultEmailMatchRow[]> {
  const rows: ResultEmailMatchRow[] = [];

  for (const matchId of matchIds) {
    const match = await getRequiredDoc(db, "matches", matchId);
    const settlement = await getOptionalDoc(db, "matchSettlements", matchId);
    const score = validScore(match.finalScore);
    const exactNames = settlement ? exactHitPlayerNames(settlement, playersById) : [];
    const isCancelled = match.status === "cancelled";
    rows.push({
      matchLabel: `${teamLabel(tournamentKey, match.homeTeamCode, match.homeTeamName, { flag: true })} - ${teamLabel(
        tournamentKey,
        match.awayTeamCode,
        match.awayTeamName,
        { flag: true }
      )}`,
      finalScore: isCancelled ? "Neodohrané" : score ? `${score.home}:${score.away}` : "-",
      winnerLabel: isCancelled
        ? "Zápas sa nevyhodnocuje"
        : exactNames.length > 0
          ? `Presne: ${exactNames.join(", ")}`
          : "Bez presného zásahu"
    });
  }

  return rows;
}

async function totalImpactsForTournament(
  db: EmailJobDb,
  tournamentKey: string | null
): Promise<Map<string, { units: number; exactHits: number }>> {
  const totals = new Map<string, { units: number; exactHits: number }>();
  const settlementsSnap = await db.collection("matchSettlements").get();

  for (const settlementDoc of settlementsSnap.docs) {
    const matchSnap = await db.collection("matches").doc(settlementDoc.id).get();
    if (!matchSnap.exists) {
      continue;
    }

    const match = matchSnap.data() ?? {};
    if (!sameTournament(match, tournamentKey)) {
      continue;
    }

    addSettlementImpact(totals, settlementDoc.data());
  }

  return totals;
}

async function sendTicketResultJob(
  db: EmailJobDb,
  job: EmailJob,
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>,
  appUrl: string
): Promise<RecipientSendResult[]> {
  const ticketId = stringField(job.data, "ticketId");
  const ticket = await getRequiredDoc(db, "tickets", ticketId);
  const table = await buildDailyResultTable({ db, ticketId });
  const players = table.rows.map((row) => ({
    id: row.playerId,
    displayName: row.playerName,
    email: "",
    registrationOrder: 9999
  }));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const daily = new Map(table.rows.map((row) => [row.playerId, { units: row.dailyUnits, exactHits: 0 }]));
  const totals = new Map<string, { units: number; exactHits: number }>();
  const rows: ResultEmailRow[] = players
    .map((player) => {
      const dailyImpact = daily.get(player.id) ?? { units: 0, exactHits: 0 };
      const totalImpact = totals.get(player.id) ?? dailyImpact;
      return {
        playerId: player.id,
        playerName: player.displayName,
        resultLabel: moneyLabel(dailyImpact.units),
        totalLabel: moneyLabel(totalImpact.units),
        exactHits: dailyImpact.exactHits,
        note:
          dailyImpact.units > 0
            ? `Denný zisk ${moneyLabel(dailyImpact.units)}.`
            : dailyImpact.units < 0
              ? `Denná strata ${moneyLabel(dailyImpact.units)}.`
              : "Denný účet na nule."
      };
    })
    .sort((left, right) => {
      const leftUnits = daily.get(left.playerId)?.units ?? 0;
      const rightUnits = daily.get(right.playerId)?.units ?? 0;
      if (rightUnits !== leftUnits) {
        return rightUnits - leftUnits;
      }

      const leftOrder = playersById.get(left.playerId)?.registrationOrder ?? 9999;
      const rightOrder = playersById.get(right.playerId)?.registrationOrder ?? 9999;
      return leftOrder - rightOrder || left.playerName.localeCompare(right.playerName);
    });
  const matches: ResultEmailMatchRow[] = [];
  const ticketLabel = optionalStringField(ticket, "label") ?? ticketId;
  const settledAtSk = optionalStringField(ticket, "settledAtSk") ?? optionalStringField(ticket, "settledAt") ?? "";
  const results: RecipientSendResult[] = [];
  let recapText: string | undefined;

  await saveDailyResultTable(db, ticketId, table, settledAtSk);
  recapText = await loadPublishedAiText(db as never, aiItemId("daily_result", ticketId));

  for (const row of table.rows) {
    const player = await getRequiredDoc(db, "players", row.playerId);
    const email = buildResultEmail({
      appUrl,
      currentPlayerId: row.playerId,
      ticketLabel,
      settledAtSk,
      table,
      recapText
    });

    results.push(
      await sendOne(sendEmailImpl, {
        to: stringField(player, "email"),
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    );
  }

  if (results.length === 0) {
    throw new Error("Ticket result email job has no recipients.");
  }

  return results;
}

async function updateJobStatus(
  db: EmailJobDb,
  jobId: string,
  data: Record<string, unknown>
): Promise<void> {
  await db.collection("emailJobs").doc(jobId).update(data);
}

async function claimEmailJob({
  db,
  candidate,
  now
}: {
  db: EmailJobDb;
  candidate: QueuedEmailJobCandidate;
  now: () => Date;
}): Promise<ClaimedEmailJob | null> {
  const jobRef = db.collection("emailJobs").doc(candidate.id);
  const nowDate = now();
  const processingAt = nowDate.toISOString();
  const processingLeaseUntil = new Date(nowDate.getTime() + EMAIL_JOB_LEASE_MS).toISOString();

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(jobRef);

    if (!snap.exists) {
      return null;
    }

    const data = snap.data() ?? {};
    const status = data.status;
    const staleLease =
      status === "processing" &&
      typeof data.processingLeaseUntil === "string" &&
      data.processingLeaseUntil <= processingAt;

    if (status !== "queued" && !staleLease) {
      return null;
    }

    transaction.update(jobRef, {
      status: "processing",
      processingAt,
      processingLeaseUntil,
      updatedAt: processingAt
    });

    return {
      id: candidate.id,
      data
    };
  });
}

async function processJob({
  db,
  candidate,
  sendEmailImpl,
  appUrl,
  now
}: {
  db: EmailJobDb;
  candidate: QueuedEmailJobCandidate;
  sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult>;
  appUrl: string;
  now: () => Date;
}): Promise<ProcessEmailJobsResult> {
  const claimedJob = await claimEmailJob({ db, candidate, now });

  if (!claimedJob) {
    return {
      processed: 0,
      sent: 0,
      failed: 0
    };
  }

  try {
    if (!isKnownEmailJobType(claimedJob.data.type)) {
      throw new Error(`Unknown email job type ${String(claimedJob.data.type)}.`);
    }

    const job: EmailJob = {
      id: claimedJob.id,
      type: claimedJob.data.type,
      data: claimedJob.data
    };
    const recipientResults =
      job.type === "invite"
        ? await sendInviteJob(job, sendEmailImpl)
        : job.type === "ticketOverview"
          ? await sendTicketOverviewJob(db, job, sendEmailImpl, appUrl)
          : job.type === "missingTipsReminder"
            ? await sendMissingTipsReminderJob(db, job, sendEmailImpl, appUrl)
            : job.type === "longTermOverview"
              ? await sendLongTermOverviewJob(db, job, sendEmailImpl, appUrl)
              : await sendTicketResultJob(db, job, sendEmailImpl, appUrl);
    const sentCount = recipientResults.filter((result) => result.status === "sent").length;
    const failedCount = recipientResults.length - sentCount;
    const finishedAt = now().toISOString();

    await updateJobStatus(db, claimedJob.id, {
      status: failedCount > 0 ? "failed" : "sent",
      sentCount,
      failedCount,
      recipientResults,
      sentAt: failedCount > 0 ? null : finishedAt,
      failedAt: failedCount > 0 ? finishedAt : null,
      processingLeaseUntil: null,
      updatedAt: finishedAt
    });

    return {
      processed: 1,
      sent: sentCount,
      failed: failedCount
    };
  } catch (error) {
    const failedAt = now().toISOString();
    await updateJobStatus(db, claimedJob.id, {
      status: "failed",
      sentCount: 0,
      failedCount: 1,
      error: error instanceof Error ? error.message : "Neznáma chyba e-mailovej úlohy.",
      failedAt,
      processingLeaseUntil: null,
      updatedAt: failedAt
    });

    return {
      processed: 1,
      sent: 0,
      failed: 1
    };
  }
}

export async function processQueuedEmailJobs({
  db = adminDb as unknown as EmailJobDb,
  sendEmailImpl = sendEmail,
  appUrl = process.env.APP_BASE_URL ?? DEFAULT_APP_URL,
  limit = DEFAULT_JOB_LIMIT,
  now = () => new Date()
}: ProcessEmailJobsInput = {}): Promise<ProcessEmailJobsResult> {
  const jobs = await listClaimableJobs(db, limit, now().toISOString());
  const totals: ProcessEmailJobsResult = {
    processed: 0,
    sent: 0,
    failed: 0
  };

  for (const job of jobs) {
    const result = await processJob({
      db,
      candidate: job,
      sendEmailImpl,
      appUrl,
      now
    });

    totals.processed += result.processed;
    totals.sent += result.sent;
    totals.failed += result.failed;
  }

  return totals;
}

async function assertAdmin(uid: string): Promise<void> {
  const snap = await adminDb.collection("players").doc(uid).get();

  if (snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Iba admin môže spustiť e-mailové úlohy.");
  }
}

export const processEmailJobs = onCall({ secrets: [...emailProviderSecrets, ...aiProviderSecrets] }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlásenie je povinné.");
  }

  await assertAdminAuth(request.auth, "Iba admin môže spustiť e-mailové úlohy.");

  return processQueuedEmailJobs();
});

function emailJobDiagnosticRow(id: string, data: Record<string, unknown>): EmailJobDiagnosticRow {
  return {
    id,
    type: typeof data.type === "string" ? data.type : "unknown",
    status: typeof data.status === "string" ? data.status : "unknown",
    email: typeof data.email === "string" ? data.email : null,
    sentCount: typeof data.sentCount === "number" ? data.sentCount : null,
    failedCount: typeof data.failedCount === "number" ? data.failedCount : null,
    error: typeof data.error === "string" ? data.error : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    sentAt: typeof data.sentAt === "string" ? data.sentAt : null,
    failedAt: typeof data.failedAt === "string" ? data.failedAt : null
  };
}

function emailAttemptDiagnosticRow(id: string, data: Record<string, unknown>): EmailAttemptDiagnosticRow {
  return {
    id,
    provider: typeof data.provider === "string" ? data.provider : null,
    recipient: typeof data.recipient === "string" ? data.recipient : null,
    subject: typeof data.subject === "string" ? data.subject : null,
    status: typeof data.status === "string" ? data.status : "unknown",
    error: typeof data.error === "string" ? data.error : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    sentAt: typeof data.sentAt === "string" ? data.sentAt : null,
    failedAt: typeof data.failedAt === "string" ? data.failedAt : null
  };
}

export async function getEmailJobDiagnosticsData(
  db = adminDb as unknown as EmailJobDb
): Promise<EmailJobDiagnosticsResult> {
  const allJobsSnap = await db.collection("emailJobs").get();
  const counts: Record<string, number> = {};
  for (const doc of allJobsSnap.docs) {
    const data = doc.data();
    const status = typeof data.status === "string" ? data.status : "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }

  const recentSnap = await db.collection("emailJobs").orderBy("updatedAt", "desc").limit(20).get();
  const recentEmailsSnap = await db.collection("emails").orderBy("updatedAt", "desc").limit(20).get();

  return {
    counts,
    recent: recentSnap.docs.map((doc) => emailJobDiagnosticRow(doc.id, doc.data())),
    recentEmailAttempts: recentEmailsSnap.docs.map((doc) => emailAttemptDiagnosticRow(doc.id, doc.data()))
  };
}

export const getEmailJobDiagnostics = onCall(async (request): Promise<EmailJobDiagnosticsResult> => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlásenie je povinné.");
  }

  await assertAdminAuth(request.auth, "Iba admin môže kontrolovať e-mailové úlohy.");

  return getEmailJobDiagnosticsData();
});

export const processEmailJobsScheduled = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Europe/Bratislava",
    secrets: [...emailProviderSecrets, ...aiProviderSecrets]
  },
  async () => {
    await processQueuedEmailJobs();
  }
);
