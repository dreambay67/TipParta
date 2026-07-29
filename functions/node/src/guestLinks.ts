import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminDb } from "./firebaseAdmin.js";

type HttpsErrorCode = ConstructorParameters<typeof HttpsError>[0];

type DocumentSnapshotLike = {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type QuerySnapshotLike = {
  docs: DocumentSnapshotLike[];
};

type QueryLike = {
  where(fieldPath: string, opStr: "==", value: unknown): QueryLike;
  get(): Promise<QuerySnapshotLike>;
};

type DocumentReferenceLike = {
  collection(name: string): CollectionReferenceLike;
  get(): Promise<DocumentSnapshotLike>;
};

type CollectionReferenceLike = QueryLike & {
  doc(id: string): DocumentReferenceLike;
};

type FirestoreLike = {
  collection(name: string): CollectionReferenceLike;
};

type Score = {
  home: number;
  away: number;
};

export type GuestLeaderboardRow = {
  playerId: string;
  displayName: string;
  units?: number;
  exactHits?: number;
  avatarLabel?: string;
};

export type GuestSettledResult = {
  matchId: string;
  tournamentId: string;
  ticketId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAtUtc: string;
  kickoffAtSk: string;
  officialMatchdayKey: string;
  status: "finished" | "settled";
  finalScore: Score;
};

export type GuestBadgePerson = {
  playerId: string;
  displayName: string;
  avatarLabel?: string;
};

export type GuestBadge = {
  badgeKey: string;
  title: string;
  explanation: string;
  caption?: string;
  kind?: "result" | "bet";
  emoji?: string;
  border?: "orange" | "brown" | "yellow" | "green" | "blue" | "red" | "white";
  borderTone?: "orange" | "brown" | "yellow" | "green" | "blue" | "red" | "white";
  leader: GuestBadgePerson;
  followers: GuestBadgePerson[];
  indicators: Array<{ label: string; value: string }>;
  tone?: "hot" | "cold" | "gold";
};

export type GuestRecord = {
  recordKey: string;
  title: string;
  rows: Array<{
    date?: string;
    label: string;
    sourceId: string;
    sourceLabel: string;
    value: string;
    detail?: string;
  }>;
};

export type GuestStandingsPayload = {
  guestLink: {
    token: string;
    createdAt: string;
    label: string;
    allowedTournamentId: string;
  };
  settledResults: GuestSettledResult[];
  leaderboards: {
    total: GuestLeaderboardRow[];
    exact: GuestLeaderboardRow[];
  };
  badges: GuestBadge[];
  records: GuestRecord[];
};

type PlayerDisplay = {
  playerId: string;
  displayName: string;
  registrationOrder: number;
  avatarLabel?: string;
};

export class GuestLinkError extends Error {
  constructor(
    public readonly code: HttpsErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GuestLinkError";
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

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

  if (value && typeof value === "object" && "toMillis" in value) {
    const maybeTimestamp = value as { toMillis?: unknown };
    if (typeof maybeTimestamp.toMillis === "function") {
      return new Date(maybeTimestamp.toMillis()).toISOString();
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

function explicitlyMatchesTournament(
  data: Record<string, unknown>,
  allowedTournamentId: string
): boolean {
  const tournamentId = stringValue(data.tournamentId);
  const explicitAllowedTournamentId = stringValue(data.allowedTournamentId);

  return tournamentId === allowedTournamentId || explicitAllowedTournamentId === allowedTournamentId;
}

function playerDisplayFromSnapshot(snapshot: DocumentSnapshotLike): PlayerDisplay {
  const data = snapshot.data() ?? {};
  return {
    playerId: snapshot.id,
    displayName: stringValue(data.displayName) ?? stringValue(data.name) ?? snapshot.id,
    registrationOrder: numberValue(data.registrationOrder, 9999),
    ...(stringValue(data.avatarLabel) ? { avatarLabel: stringValue(data.avatarLabel) } : {})
  };
}

async function loadPlayers(db: FirestoreLike): Promise<Map<string, PlayerDisplay>> {
  const snapshot = await db.collection("players").get();
  const players = new Map<string, PlayerDisplay>();

  for (const playerSnapshot of snapshot.docs) {
    const player = playerDisplayFromSnapshot(playerSnapshot);
    players.set(player.playerId, player);
  }

  return players;
}

function displayForPlayer(
  playerId: string,
  players: Map<string, PlayerDisplay>,
  rowData?: Record<string, unknown>
): PlayerDisplay {
  const player = players.get(playerId);

  return {
    playerId,
    displayName:
      player?.displayName ??
      stringValue(rowData?.displayName) ??
      stringValue(rowData?.name) ??
      playerId,
    registrationOrder: player?.registrationOrder ?? numberValue(rowData?.registrationOrder, 9999),
    ...(player?.avatarLabel || stringValue(rowData?.avatarLabel)
      ? { avatarLabel: player?.avatarLabel ?? stringValue(rowData?.avatarLabel) }
      : {})
  };
}

function publicLeaderboardRow(
  playerId: string,
  players: Map<string, PlayerDisplay>,
  data: Record<string, unknown>,
  metricKey: "units" | "exactHits"
): GuestLeaderboardRow & { sortMetric: number; sortOrder: number } {
  const display = displayForPlayer(playerId, players, data);
  const metric = numberValue(data[metricKey]);

  return {
    playerId,
    displayName: display.displayName,
    [metricKey]: metric,
    ...(display.avatarLabel ? { avatarLabel: display.avatarLabel } : {}),
    sortMetric: metric,
    sortOrder: display.registrationOrder
  };
}

async function loadLeaderboard(
  db: FirestoreLike,
  boardKey: "total" | "exact",
  players: Map<string, PlayerDisplay>,
  allowedTournamentId: string
): Promise<GuestLeaderboardRow[]> {
  const metricKey = boardKey === "total" ? "units" : "exactHits";
  const snapshot = await db.collection("leaderboards").doc(boardKey).collection("players").get();
  const rows = snapshot.docs
    .map((rowSnapshot) => {
      const data = rowSnapshot.data() ?? {};
      if (!explicitlyMatchesTournament(data, allowedTournamentId)) {
        return null;
      }

      const playerId = stringValue(data.playerId) ?? rowSnapshot.id;
      return publicLeaderboardRow(playerId, players, data, metricKey);
    })
    .filter((row): row is GuestLeaderboardRow & { sortMetric: number; sortOrder: number } => row !== null);

  rows.sort((left, right) => {
    const metricOrder = right.sortMetric - left.sortMetric;
    if (metricOrder !== 0) {
      return metricOrder;
    }

    const registrationOrder = left.sortOrder - right.sortOrder;
    return registrationOrder === 0 ? left.playerId.localeCompare(right.playerId) : registrationOrder;
  });

  return rows.map(({ sortMetric: _sortMetric, sortOrder: _sortOrder, ...row }) => row);
}

function settledResultFromSnapshot(snapshot: DocumentSnapshotLike): GuestSettledResult | null {
  const data = snapshot.data() ?? {};
  const status = data.status === "finished" || data.status === "settled" ? data.status : null;
  const finalScore = normalizeScore(data.finalScore);

  if (!status || !finalScore) {
    return null;
  }

  return {
    matchId: snapshot.id,
    tournamentId: stringValue(data.tournamentId) ?? "",
    ticketId: stringValue(data.ticketId) ?? "",
    homeTeamCode: stringValue(data.homeTeamCode) ?? "",
    awayTeamCode: stringValue(data.awayTeamCode) ?? "",
    kickoffAtUtc: dateLikeToIso(data.kickoffAtUtc),
    kickoffAtSk: stringValue(data.kickoffAtSk) ?? "",
    officialMatchdayKey: stringValue(data.officialMatchdayKey) ?? "",
    status,
    finalScore
  };
}

async function loadSettledResults(
  db: FirestoreLike,
  allowedTournamentId: string
): Promise<GuestSettledResult[]> {
  const snapshot = await db
    .collection("matches")
    .where("tournamentId", "==", allowedTournamentId)
    .get();
  const results = snapshot.docs
    .map((matchSnapshot) => settledResultFromSnapshot(matchSnapshot))
    .filter((match): match is GuestSettledResult => match !== null);

  results.sort((left, right) => {
    const kickoffOrder = left.kickoffAtUtc.localeCompare(right.kickoffAtUtc);
    return kickoffOrder === 0 ? left.matchId.localeCompare(right.matchId) : kickoffOrder;
  });

  return results;
}

function sanitizeBadgePerson(
  value: unknown,
  players: Map<string, PlayerDisplay>
): GuestBadgePerson | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const playerId = stringValue(data.playerId) ?? stringValue(data.id);
  if (!playerId) {
    return null;
  }

  const display = displayForPlayer(playerId, players, data);
  return {
    playerId,
    displayName: display.displayName,
    ...(display.avatarLabel ? { avatarLabel: display.avatarLabel } : {})
  };
}

function sanitizeBadgeIndicator(value: unknown): { label: string; value: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const label = stringValue(data.label);
  const indicatorValue =
    stringValue(data.value) ??
    (typeof data.value === "number" && Number.isFinite(data.value) ? String(data.value) : undefined);

  return label && indicatorValue ? { label, value: indicatorValue } : null;
}

function badgeKind(value: unknown): "result" | "bet" {
  return value === "bet" ? "bet" : "result";
}

function badgeBorderTone(
  value: unknown,
  kind: "result" | "bet"
): "orange" | "brown" | "yellow" | "green" | "blue" | "red" | "white" {
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

function sanitizeBadge(
  snapshot: DocumentSnapshotLike,
  players: Map<string, PlayerDisplay>,
  allowedTournamentId: string
): GuestBadge | null {
  const data = snapshot.data() ?? {};
  if (!explicitlyMatchesTournament(data, allowedTournamentId)) {
    return null;
  }

  const leader = sanitizeBadgePerson(data.leader, players);
  const title = stringValue(data.title) ?? stringValue(data.name);

  if (!leader || !title) {
    return null;
  }

  const kind = badgeKind(data.kind);
  const borderTone = badgeBorderTone(data.borderTone ?? data.border, kind);
  const tone =
    data.tone === "hot" || data.tone === "cold" || data.tone === "gold" ? data.tone : undefined;

  return {
    badgeKey: stringValue(data.badgeKey) ?? snapshot.id,
    title,
    explanation: stringValue(data.explanation) ?? "",
    ...(stringValue(data.caption) ? { caption: stringValue(data.caption) } : {}),
    kind,
    ...(stringValue(data.emoji) ? { emoji: stringValue(data.emoji) } : {}),
    border: borderTone,
    borderTone,
    leader,
    followers: Array.isArray(data.followers)
      ? data.followers
          .map((person) => sanitizeBadgePerson(person, players))
          .filter((person): person is GuestBadgePerson => person !== null)
      : [],
    indicators: Array.isArray(data.indicators)
      ? data.indicators
          .map((indicator) => sanitizeBadgeIndicator(indicator))
          .filter((indicator): indicator is { label: string; value: string } => indicator !== null)
      : [],
    ...(tone ? { tone } : {})
  };
}

async function loadBadges(
  db: FirestoreLike,
  players: Map<string, PlayerDisplay>,
  allowedTournamentId: string
): Promise<GuestBadge[]> {
  const snapshot = await db.collection("badges").get();
  return snapshot.docs
    .map((badgeSnapshot) => sanitizeBadge(badgeSnapshot, players, allowedTournamentId))
    .filter((badge): badge is GuestBadge => badge !== null);
}

function sanitizeRecordRow(value: unknown): GuestRecord["rows"][number] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const label = stringValue(data.label);
  const sourceId = stringValue(data.sourceId);
  const sourceLabel = stringValue(data.sourceLabel);
  const rowValue =
    stringValue(data.value) ??
    (typeof data.value === "number" && Number.isFinite(data.value) ? String(data.value) : undefined);

  if (!label || !sourceId || !sourceLabel || !rowValue) {
    return null;
  }

  return {
    ...(stringValue(data.date) ? { date: stringValue(data.date) } : {}),
    label,
    sourceId,
    sourceLabel,
    value: rowValue,
    ...(stringValue(data.detail) ? { detail: stringValue(data.detail) } : {})
  };
}

function sanitizeRecord(snapshot: DocumentSnapshotLike, allowedTournamentId: string): GuestRecord | null {
  const data = snapshot.data() ?? {};
  if (!explicitlyMatchesTournament(data, allowedTournamentId)) {
    return null;
  }

  const title = stringValue(data.title);
  if (!title) {
    return null;
  }

  return {
    recordKey: stringValue(data.recordKey) ?? snapshot.id,
    title,
    rows: Array.isArray(data.rows)
      ? data.rows
          .map((row) => sanitizeRecordRow(row))
          .filter((row): row is GuestRecord["rows"][number] => row !== null)
      : []
  };
}

async function loadRecords(db: FirestoreLike, allowedTournamentId: string): Promise<GuestRecord[]> {
  const snapshot = await db.collection("records").get();
  return snapshot.docs
    .map((recordSnapshot) => sanitizeRecord(recordSnapshot, allowedTournamentId))
    .filter((record): record is GuestRecord => record !== null);
}

function parseCallableToken(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new HttpsError("invalid-argument", "Token navstevnickeho odkazu je povinny.");
  }

  const token = stringValue((data as Record<string, unknown>).token);
  if (!token || token.includes("/") || token.length > 160) {
    throw new HttpsError("invalid-argument", "Token navstevnickeho odkazu je neplatny.");
  }

  return token;
}

export async function buildGuestStandings(
  db: FirestoreLike,
  token: string
): Promise<GuestStandingsPayload> {
  const guestLinkSnapshot = await db.collection("guestLinks").doc(token).get();

  if (!guestLinkSnapshot.exists) {
    throw new GuestLinkError("not-found", "Guest link is not active.");
  }

  const guestLink = guestLinkSnapshot.data() ?? {};
  if (guestLink.active !== true) {
    throw new GuestLinkError("failed-precondition", "Guest link is not active.");
  }

  const allowedTournamentId = stringValue(guestLink.allowedTournamentId);
  if (!allowedTournamentId) {
    throw new GuestLinkError("failed-precondition", "Guest link is not configured.");
  }

  const players = await loadPlayers(db);
  const [settledResults, total, exact, badges, records] = await Promise.all([
    loadSettledResults(db, allowedTournamentId),
    loadLeaderboard(db, "total", players, allowedTournamentId),
    loadLeaderboard(db, "exact", players, allowedTournamentId),
    loadBadges(db, players, allowedTournamentId),
    loadRecords(db, allowedTournamentId)
  ]);

  return {
    guestLink: {
      token: stringValue(guestLink.token) ?? token,
      createdAt: dateLikeToIso(guestLink.createdAt),
      label: stringValue(guestLink.label) ?? "Navstevnicke vysielanie",
      allowedTournamentId
    },
    settledResults,
    leaderboards: {
      total,
      exact
    },
    badges,
    records
  };
}

export const getGuestStandings = onCall(async (request) => {
  const token = parseCallableToken(request.data);

  try {
    return await buildGuestStandings(adminDb, token);
  } catch (error) {
    if (error instanceof GuestLinkError) {
      throw new HttpsError(error.code, error.message);
    }

    throw error;
  }
});
