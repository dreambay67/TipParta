'use client';

import type {
  Bet,
  LongTermPick,
  LongTermPredictionSlot,
  Match,
  Player,
  Score,
  Ticket,
  TicketSnapshotBet
} from "@tipparta/shared";
import type { BadgeBorderTone, BadgeKind, PlayerBadgeChip } from "@/features/badges/BadgeShowcase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

export type TicketDocument = Ticket & {
  lockedAt?: string | null;
  lockedAtUtc?: string | null;
};

export type MatchDocument = Omit<Match, "finalScore" | "status"> & {
  finalScore?: Score;
  currentScore?: Score;
  providerStatus?: string | null;
  settlementTriggerStatus?: string | null;
  status: Match["status"] | "cancelled";
};

export type BetDocument = Bet;

export type TicketFeedPlayer = Player & {
  avatarLabel?: string;
  blocked?: boolean;
  badges?: PlayerBadgeChip[];
};

export type TicketSnapshotDocument = {
  ticketId: string;
  lockedAt: string;
  matchIds: string[];
  playerIds: string[];
  bets: TicketSnapshotBet[];
};

export type LongTermPickDocument = LongTermPick;

export type LongTermSnapshotDocument = {
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

export type TicketFeedState = {
  tickets: TicketDocument[];
  matchesByTicketId: Record<string, MatchDocument[]>;
  ownBetsByMatchId: Record<string, BetDocument>;
  snapshotsByTicketId: Record<string, TicketSnapshotDocument>;
  ownLongTermPicksByTicketId: Record<string, LongTermPickDocument>;
  longTermSnapshotsByTicketId: Record<string, LongTermSnapshotDocument>;
  players: TicketFeedPlayer[];
  playersById: Record<string, TicketFeedPlayer>;
};

export const EMPTY_TICKET_FEED_STATE: TicketFeedState = {
  tickets: [],
  matchesByTicketId: {},
  ownBetsByMatchId: {},
  snapshotsByTicketId: {},
  ownLongTermPicksByTicketId: {},
  longTermSnapshotsByTicketId: {},
  players: [],
  playersById: {}
};

type FeedBuckets = {
  tickets: TicketDocument[];
  matches: MatchDocument[];
  ownBets: BetDocument[];
  snapshots: TicketSnapshotDocument[];
  ownLongTermPicks: LongTermPickDocument[];
  longTermSnapshots: LongTermSnapshotDocument[];
  players: TicketFeedPlayer[];
  badges: PlayerBadgeChipWithOwner[];
};

type PlayerBadgeChipWithOwner = PlayerBadgeChip & {
  playerId: string;
};

type SaveBetInput = {
  playerId: string;
  ticketId: string;
  matchId: string;
  score: Score;
};

type SaveLongTermPicksInput = {
  playerId: string;
  ticketId: string;
  tournamentId: string;
  tournamentKey?: string;
  picks: Partial<Record<LongTermPredictionSlot["key"], string>>;
};

function dateLikeToIso(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const maybeTimestamp = value as { toDate?: unknown };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
  }

  return "";
}

function normalizeScore(value: unknown): Score | null {
  if (!value || typeof value !== "object") {
    return null;
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
    return null;
  }

  return {
    home: score.home,
    away: score.away
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

function normalizeLongTermSlots(value: unknown): LongTermPredictionSlot[] | undefined {
  const slots = Array.isArray(value)
    ? value
        .map((slot) => normalizeLongTermSlot(slot))
        .filter((slot): slot is LongTermPredictionSlot => slot !== null)
    : [];

  return slots.length > 0 ? slots : undefined;
}

function normalizeLongTermPicks(
  value: unknown
): Partial<Record<LongTermPredictionSlot["key"], string>> {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const picks: Partial<Record<LongTermPredictionSlot["key"], string>> = {};

  for (const key of ["champion", "second", "third", "fourth"] as const) {
    const teamCode = raw[key];
    if (typeof teamCode === "string" && teamCode.trim()) {
      picks[key] = teamCode.trim().toUpperCase();
    }
  }

  return picks;
}

function normalizeTicket(id: string, data: Record<string, unknown>): TicketDocument {
  const officialMatchdayKey =
    typeof data.officialMatchdayKey === "string" ? data.officialMatchdayKey : "";
  const lockAt = dateLikeToIso(data.lockAt);
  const lockAtUtc = lockAt || dateLikeToIso(data.lockAtUtc);

  return {
    id,
    tournamentId: typeof data.tournamentId === "string" ? data.tournamentId : "",
    ...(typeof data.tournamentKey === "string" ? { tournamentKey: data.tournamentKey } : {}),
    ...(data.kind === "longTerm" ? { kind: "longTerm" as const } : {}),
    label: typeof data.label === "string" ? data.label : officialMatchdayKey,
    officialMatchdayKey,
    lockAt,
    lockAtUtc,
    lockAtSk: typeof data.lockAtSk === "string" ? data.lockAtSk : "",
    status:
      data.status === "locked" || data.status === "settled"
        ? data.status
        : "open",
    matchIds: normalizeStringArray(data.matchIds),
    ...(normalizeLongTermSlots(data.predictionSlots) ? { predictionSlots: normalizeLongTermSlots(data.predictionSlots) } : {}),
    lockedAt: data.lockedAt ? dateLikeToIso(data.lockedAt) : null,
    lockedAtUtc: data.lockedAtUtc ? dateLikeToIso(data.lockedAtUtc) : null
  };
}

function normalizeMatch(id: string, data: Record<string, unknown>): MatchDocument {
  const finalScore = normalizeScore(data.finalScore) ?? undefined;
  const currentScore = normalizeScore(data.currentScore) ?? undefined;
  const status =
    data.status === "live" ||
    data.status === "finished" ||
    data.status === "settled" ||
    data.status === "cancelled"
      ? data.status
      : "scheduled";

  return {
    id,
    tournamentId: typeof data.tournamentId === "string" ? data.tournamentId : "",
    ticketId: typeof data.ticketId === "string" ? data.ticketId : "",
    homeTeamCode: typeof data.homeTeamCode === "string" ? data.homeTeamCode : "",
    awayTeamCode: typeof data.awayTeamCode === "string" ? data.awayTeamCode : "",
    kickoffAtUtc: dateLikeToIso(data.kickoffAtUtc),
    kickoffAtSk: typeof data.kickoffAtSk === "string" ? data.kickoffAtSk : "",
    officialMatchdayKey:
      typeof data.officialMatchdayKey === "string" ? data.officialMatchdayKey : "",
    status,
    finalScore,
    currentScore,
    providerStatus: typeof data.providerStatus === "string" ? data.providerStatus : null,
    settlementTriggerStatus:
      typeof data.settlementTriggerStatus === "string" ? data.settlementTriggerStatus : null
  };
}

function normalizeBet(id: string, data: Record<string, unknown>): BetDocument | null {
  const score = normalizeScore(data.score);
  if (
    !score ||
    typeof data.playerId !== "string" ||
    typeof data.matchId !== "string" ||
    typeof data.ticketId !== "string"
  ) {
    return null;
  }

  return {
    id,
    playerId: data.playerId,
    matchId: data.matchId,
    ticketId: data.ticketId,
    score,
    submittedAt: dateLikeToIso(data.submittedAt),
    updatedAt: dateLikeToIso(data.updatedAt)
  };
}

function normalizeSnapshotBet(value: unknown): TicketSnapshotBet | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  if (typeof data.playerId !== "string" || typeof data.matchId !== "string") {
    return null;
  }

  const score = normalizeScore(data.score);
  return {
    playerId: data.playerId,
    matchId: data.matchId,
    score,
    registrationOrder:
      typeof data.registrationOrder === "number" && Number.isFinite(data.registrationOrder)
        ? data.registrationOrder
        : 9999
  };
}

function normalizeSnapshot(id: string, data: Record<string, unknown>): TicketSnapshotDocument {
  return {
    ticketId: typeof data.ticketId === "string" ? data.ticketId : id,
    lockedAt: dateLikeToIso(data.lockedAt),
    matchIds: normalizeStringArray(data.matchIds),
    playerIds: normalizeStringArray(data.playerIds),
    bets: Array.isArray(data.bets)
      ? data.bets
          .map((bet) => normalizeSnapshotBet(bet))
          .filter((bet): bet is TicketSnapshotBet => bet !== null)
      : []
  };
}

function normalizeLongTermPickDocument(id: string, data: Record<string, unknown>): LongTermPickDocument | null {
  if (typeof data.playerId !== "string" || typeof data.ticketId !== "string") {
    return null;
  }

  return {
    id,
    playerId: data.playerId,
    ticketId: data.ticketId,
    tournamentId: typeof data.tournamentId === "string" ? data.tournamentId : "",
    ...(typeof data.tournamentKey === "string" ? { tournamentKey: data.tournamentKey } : {}),
    picks: normalizeLongTermPicks(data.picks),
    submittedAt: dateLikeToIso(data.submittedAt),
    updatedAt: dateLikeToIso(data.updatedAt)
  };
}

function normalizeLongTermSnapshotPick(value: unknown): LongTermSnapshotDocument["picks"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  if (typeof data.playerId !== "string") {
    return null;
  }

  return {
    playerId: data.playerId,
    picks: normalizeLongTermPicks(data.picks),
    registrationOrder:
      typeof data.registrationOrder === "number" && Number.isFinite(data.registrationOrder)
        ? data.registrationOrder
        : 9999
  };
}

function normalizeLongTermSnapshot(id: string, data: Record<string, unknown>): LongTermSnapshotDocument {
  return {
    ticketId: typeof data.ticketId === "string" ? data.ticketId : id,
    lockedAt: dateLikeToIso(data.lockedAt),
    playerIds: normalizeStringArray(data.playerIds),
    slots: normalizeLongTermSlots(data.slots) ?? [],
    picks: Array.isArray(data.picks)
      ? data.picks
          .map((pick) => normalizeLongTermSnapshotPick(pick))
          .filter((pick): pick is LongTermSnapshotDocument["picks"][number] => pick !== null)
      : []
  };
}

function normalizePlayer(id: string, data: Record<string, unknown>): TicketFeedPlayer {
  return {
    id,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "Hrac",
    role: data.role === "admin" ? "admin" : "player",
    isPlayer: data.isPlayer === true,
    status: data.status === "blocked" ? "blocked" : "active",
    blocked: typeof data.blocked === "boolean" ? data.blocked : data.status === "blocked",
    paymentStatus: data.paymentStatus === "paid" ? "paid" : "unpaid",
    registrationOrder:
      typeof data.registrationOrder === "number" && Number.isFinite(data.registrationOrder)
        ? data.registrationOrder
        : 9999,
    createdAt: dateLikeToIso(data.createdAt),
    updatedAt: dateLikeToIso(data.updatedAt),
    ...(typeof data.avatarLabel === "string" ? { avatarLabel: data.avatarLabel } : {})
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeBadgeKind(value: unknown): BadgeKind {
  return value === "bet" ? "bet" : "result";
}

function normalizeBorderTone(value: unknown, kind: BadgeKind): BadgeBorderTone {
  return value === "orange" ||
    value === "brown" ||
    value === "yellow" ||
    value === "green" ||
    value === "blue" ||
    value === "red" ||
    value === "white"
    ? value
    : kind === "bet"
      ? "white"
      : "yellow";
}

function normalizeBadge(snapshotId: string, data: Record<string, unknown>): PlayerBadgeChipWithOwner | null {
  const leader = data.leader;
  if (!leader || typeof leader !== "object") {
    return null;
  }

  const playerId = stringValue((leader as Record<string, unknown>).playerId);
  const title = stringValue(data.title) ?? stringValue(data.name);

  if (!playerId || !title) {
    return null;
  }

  const kind = normalizeBadgeKind(data.kind);

  return {
    playerId,
    badgeKey: stringValue(data.badgeKey) ?? snapshotId,
    title,
    explanation: stringValue(data.caption) ?? stringValue(data.explanation) ?? "",
    emoji: stringValue(data.emoji) ?? "🏷️",
    kind,
    borderTone: normalizeBorderTone(data.borderTone ?? data.border, kind)
  };
}

function buildState(buckets: FeedBuckets): TicketFeedState {
  const matchesByTicketId: Record<string, MatchDocument[]> = {};
  const ownBetsByMatchId: Record<string, BetDocument> = {};
  const snapshotsByTicketId: Record<string, TicketSnapshotDocument> = {};
  const ownLongTermPicksByTicketId: Record<string, LongTermPickDocument> = {};
  const longTermSnapshotsByTicketId: Record<string, LongTermSnapshotDocument> = {};
  const playersById: Record<string, TicketFeedPlayer> = {};

  for (const match of buckets.matches) {
    const matches = matchesByTicketId[match.ticketId] ?? [];
    matches.push(match);
    matchesByTicketId[match.ticketId] = matches;
  }

  for (const matches of Object.values(matchesByTicketId)) {
    matches.sort((left, right) => left.kickoffAtUtc.localeCompare(right.kickoffAtUtc));
  }

  for (const bet of buckets.ownBets) {
    ownBetsByMatchId[bet.matchId] = bet;
  }

  for (const snapshot of buckets.snapshots) {
    snapshotsByTicketId[snapshot.ticketId] = snapshot;
  }

  for (const pick of buckets.ownLongTermPicks) {
    ownLongTermPicksByTicketId[pick.ticketId] = pick;
  }

  for (const snapshot of buckets.longTermSnapshots) {
    longTermSnapshotsByTicketId[snapshot.ticketId] = snapshot;
  }

  const badgesByPlayer = new Map<string, PlayerBadgeChip[]>();
  for (const badge of buckets.badges) {
    const current = badgesByPlayer.get(badge.playerId) ?? [];
    current.push({
      badgeKey: badge.badgeKey,
      title: badge.title,
      explanation: badge.explanation,
      emoji: badge.emoji,
      kind: badge.kind,
      borderTone: badge.borderTone
    });
    badgesByPlayer.set(badge.playerId, current);
  }

  const players = [...buckets.players]
    .map((player) => ({
      ...player,
      badges: badgesByPlayer.get(player.id) ?? []
    }))
    .sort((left, right) => {
      const order = left.registrationOrder - right.registrationOrder;
      return order === 0 ? left.id.localeCompare(right.id) : order;
    });

  for (const player of players) {
    playersById[player.id] = player;
  }

  return {
    tickets: [...buckets.tickets].sort((left, right) =>
      left.lockAtUtc.localeCompare(right.lockAtUtc)
    ),
    matchesByTicketId,
    ownBetsByMatchId,
    snapshotsByTicketId,
    ownLongTermPicksByTicketId,
    longTermSnapshotsByTicketId,
    players,
    playersById
  };
}

function buildBetDocumentId(playerId: string, matchId: string): string {
  return `${playerId}_${matchId}`;
}

function buildLongTermPickDocumentId(playerId: string, ticketId: string): string {
  return `${playerId}_${ticketId}`;
}

export function subscribeTicketFeed(
  playerId: string,
  onChange: (state: TicketFeedState) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const buckets: FeedBuckets = {
    tickets: [],
    matches: [],
    ownBets: [],
    snapshots: [],
    ownLongTermPicks: [],
    longTermSnapshots: [],
    players: [],
    badges: []
  };
  const emit = () => onChange(buildState(buckets));
  const subscriptions: Unsubscribe[] = [
    onSnapshot(
      query(collection(db, "tickets"), orderBy("lockAtUtc", "asc")),
      (snapshot) => {
        buckets.tickets = snapshot.docs.map((ticket) => normalizeTicket(ticket.id, ticket.data()));
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(db, "matches"), orderBy("kickoffAtUtc", "asc")),
      (snapshot) => {
        buckets.matches = snapshot.docs.map((match) => normalizeMatch(match.id, match.data()));
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(db, "bets"), where("playerId", "==", playerId)),
      (snapshot) => {
        buckets.ownBets = snapshot.docs
          .map((bet) => normalizeBet(bet.id, bet.data()))
          .filter((bet): bet is BetDocument => bet !== null);
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "ticketSnapshots"),
      (snapshot) => {
        buckets.snapshots = snapshot.docs.map((snap) => normalizeSnapshot(snap.id, snap.data()));
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(db, "longTermPicks"), where("playerId", "==", playerId)),
      (snapshot) => {
        buckets.ownLongTermPicks = snapshot.docs
          .map((pick) => normalizeLongTermPickDocument(pick.id, pick.data()))
          .filter((pick): pick is LongTermPickDocument => pick !== null);
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "longTermSnapshots"),
      (snapshot) => {
        buckets.longTermSnapshots = snapshot.docs.map((snap) => normalizeLongTermSnapshot(snap.id, snap.data()));
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(db, "players"), orderBy("registrationOrder", "asc")),
      (snapshot) => {
        buckets.players = snapshot.docs.map((player) => normalizePlayer(player.id, player.data()));
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "badges"),
      (snapshot) => {
        buckets.badges = snapshot.docs
          .map((badge) => normalizeBadge(badge.id, badge.data()))
          .filter((badge): badge is PlayerBadgeChipWithOwner => badge !== null);
        emit();
      },
      onError
    )
  ];

  emit();

  return () => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  };
}

export async function saveExactScoreBet({
  playerId,
  ticketId,
  matchId,
  score
}: SaveBetInput): Promise<void> {
  if (auth.currentUser?.uid !== playerId) {
    throw new Error("Tip moze ulozit iba prihlaseny hrac.");
  }

  if (!Number.isInteger(score.home) || !Number.isInteger(score.away) || score.home < 0 || score.away < 0) {
    throw new Error("Skore musi byt cele nezaporne cislo.");
  }

  const betId = buildBetDocumentId(playerId, matchId);
  const betRef = doc(db, "bets", betId);

  await setDoc(
    betRef,
    {
      id: betId,
      playerId,
      ticketId,
      matchId,
      score,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveLongTermPicks({
  playerId,
  ticketId,
  tournamentId,
  tournamentKey,
  picks
}: SaveLongTermPicksInput): Promise<void> {
  if (auth.currentUser?.uid !== playerId) {
    throw new Error("Dlhodobý tip môže uložiť iba prihlásený hráč.");
  }

  const selected = Object.values(picks).filter((code): code is string => Boolean(code));
  if (selected.length !== new Set(selected).size) {
    throw new Error("Rovnaký tím nemôže byť vybraný dvakrát.");
  }

  const pickId = buildLongTermPickDocumentId(playerId, ticketId);
  const pickRef = doc(db, "longTermPicks", pickId);

  await setDoc(
    pickRef,
    {
      id: pickId,
      playerId,
      ticketId,
      tournamentId,
      ...(tournamentKey ? { tournamentKey } : {}),
      picks,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
