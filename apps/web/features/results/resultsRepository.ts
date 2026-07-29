"use client";

import type {
  BadgeBorderTone,
  BadgeKind,
  BadgeShowcaseItem,
  PlayerBadgeChip
} from "@/features/badges/BadgeShowcase";
import {
  DEFAULT_TOURNAMENT_KEY,
  LONG_TERM_PREDICTION_SLOTS,
  resolveTournamentTeamDisplay,
  type LongTermPredictionSlot
} from "@tipparta/shared";
import { db } from "@/lib/firebase/client";
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";

export type ResultsLeaderboardRow = {
  playerId: string;
  displayName: string;
  units?: number;
  exactHits?: number;
  avatarLabel?: string;
  badges?: PlayerBadgeChip[];
  registrationOrder: number;
};

export type ResultsRecord = {
  recordKey: string;
  title: string;
  rows: {
    date?: string;
    label: string;
    sourceId: string;
    sourceLabel: string;
    value: string;
    detail?: string;
  }[];
};

export type PreviousDayResultCell = {
  matchId: string;
  betLabel: string;
  units?: number;
  moneyLabel: string;
  exactHit?: boolean;
};

export type PreviousDayResultMatch = {
  matchId: string;
  label: string;
  finalScoreLabel: string;
};

export type PreviousDayResultRow = {
  playerId: string;
  playerName: string;
  cells: PreviousDayResultCell[];
  dailyTotalLabel: string;
  totalLabel: string;
  bonus: string;
};

export type PreviousDayResultTableData = {
  ticketId: string;
  label?: string;
  matches: PreviousDayResultMatch[];
  rows: PreviousDayResultRow[];
};

export type LongTermOverviewTeam = {
  code: string;
  nameSk: string;
  flagCode?: string;
};

export type LongTermOverviewRow = {
  playerId: string;
  playerName: string;
  picks: Partial<Record<LongTermPredictionSlot["key"], LongTermOverviewTeam>>;
};

export type LongTermOverviewData = {
  ticketId: string;
  label: string;
  lockedAt: string;
  slots: LongTermPredictionSlot[];
  rows: LongTermOverviewRow[];
};

export type ResultsTicket = {
  ticketId: string;
  label: string;
  settledAt: string;
  tournamentId: string;
};

export type ResultsPageData = {
  leaderboards: {
    total: ResultsLeaderboardRow[];
    daily: ResultsLeaderboardRow[];
    exact: ResultsLeaderboardRow[];
  };
  badges: BadgeShowcaseItem[];
  records: ResultsRecord[];
  previousDayTicket: ResultsTicket | null;
  previousDayTable: PreviousDayResultTableData | null;
  longTermOverview: LongTermOverviewData | null;
};

type PlayerDisplay = {
  playerId: string;
  displayName: string;
  registrationOrder: number;
  avatarLabel?: string;
};

type ResultsBuckets = {
  players: Map<string, PlayerDisplay>;
  total: ResultsLeaderboardRow[];
  exact: ResultsLeaderboardRow[];
  daily: ResultsLeaderboardRow[];
  badges: BadgeShowcaseItem[];
  records: ResultsRecord[];
  tickets: ResultsTicket[];
  previousDayTable: PreviousDayResultTableData | null;
  longTermOverview: LongTermOverviewData | null;
};

const EMPTY_RESULTS_DATA: ResultsPageData = {
  leaderboards: {
    total: [],
    daily: [],
    exact: []
  },
  badges: [],
  records: [],
  previousDayTicket: null,
  previousDayTable: null,
  longTermOverview: null
};

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

function playerFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): PlayerDisplay {
  const data = snapshot.data();
  return {
    playerId: snapshot.id,
    displayName: stringValue(data.displayName) ?? stringValue(data.name) ?? snapshot.id,
    registrationOrder: numberValue(data.registrationOrder, 9999),
    ...(stringValue(data.avatarLabel) ? { avatarLabel: stringValue(data.avatarLabel) } : {})
  };
}

function playerDisplay(
  playerId: string,
  players: Map<string, PlayerDisplay>,
  data?: Record<string, unknown>
): PlayerDisplay {
  const player = players.get(playerId);
  const avatarLabel = player?.avatarLabel ?? stringValue(data?.avatarLabel);

  return {
    playerId,
    displayName:
      player?.displayName ??
      stringValue(data?.displayName) ??
      stringValue(data?.name) ??
      playerId,
    registrationOrder: player?.registrationOrder ?? numberValue(data?.registrationOrder, 9999),
    ...(avatarLabel ? { avatarLabel } : {})
  };
}

function normalizeLeaderboardData(
  id: string,
  data: Record<string, unknown>,
  players: Map<string, PlayerDisplay>
): ResultsLeaderboardRow {
  const playerId = stringValue(data.playerId) ?? id;
  const display = playerDisplay(playerId, players, data);

  return {
    playerId,
    displayName: display.displayName,
    registrationOrder: display.registrationOrder,
    ...(display.avatarLabel ? { avatarLabel: display.avatarLabel } : {}),
    ...(typeof data.units === "number" && Number.isFinite(data.units)
      ? { units: data.units }
      : {}),
    ...(typeof data.exactHits === "number" && Number.isFinite(data.exactHits)
      ? { exactHits: data.exactHits }
      : {})
  };
}

function normalizeLeaderboardRow(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  players: Map<string, PlayerDisplay>
): ResultsLeaderboardRow {
  return normalizeLeaderboardData(snapshot.id, snapshot.data(), players);
}

function sortLeaderboard(
  rows: ResultsLeaderboardRow[],
  metricKey: "units" | "exactHits"
): ResultsLeaderboardRow[] {
  return [...rows].sort((left, right) => {
    const metricOrder = (right[metricKey] ?? 0) - (left[metricKey] ?? 0);
    if (metricOrder !== 0) {
      return metricOrder;
    }

    const registrationOrder = left.registrationOrder - right.registrationOrder;
    return registrationOrder === 0
      ? left.playerId.localeCompare(right.playerId)
      : registrationOrder;
  });
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

function normalizeBadgePerson(
  value: unknown,
  players: Map<string, PlayerDisplay>
): BadgeShowcaseItem["leader"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const playerId = stringValue(data.playerId) ?? stringValue(data.id);
  if (!playerId) {
    return null;
  }

  const display = playerDisplay(playerId, players, data);
  return {
    playerId,
    displayName: display.displayName,
    ...(display.avatarLabel ? { avatarLabel: display.avatarLabel } : {})
  };
}

function normalizeBadge(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  players: Map<string, PlayerDisplay>
): BadgeShowcaseItem | null {
  const data = snapshot.data();
  const title = stringValue(data.title) ?? stringValue(data.name);
  const leader = normalizeBadgePerson(data.leader, players);

  if (!title || !leader) {
    return null;
  }

  const kind = normalizeBadgeKind(data.kind);
  const borderTone = normalizeBorderTone(data.borderTone ?? data.border, kind);
  const tone =
    data.tone === "hot" || data.tone === "cold" || data.tone === "gold"
      ? data.tone
      : undefined;

  return {
    badgeKey: stringValue(data.badgeKey) ?? snapshot.id,
    title,
    explanation: stringValue(data.explanation) ?? "",
    caption: stringValue(data.caption) ?? stringValue(data.explanation) ?? "",
    kind,
    emoji: stringValue(data.emoji) ?? "🏷️",
    borderTone,
    leader,
    followers: Array.isArray(data.followers)
      ? data.followers
          .map((person) => normalizeBadgePerson(person, players))
          .filter((person): person is BadgeShowcaseItem["leader"] => person !== null)
      : [],
    indicators: Array.isArray(data.indicators)
      ? data.indicators
          .map((indicator) => {
            if (!indicator || typeof indicator !== "object") {
              return null;
            }
            const indicatorData = indicator as Record<string, unknown>;
            const label = stringValue(indicatorData.label);
            const value =
              stringValue(indicatorData.value) ??
              (typeof indicatorData.value === "number" && Number.isFinite(indicatorData.value)
                ? String(indicatorData.value)
                : undefined);
            return label && value ? { label, value } : null;
          })
          .filter((indicator): indicator is { label: string; value: string } => indicator !== null)
      : [],
    ...(tone ? { tone } : {})
  } satisfies BadgeShowcaseItem;
}

function badgeChipsByPlayerId(badges: BadgeShowcaseItem[]): Map<string, PlayerBadgeChip[]> {
  const byPlayer = new Map<string, PlayerBadgeChip[]>();

  for (const badge of badges) {
    const playerId = badge.leader.playerId;
    const current = byPlayer.get(playerId) ?? [];
    current.push({
      badgeKey: badge.badgeKey,
      title: badge.title,
      explanation: badge.caption ?? badge.explanation,
      emoji: badge.emoji ?? "🏷️",
      kind: badge.kind === "bet" ? "bet" : "result",
      borderTone: badge.borderTone ?? badge.border ?? (badge.kind === "bet" ? "white" : "yellow")
    });
    byPlayer.set(playerId, current);
  }

  return byPlayer;
}

function attachBadgesToRows(
  rows: ResultsLeaderboardRow[],
  badgeChips: Map<string, PlayerBadgeChip[]>
): ResultsLeaderboardRow[] {
  return rows.map((row) => ({
    ...row,
    badges: badgeChips.get(row.playerId) ?? []
  }));
}

function normalizeRecordRow(value: unknown): ResultsRecord["rows"][number] | null {
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

function normalizeRecord(snapshot: QueryDocumentSnapshot<DocumentData>): ResultsRecord | null {
  const data = snapshot.data();
  const title = stringValue(data.title);

  if (!title) {
    return null;
  }

  return {
    recordKey: stringValue(data.recordKey) ?? snapshot.id,
    title,
    rows: Array.isArray(data.rows)
      ? data.rows
          .map((row) => normalizeRecordRow(row))
          .filter((row): row is ResultsRecord["rows"][number] => row !== null)
      : []
  };
}

function normalizeTicket(snapshot: QueryDocumentSnapshot<DocumentData>): ResultsTicket | null {
  const data = snapshot.data();
  if (data.status !== "settled") {
    return null;
  }

  const settledAt =
    dateLikeToIso(data.settledAtUtc) ||
    dateLikeToIso(data.settledAt) ||
    dateLikeToIso(data.lockedAtUtc) ||
    dateLikeToIso(data.lockAtUtc) ||
    dateLikeToIso(data.lockAt);

  return {
    ticketId: snapshot.id,
    label:
      stringValue(data.label) ??
      stringValue(data.officialMatchdayKey) ??
      stringValue(data.lockAtSk) ??
      snapshot.id,
    settledAt,
    tournamentId: stringValue(data.tournamentId) ?? ""
  };
}

function normalizeResultCell(value: unknown, fallbackMatchId: string): PreviousDayResultCell {
  if (!value || typeof value !== "object") {
    return {
      matchId: fallbackMatchId,
      betLabel: "bez tipu",
      moneyLabel: "0,00 €"
    };
  }

  const data = value as Record<string, unknown>;
  return {
    matchId: stringValue(data.matchId) ?? fallbackMatchId,
    betLabel: stringValue(data.betLabel) ?? stringValue(data.tipLabel) ?? "bez tipu",
    ...(data.exactHit === true ? { exactHit: true } : {}),
    ...(typeof data.units === "number" && Number.isFinite(data.units) ? { units: data.units } : {}),
    moneyLabel: stringValue(data.moneyLabel) ?? stringValue(data.valueLabel) ?? "0,00 €"
  };
}

function normalizeResultTable(data: Record<string, unknown>, fallbackTicketId: string): PreviousDayResultTableData | null {
  const matches = Array.isArray(data.matches)
    ? data.matches
        .map((match, index) => {
          if (!match || typeof match !== "object") {
            return null;
          }
          const matchData = match as Record<string, unknown>;
          const matchId = stringValue(matchData.matchId) ?? `match-${index + 1}`;
          return {
            matchId,
            label: stringValue(matchData.label) ?? stringValue(matchData.matchLabel) ?? matchId,
            finalScoreLabel:
              stringValue(matchData.finalScoreLabel) ??
              stringValue(matchData.resultLabel) ??
              "čaká"
          };
        })
        .filter((match): match is PreviousDayResultMatch => match !== null)
    : [];

  const rows = Array.isArray(data.rows)
    ? data.rows
        .map((row) => {
          if (!row || typeof row !== "object") {
            return null;
          }
          const rowData = row as Record<string, unknown>;
          const playerId = stringValue(rowData.playerId) ?? stringValue(rowData.id);
          const playerName =
            stringValue(rowData.playerName) ??
            stringValue(rowData.displayName) ??
            stringValue(rowData.name);

          if (!playerId || !playerName) {
            return null;
          }

          const rawCells = rowData.cells;
          const cells = Array.isArray(rawCells)
            ? rawCells.map((cell, index) => normalizeResultCell(cell, matches[index]?.matchId ?? `match-${index + 1}`))
            : rawCells && typeof rawCells === "object"
              ? matches.map((match) =>
                  normalizeResultCell((rawCells as Record<string, unknown>)[match.matchId], match.matchId)
                )
              : [];

          return {
            playerId,
            playerName,
            cells,
            dailyTotalLabel:
              stringValue(rowData.dailyTotalLabel) ??
              stringValue(rowData.dailyLabel) ??
              "0,00 €",
            totalLabel:
              stringValue(rowData.totalLabel) ??
              stringValue(rowData.cumulativeTotalLabel) ??
              "0,00 €",
            bonus:
              stringValue(rowData.bonusLabel) ??
              (typeof rowData.bonus === "number" && Number.isFinite(rowData.bonus)
                ? String(rowData.bonus)
                : stringValue(rowData.bonus) ?? "0")
          };
        })
        .filter((row): row is PreviousDayResultRow => row !== null)
    : [];

  if (matches.length === 0 && rows.length === 0) {
    return null;
  }

  return {
    ticketId: stringValue(data.ticketId) ?? fallbackTicketId,
    ...(stringValue(data.label) ? { label: stringValue(data.label) } : {}),
    matches,
    rows
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

function normalizeLongTermOverview(
  id: string,
  data: Record<string, unknown>,
  players: Map<string, PlayerDisplay>
): LongTermOverviewData | null {
  const playerIds = Array.isArray(data.playerIds)
    ? data.playerIds.filter((playerId): playerId is string => typeof playerId === "string")
    : [];
  const slots = normalizeLongTermSlots(data.slots);
  const rawPicks = Array.isArray(data.picks)
    ? data.picks.filter((pick): pick is Record<string, unknown> => Boolean(pick) && typeof pick === "object")
    : [];
  const picksByPlayer = new Map<string, Record<string, unknown>>();

  for (const rawPick of rawPicks) {
    const playerId = stringValue(rawPick.playerId);
    if (playerId && rawPick.picks && typeof rawPick.picks === "object") {
      picksByPlayer.set(playerId, rawPick.picks as Record<string, unknown>);
    }
  }

  const rowPlayerIds =
    playerIds.length > 0
      ? playerIds
      : rawPicks
          .map((pick) => stringValue(pick.playerId))
          .filter((playerId): playerId is string => Boolean(playerId));

  if (rowPlayerIds.length === 0) {
    return null;
  }

  return {
    ticketId: stringValue(data.ticketId) ?? id,
    label: stringValue(data.label) ?? "Dlhodobé tipy",
    lockedAt: dateLikeToIso(data.lockedAt),
    slots,
    rows: rowPlayerIds.map((playerId) => {
      const display = playerDisplay(playerId, players);
      const rawPlayerPicks = picksByPlayer.get(playerId) ?? {};
      const picks: LongTermOverviewRow["picks"] = {};
      for (const slot of slots) {
        const code = rawPlayerPicks[slot.key];
        if (typeof code === "string" && code.trim()) {
          picks[slot.key] = resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, code.trim().toUpperCase());
        }
      }

      return {
        playerId,
        playerName: display.displayName,
        picks
      };
    })
  };
}

function buildData(buckets: ResultsBuckets): ResultsPageData {
  const [previousDayTicket] = [...buckets.tickets].sort((left, right) => {
    const dateOrder = right.settledAt.localeCompare(left.settledAt);
    return dateOrder === 0 ? right.ticketId.localeCompare(left.ticketId) : dateOrder;
  });

  const chipsByPlayer = badgeChipsByPlayerId(buckets.badges);

  return {
    leaderboards: {
      total: attachBadgesToRows(sortLeaderboard(buckets.total, "units"), chipsByPlayer),
      daily: attachBadgesToRows(sortLeaderboard(buckets.daily, "units"), chipsByPlayer),
      exact: attachBadgesToRows(sortLeaderboard(buckets.exact, "exactHits"), chipsByPlayer)
    },
    badges: buckets.badges,
    records: buckets.records,
    previousDayTicket: previousDayTicket ?? null,
    previousDayTable: buckets.previousDayTable,
    longTermOverview: buckets.longTermOverview
  };
}

export function subscribeResultsPageData(
  onChange: (data: ResultsPageData) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const buckets: ResultsBuckets = {
    players: new Map(),
    total: [],
    exact: [],
    daily: [],
    badges: [],
    records: [],
    tickets: [],
    previousDayTable: null,
    longTermOverview: null
  };

  let activeTicketId: string | null = null;
  let dailyUnsubscribe: Unsubscribe | null = null;
  let tableUnsubscribes: Unsubscribe[] = [];
  const tableCandidates = new Map<string, PreviousDayResultTableData | null>();
  let longTermSnapshotDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

  const emit = () => onChange(buildData(buckets));

  const refreshLongTermOverview = () => {
    const overviews = longTermSnapshotDocs
      .map((longTermSnapshot) =>
        normalizeLongTermOverview(longTermSnapshot.id, longTermSnapshot.data, buckets.players)
      )
      .filter((overview): overview is LongTermOverviewData => overview !== null)
      .sort((left, right) => (right.lockedAt || "").localeCompare(left.lockedAt || ""));
    buckets.longTermOverview = overviews[0] ?? null;
  };

  const refreshDynamicTicketSubscriptions = () => {
    const [ticket] = [...buckets.tickets].sort((left, right) => {
      const dateOrder = right.settledAt.localeCompare(left.settledAt);
      return dateOrder === 0 ? right.ticketId.localeCompare(left.ticketId) : dateOrder;
    });
    const nextTicketId = ticket?.ticketId ?? null;

    if (nextTicketId === activeTicketId) {
      return;
    }

    dailyUnsubscribe?.();
    for (const unsubscribe of tableUnsubscribes) {
      unsubscribe();
    }

    activeTicketId = nextTicketId;
    buckets.daily = [];
    buckets.previousDayTable = null;
    tableCandidates.clear();

    if (!nextTicketId) {
      emit();
      return;
    }

    dailyUnsubscribe = onSnapshot(
      collection(db, "leaderboards", "daily", "tickets", nextTicketId, "players"),
      (snapshot) => {
        buckets.daily = snapshot.docs.map((row) => normalizeLeaderboardRow(row, buckets.players));
        emit();
      },
      onError
    );

    const tableRefs = [
      { key: "resultTables", ref: doc(db, "resultTables", nextTicketId) },
      { key: "dailyResultTables", ref: doc(db, "dailyResultTables", nextTicketId) },
      { key: "ticketResultTable", ref: doc(db, "tickets", nextTicketId, "results", "table") }
    ];

    tableUnsubscribes = tableRefs.map(({ key, ref }) =>
      onSnapshot(
        ref,
        (snapshot) => {
          tableCandidates.set(
            key,
            snapshot.exists() ? normalizeResultTable(snapshot.data(), nextTicketId) : null
          );
          buckets.previousDayTable =
            tableCandidates.get("resultTables") ??
            tableCandidates.get("dailyResultTables") ??
            tableCandidates.get("ticketResultTable") ??
            null;
          emit();
        },
        onError
      )
    );

    emit();
  };

  const subscriptions: Unsubscribe[] = [
    onSnapshot(
      collection(db, "players"),
      (snapshot) => {
        buckets.players = new Map(
          snapshot.docs.map((playerSnapshot) => {
            const player = playerFromSnapshot(playerSnapshot);
            return [player.playerId, player];
          })
        );
        buckets.total = buckets.total.map((row) =>
          normalizeLeaderboardData(row.playerId, row, buckets.players)
        );
        buckets.exact = buckets.exact.map((row) =>
          normalizeLeaderboardData(row.playerId, row, buckets.players)
        );
        buckets.daily = buckets.daily.map((row) =>
          normalizeLeaderboardData(row.playerId, row, buckets.players)
        );
        refreshLongTermOverview();
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "leaderboards", "total", "players"),
      (snapshot) => {
        buckets.total = snapshot.docs.map((row) => normalizeLeaderboardRow(row, buckets.players));
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "leaderboards", "exact", "players"),
      (snapshot) => {
        buckets.exact = snapshot.docs.map((row) => normalizeLeaderboardRow(row, buckets.players));
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "badges"),
      (snapshot) => {
        buckets.badges = snapshot.docs
          .map((badge) => normalizeBadge(badge, buckets.players))
          .filter((badge): badge is BadgeShowcaseItem => badge !== null);
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "records"),
      (snapshot) => {
        buckets.records = snapshot.docs
          .map((record) => normalizeRecord(record))
          .filter((record): record is ResultsRecord => record !== null);
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "tickets"),
      (snapshot) => {
        buckets.tickets = snapshot.docs
          .map((ticket) => normalizeTicket(ticket))
          .filter((ticket): ticket is ResultsTicket => ticket !== null);
        refreshDynamicTicketSubscriptions();
        emit();
      },
      onError
    ),
    onSnapshot(
      collection(db, "longTermSnapshots"),
      (snapshot) => {
        longTermSnapshotDocs = snapshot.docs.map((longTermSnapshot) => ({
          id: longTermSnapshot.id,
          data: longTermSnapshot.data()
        }));
        refreshLongTermOverview();
        emit();
      },
      onError
    )
  ];

  onChange(EMPTY_RESULTS_DATA);

  return () => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    dailyUnsubscribe?.();
    for (const unsubscribe of tableUnsubscribes) {
      unsubscribe();
    }
  };
}
