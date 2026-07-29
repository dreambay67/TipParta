import { teamDisplayLabel } from "../teams.js";

export type DailyResultMatchColumn = {
  matchId: string;
  label: string;
  finalScoreLabel: string;
};

export type DailyResultCell = {
  matchId: string;
  betLabel: string;
  units: number;
  moneyLabel: string;
  exactHit: boolean;
  statusLabel?: string;
};

export type DailyResultBadgeChip = {
  badgeKey: string;
  title: string;
  emoji: string;
};

export type DailyResultRow = {
  playerId: string;
  playerName: string;
  badges?: DailyResultBadgeChip[];
  cells: DailyResultCell[];
  dailyUnits: number;
  totalUnits: number;
  dailyTotalLabel: string;
  totalLabel: string;
  bonus: number;
  bonusLabel: string;
};

export type DailyResultTable = {
  ticketId: string;
  tournamentKey: string | null;
  ticketLabel: string;
  summaryColumns: ["Denná zmena", "Celkový stav", "Bonus"];
  matches: DailyResultMatchColumn[];
  resultRow: {
    label: "Výsledok";
    cells: string[];
    dailyTotalLabel: "";
    totalLabel: "";
    bonusLabel: "";
  };
  rows: DailyResultRow[];
};

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
};

type QuerySnapshotLike = {
  docs: Array<{
    id: string;
    data(): Record<string, unknown>;
  }>;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  get(): Promise<QuerySnapshotLike>;
};

export type DailyResultTableDb = {
  collection(name: string): CollectionLike;
};

type Score = {
  home: number;
  away: number;
};

type Player = {
  id: string;
  displayName: string;
  email?: string;
  registrationOrder: number;
};

type Impact = {
  units: number;
  exactHit: boolean;
};

type TournamentImpact = {
  units: number;
  exactHits: number;
};

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const NO_RESULT_LABEL = "Neodohrané";
const NO_BET_LABEL = "Bez tipu";

function validScore(value: unknown): Score | null {
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

function scoreLabel(score: Score | null): string {
  return score ? `${score.home}:${score.away}` : NO_BET_LABEL;
}

export function formatResultMoney(units: number): string {
  const normalizedUnits = Object.is(units, -0) ? 0 : units;
  const sign = normalizedUnits > 0 ? "+" : normalizedUnits < 0 ? "-" : "";
  const absolute = Math.abs(normalizedUnits) * 0.05;

  return `${sign}${absolute.toFixed(2).replace(".", ",")} €`;
}

function numericField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function idsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function teamLabel(tournamentKey: string | null, code: unknown, fallback: unknown): string {
  return teamDisplayLabel(
    tournamentKey,
    typeof code === "string" ? code : undefined,
    typeof fallback === "string" ? fallback : undefined,
    { flag: true }
  );
}

/*
  if (typeof code === "string") {
    const seed = resolveTournamentTeamSeed(tournamentKey ?? "", code) ?? getTeamSeedByCode(code);
    if (seed) {
      return seed.nameSk;
    }
  }

  if (typeof fallback === "string" && fallback.trim()) {
    const seed = tournamentKey ? resolveTournamentTeamSeed(tournamentKey, fallback) : resolveTeamSeed(fallback);
    return seed?.nameSk ?? fallback.trim();
  }

  return "Tím";
}

*/

async function getRequiredDoc(
  db: DailyResultTableDb,
  collection: string,
  id: string
): Promise<Record<string, unknown>> {
  const snap = await db.collection(collection).doc(id).get();

  if (!snap.exists) {
    throw new Error(`Missing ${collection}/${id}.`);
  }

  return snap.data() ?? {};
}

async function getOptionalDoc(
  db: DailyResultTableDb,
  collection: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() ?? {} : null;
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

function isCancelledOrUnplayed(match: Record<string, unknown>): boolean {
  const status = typeof match.status === "string" ? match.status.toLowerCase() : "";
  const providerStatus = typeof match.providerStatus === "string" ? match.providerStatus.toLowerCase() : "";
  const settlementStatus =
    typeof match.settlementTriggerStatus === "string" ? match.settlementTriggerStatus.toLowerCase() : "";

  return (
    status === "cancelled" ||
    status === "canceled" ||
    status === "unplayed" ||
    providerStatus === "cancelled" ||
    providerStatus === "canceled" ||
    settlementStatus === "cancelled" ||
    settlementStatus === "canceled"
  );
}

function settlementLines(data: Record<string, unknown> | null): Record<string, unknown>[] {
  return Array.isArray(data?.settlements)
    ? data.settlements.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    : [];
}

function settlementPlayerId(line: Record<string, unknown>): string | null {
  const playerId = line.playerId ?? line.player_id;
  return typeof playerId === "string" && playerId ? playerId : null;
}

function settlementExactHit(line: Record<string, unknown>): boolean {
  return line.exactHit === true || line.exact_hit === true;
}

function impactsByPlayer(settlement: Record<string, unknown> | null): Map<string, Impact> {
  const impacts = new Map<string, Impact>();

  for (const line of settlementLines(settlement)) {
    const playerId = settlementPlayerId(line);
    if (!playerId) {
      continue;
    }

    const current = impacts.get(playerId) ?? { units: 0, exactHit: false };
    current.units += numericField(line.units);
    current.exactHit = current.exactHit || settlementExactHit(line);
    impacts.set(playerId, current);
  }

  return impacts;
}

function addSettlementUnits(target: Map<string, number>, settlement: Record<string, unknown> | null): void {
  for (const line of settlementLines(settlement)) {
    const playerId = settlementPlayerId(line);
    if (!playerId) {
      continue;
    }

    target.set(playerId, (target.get(playerId) ?? 0) + numericField(line.units));
  }
}

function addSettlementImpact(
  target: Map<string, TournamentImpact>,
  settlement: Record<string, unknown> | null
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

function betMap(snapshot: Record<string, unknown>): Map<string, Score | null> {
  const map = new Map<string, Score | null>();

  if (!Array.isArray(snapshot.bets)) {
    return map;
  }

  for (const bet of snapshot.bets) {
    if (!bet || typeof bet !== "object") {
      continue;
    }

    const data = bet as Record<string, unknown>;
    if (typeof data.playerId !== "string" || typeof data.matchId !== "string") {
      continue;
    }

    map.set(`${data.playerId}\n${data.matchId}`, validScore(data.score));
  }

  return map;
}

function normalizePlayer(id: string, data: Record<string, unknown>): Player {
  return {
    id,
    displayName: typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : id,
    email: typeof data.email === "string" && data.email.trim() ? data.email.trim() : undefined,
    registrationOrder: typeof data.registrationOrder === "number" && Number.isFinite(data.registrationOrder)
      ? data.registrationOrder
      : 9999
  };
}

async function loadPlayers(db: DailyResultTableDb, playerIds: string[]): Promise<Player[]> {
  const players: Player[] = [];

  for (const playerId of playerIds) {
    players.push(normalizePlayer(playerId, await getRequiredDoc(db, "players", playerId)));
  }

  return players.sort((left, right) => {
    const order = left.registrationOrder - right.registrationOrder;
    return order === 0 ? left.displayName.localeCompare(right.displayName, "sk") : order;
  });
}

async function tournamentTotals(
  db: DailyResultTableDb,
  tournamentKey: string | null
): Promise<Map<string, TournamentImpact>> {
  const totals = new Map<string, TournamentImpact>();
  const settlementsSnap = await db.collection("matchSettlements").get();

  for (const settlementDoc of settlementsSnap.docs) {
    const match = await getOptionalDoc(db, "matches", settlementDoc.id);
    if (!match || !sameTournament(match, tournamentKey) || isCancelledOrUnplayed(match)) {
      continue;
    }

    addSettlementImpact(totals, settlementDoc.data());
  }

  return totals;
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
    return stringFrom(leader.playerId ?? leader.player_id);
  }

  return stringFrom(data.leaderPlayerId ?? data.leader_player_id);
}

async function loadBadgeChipsByPlayer(
  db: DailyResultTableDb,
  playerIds: string[],
  tournamentKey: string | null
): Promise<Map<string, DailyResultBadgeChip[]>> {
  const playerIdSet = new Set(playerIds);
  const badgesByPlayer = new Map<string, DailyResultBadgeChip[]>();
  const snapshot = await db.collection("badges").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!badgeBelongsToTournament(data, tournamentKey)) {
      continue;
    }

    const playerId = badgeLeaderPlayerId(data);
    if (!playerId || !playerIdSet.has(playerId)) {
      continue;
    }

    const current = badgesByPlayer.get(playerId) ?? [];
    current.push({
      badgeKey: stringFrom(data.badgeKey) ?? doc.id,
      title: stringFrom(data.title) ?? stringFrom(data.name) ?? doc.id,
      emoji: stringFrom(data.emoji) ?? "🏷️"
    });
    badgesByPlayer.set(playerId, current);
  }

  return badgesByPlayer;
}

export async function buildDailyResultTable({
  db,
  ticketId
}: {
  db: DailyResultTableDb;
  ticketId: string;
}): Promise<DailyResultTable> {
  const ticket = await getRequiredDoc(db, "tickets", ticketId);
  const snapshot = await getRequiredDoc(db, "ticketSnapshots", ticketId);
  const matchIds = idsFrom(snapshot.matchIds);
  const playerIds = idsFrom(snapshot.playerIds);
  const players = await loadPlayers(db, playerIds);
  const bets = betMap(snapshot);
  const tournamentKey = tournamentKeyFrom(ticket);
  const matches: Array<DailyResultMatchColumn & { noSettlement: boolean; settlement: Record<string, unknown> | null }> = [];
  const dailyUnitsByPlayer = new Map<string, number>();

  for (const matchId of matchIds) {
    const match = await getRequiredDoc(db, "matches", matchId);
    const settlement = await getOptionalDoc(db, "matchSettlements", matchId);
    const finalScore = validScore(match.finalScore);
    const noSettlement = isCancelledOrUnplayed(match) || (!finalScore && !settlement);

    if (!noSettlement && !settlement) {
      throw new Error(`Missing matchSettlements/${matchId}.`);
    }

    if (!noSettlement) {
      addSettlementUnits(dailyUnitsByPlayer, settlement);
    }

    matches.push({
      matchId,
      label: `${teamLabel(tournamentKey, match.homeTeamCode, match.homeTeamName)} - ${teamLabel(tournamentKey, match.awayTeamCode, match.awayTeamName)}`,
      finalScoreLabel: noSettlement ? NO_RESULT_LABEL : finalScore ? scoreLabel(finalScore) : NO_RESULT_LABEL,
      noSettlement,
      settlement
    });
  }

  const totalImpactByPlayer = await tournamentTotals(db, tournamentKey);
  const badgesByPlayer = await loadBadgeChipsByPlayer(db, playerIds, tournamentKey);

  return {
    ticketId,
    tournamentKey,
    ticketLabel: typeof ticket.label === "string" && ticket.label.trim() ? ticket.label.trim() : ticketId,
    summaryColumns: ["Denná zmena", "Celkový stav", "Bonus"],
    matches: matches.map(({ matchId, label, finalScoreLabel }) => ({ matchId, label, finalScoreLabel })),
    resultRow: {
      label: "Výsledok",
      cells: matches.map((match) => match.finalScoreLabel),
      dailyTotalLabel: "",
      totalLabel: "",
      bonusLabel: ""
    },
    rows: players.map((player) => {
      const cells = matches.map((match): DailyResultCell => {
        const impact = match.noSettlement
          ? { units: 0, exactHit: false }
          : impactsByPlayer(match.settlement).get(player.id) ?? { units: 0, exactHit: false };
        const bet = bets.get(`${player.id}\n${match.matchId}`) ?? null;

        return {
          matchId: match.matchId,
          betLabel: scoreLabel(bet),
          units: impact.units,
          moneyLabel: formatResultMoney(impact.units),
          exactHit: impact.exactHit,
          ...(match.noSettlement ? { statusLabel: NO_RESULT_LABEL } : {})
        };
      });
      const dailyUnits = dailyUnitsByPlayer.get(player.id) ?? 0;
      const dailyExactHits = cells.filter((cell) => cell.exactHit).length;
      const totalImpact = totalImpactByPlayer.get(player.id) ?? { units: dailyUnits, exactHits: dailyExactHits };
      const totalUnits = totalImpact.units;
      const bonus = totalImpact.exactHits;

      return {
        playerId: player.id,
        playerName: player.displayName,
        badges: badgesByPlayer.get(player.id) ?? [],
        cells,
        dailyUnits,
        totalUnits,
        dailyTotalLabel: formatResultMoney(dailyUnits),
        totalLabel: formatResultMoney(totalUnits),
        bonus,
        bonusLabel: String(bonus)
      };
    })
  };
}
