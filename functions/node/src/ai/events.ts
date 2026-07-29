import { buildFactsPacket, type FactsPacket, type FactsPacketInput } from "./factsPacket.js";
import { publishDailyResultBroadcast } from "./broadcast.js";
import { loadBadgeContextForTournament, playerMapFromPairs } from "./badgeContext.js";
import { buildRecapPrompt } from "./templates.js";
import { generateRecap, type RecapProvider } from "./recapGenerator.js";
import { buildDailyResultTable } from "../results/dailyResultTable.js";
import { teamDisplayLabel } from "../teams.js";
import {
  aiItemId,
  aiItemType,
  generationStatus,
  loadContinuityPackage,
  publicText,
  reserveAiCall,
  saveAiItem,
  saveAiLog,
  saveBroadcastCompatibilityItem,
  type AiEventType
} from "./aiItems.js";

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get(): Promise<SnapshotLike>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  get?(): Promise<{
    docs: Array<{
      id: string;
      data(): Record<string, unknown>;
    }>;
  }>;
  orderBy?(field: string, direction: "asc" | "desc"): {
    limit(count: number): {
      get(): Promise<{
        docs: Array<{
          id: string;
          data(): Record<string, unknown>;
        }>;
      }>;
    };
  };
};

export type AiEventDb = {
  collection(name: string): CollectionLike;
};

type Score = {
  home: number;
  away: number;
};

type GenerateEventInput = {
  db: AiEventDb;
  eventType: AiEventType;
  targetId: string;
  factsPacket: FactsPacket;
  contextSummary: string;
  provider?: RecapProvider;
  now: () => Date;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function validScore(value: unknown): Score | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  return Number.isInteger(data.home) && Number(data.home) >= 0 && Number.isInteger(data.away) && Number(data.away) >= 0
    ? { home: Number(data.home), away: Number(data.away) }
    : null;
}

function scoreLabel(score: Score): string {
  return `${score.home}:${score.away}`;
}

function moneyLabel(units: number): string {
  const normalized = Object.is(units, -0) ? 0 : units;
  const sign = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${sign}${(Math.abs(normalized) * 0.05).toFixed(2).replace(".", ",")} €`;
}

function playerName(id: string, data: Record<string, unknown> | null): string {
  return stringValue(data?.displayName) ?? id;
}

function teamLabel(match: Record<string, unknown>): string {
  const tournamentKey = stringValue(match.tournamentKey) ?? stringValue(match.tournamentId) ?? null;
  const home = teamDisplayLabel(
    tournamentKey,
    stringValue(match.homeTeamCode),
    stringValue(match.homeTeamName),
    { flag: false }
  );
  const away = teamDisplayLabel(
    tournamentKey,
    stringValue(match.awayTeamCode),
    stringValue(match.awayTeamName),
    { flag: false }
  );
  return `${home} - ${away}`;
}

async function optionalDoc(db: AiEventDb, collection: string, id: string): Promise<Record<string, unknown> | null> {
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() ?? {} : null;
}

async function requiredDoc(db: AiEventDb, collection: string, id: string): Promise<Record<string, unknown>> {
  const data = await optionalDoc(db, collection, id);
  if (!data) {
    throw new Error(`Missing ${collection}/${id}.`);
  }

  return data;
}

async function loadPlayers(db: AiEventDb, playerIds: string[]) {
  return Promise.all(
    playerIds.map(async (id) => ({
      id,
      name: playerName(id, await optionalDoc(db, "players", id))
    }))
  );
}

function settlementLines(data: Record<string, unknown> | null): Record<string, unknown>[] {
  return Array.isArray(data?.settlements)
    ? data.settlements.filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    : [];
}

function settlementPlayerId(line: Record<string, unknown>): string | undefined {
  return stringValue(line.playerId) ?? stringValue(line.player_id);
}

function settlementExactHit(line: Record<string, unknown>): boolean {
  return line.exactHit === true || line.exact_hit === true;
}

function settlementImpactNotes(
  settlement: Record<string, unknown> | null,
  playersById: Map<string, string>
): string[] {
  const lines = settlementLines(settlement);
  if (lines.length === 0) {
    return ["Match settlement ešte nie je dostupný."];
  }

  const winners = lines
    .filter((line) => numericValue(line.units) > 0)
    .map((line) => `${playersById.get(settlementPlayerId(line) ?? "") ?? settlementPlayerId(line)} ${moneyLabel(numericValue(line.units))}`)
    .filter((line) => !line.includes("undefined"));
  const losers = lines
    .filter((line) => numericValue(line.units) < 0)
    .map((line) => `${playersById.get(settlementPlayerId(line) ?? "") ?? settlementPlayerId(line)} ${moneyLabel(numericValue(line.units))}`)
    .filter((line) => !line.includes("undefined"));
  const exact = lines
    .filter(settlementExactHit)
    .map((line) => playersById.get(settlementPlayerId(line) ?? "") ?? settlementPlayerId(line))
    .filter((name): name is string => Boolean(name));

  return [
    winners.length ? `TipParta víťazi zápasu: ${winners.join(", ")}.` : "Presný zásah v tomto zápase nemal nikto.",
    losers.length ? `TipParta straty v zápase: ${losers.join(", ")}.` : "Nikto na zápase neskončil v mínuse.",
    exact.length ? `Presný výsledok trafili: ${exact.join(", ")}.` : "Presný výsledok netrafil nikto."
  ];
}

function settlementLeaderboardImpact(settlement: Record<string, unknown> | null) {
  return settlementLines(settlement)
    .filter((line) => settlementPlayerId(line) && numericValue(line.units) !== 0)
    .map((line) => ({
      playerId: settlementPlayerId(line) ?? "",
      balanceDeltaLabel: moneyLabel(numericValue(line.units)),
      exactHitsDelta: settlementExactHit(line) ? 1 : 0
    }));
}

function snapshotBets(snapshot: Record<string, unknown>, matchId?: string) {
  return Array.isArray(snapshot.bets)
    ? snapshot.bets
        .filter((bet): bet is Record<string, unknown> => Boolean(bet) && typeof bet === "object")
        .filter((bet) => !matchId || bet.matchId === matchId)
    : [];
}

function exactTips(snapshot: Record<string, unknown>, matchId: string, finalScore: Score) {
  return snapshotBets(snapshot, matchId)
    .filter((bet) => {
      const score = validScore(bet.score);
      return score?.home === finalScore.home && score.away === finalScore.away;
    })
    .map((bet) => ({
      playerId: stringValue(bet.playerId) ?? "",
      tip: scoreLabel(finalScore)
    }))
    .filter((tip) => tip.playerId);
}

function withKnownMatches(packet: FactsPacket, matchLabels: string[]): FactsPacket {
  return {
    ...packet,
    knownMatches: [...new Set([...packet.knownMatches, ...matchLabels])],
  };
}

async function buildTicketFacts(db: AiEventDb, ticketId: string): Promise<{ packet: FactsPacket; summary: string }> {
  const ticket = await requiredDoc(db, "tickets", ticketId);
  const snapshot = await requiredDoc(db, "ticketSnapshots", ticketId);
  const matchIds = stringArray(snapshot.matchIds);
  const playerIds = stringArray(snapshot.playerIds);
  const players = await loadPlayers(db, playerIds);
  const matches = await Promise.all(matchIds.map((matchId) => optionalDoc(db, "matches", matchId)));
  const matchLabels = matches.filter((match): match is Record<string, unknown> => match !== null).map(teamLabel);
  const tournamentKey = stringValue(ticket.tournamentKey) ?? stringValue(ticket.tournamentId) ?? null;
  const badgeContext = await loadBadgeContextForTournament({
    db,
    tournamentKey,
    playersById: playerMapFromPairs(players)
  });
  const ticketLabel = stringValue(ticket.label) ?? ticketId;
  const dateLabel = stringValue(ticket.dateLabel) ?? stringValue(ticket.officialMatchdayKey) ?? ticketLabel;
  const factsInput: FactsPacketInput = {
    ticket: {
      id: ticketId,
      dayKey: stringValue(ticket.officialMatchdayKey) ?? ticketId,
      label: ticketLabel,
      dateLabel
    },
    players,
    badgeContext,
    contextNotes: [
      `Tiket ${ticketLabel} bol uzamknuty.`,
      `Pocet zapasov: ${matchIds.length}.`,
      `Pocet hracov v snapshote: ${playerIds.length}.`,
      matchLabels.length ? `Zapasy v tikete: ${matchLabels.join("; ")}.` : "Tiket nema nacitane zapasy."
    ]
  };

  return {
    packet: withKnownMatches(buildFactsPacket(factsInput), matchLabels),
    summary: `Zamknutie tiketu ${ticketLabel}: ${matchIds.length} zapasov, ${playerIds.length} hracov.`
  };
}

async function buildMatchFacts(db: AiEventDb, matchId: string): Promise<{ packet: FactsPacket; summary: string }> {
  const match = await requiredDoc(db, "matches", matchId);
  const ticketId = stringValue(match.ticketId);
  const ticket = ticketId ? await optionalDoc(db, "tickets", ticketId) : null;
  const snapshot = ticketId ? await optionalDoc(db, "ticketSnapshots", ticketId) : null;
  const finalScore = validScore(match.finalScore);
  const matchLabel = teamLabel(match);
  const playerIds = snapshot ? stringArray(snapshot.playerIds) : [];
  const players = await loadPlayers(db, playerIds);
  const playersById = playerMapFromPairs(players);
  const tournamentKey =
    stringValue(match.tournamentKey) ??
    stringValue(match.tournamentId) ??
    stringValue(ticket?.tournamentKey) ??
    stringValue(ticket?.tournamentId) ??
    null;
  const settlement = await optionalDoc(db, "matchSettlements", matchId);
  const badgeContext = await loadBadgeContextForTournament({
    db,
    tournamentKey,
    playersById
  });
  const factsInput: FactsPacketInput = {
    ticket: {
      id: ticketId ?? matchId,
      dayKey: stringValue(ticket?.officialMatchdayKey) ?? ticketId ?? matchId,
      label: stringValue(ticket?.label) ?? ticketId ?? "Tiket",
      dateLabel: stringValue(ticket?.dateLabel) ?? stringValue(ticket?.officialMatchdayKey) ?? ticketId ?? "Tiket"
    },
    players,
    badgeContext,
    contextNotes: [
      `Prisiel finalny vysledok zapasu ${matchLabel}.`,
      finalScore ? `Finalne skore: ${scoreLabel(finalScore)}.` : "Finalne skore chyba.",
      "Opisuj iba dosah vysledku na TipParta hru.",
      ...settlementImpactNotes(settlement, playersById)
    ],
    matchResults: finalScore
      ? [
          {
            matchId,
            matchLabel,
            finalScore: scoreLabel(finalScore),
            notableExactTips: snapshot ? exactTips(snapshot, matchId, finalScore) : []
          }
        ]
      : []
    ,
    leaderboardImpact: settlementLeaderboardImpact(settlement).map((impact) => ({
      ...impact,
      reasonMatchId: matchId,
      reasonMatchLabel: matchLabel
    }))
  };

  return {
    packet: withKnownMatches(buildFactsPacket(factsInput), [matchLabel]),
    summary: `Vysledok ${matchLabel}: ${finalScore ? scoreLabel(finalScore) : "bez skore"}.`
  };
}

function promptPreview(text: string): string {
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

async function generateEventAi({
  db,
  eventType,
  targetId,
  factsPacket,
  contextSummary,
  provider,
  now
}: GenerateEventInput): Promise<void> {
  const createdAt = now().toISOString();
  const id = aiItemId(eventType, targetId);
  const continuity = await loadContinuityPackage(db);
  const packet: FactsPacket = {
    ...factsPacket,
    continuity
  };
  const prompt = buildRecapPrompt(packet, eventType);

  if (!provider) {
    await saveAiLog(db, {
      id,
      eventType,
      targetId,
      status: "skipped",
      contextSummary,
      contextPackage: packet,
      prompt,
      promptPreview: promptPreview(prompt.user),
      outputPreview: "",
      rejectionReason: "AI provider disabled or missing.",
      createdAt,
      updatedAt: createdAt
    });
    return;
  }

  const reserved = await reserveAiCall(db, now());
  if (!reserved) {
    await saveAiLog(db, {
      id,
      eventType,
      targetId,
      status: "skippedByCap",
      contextSummary,
      contextPackage: packet,
      prompt,
      promptPreview: promptPreview(prompt.user),
      outputPreview: "",
      rejectionReason: "Daily AI call limit reached.",
      createdAt,
      updatedAt: createdAt
    });
    return;
  }

  const generation = await generateRecap(packet, { provider, eventType });
  const status = generationStatus(generation);
  const text = publicText(generation);
  const rejectionReason = "rejectionReason" in generation ? generation.rejectionReason : undefined;
  const item = {
    id,
    type: aiItemType(eventType),
    eventType,
    targetId,
    status,
    text,
    aiText: generation.aiText,
    fallbackText: generation.fallbackText,
    contextSummary,
    factsPacket: packet,
    playersMentioned:
      "playersMentioned" in generation && generation.playersMentioned
        ? generation.playersMentioned
        : packet.knownPlayers.filter((name) => text.includes(name)),
    ...(rejectionReason ? { rejectionReason } : {}),
    publishedAt: status === "published" ? createdAt : null,
    createdAt,
    updatedAt: createdAt,
    audience: "public"
  };

  await saveAiItem(db, item);

  if (status === "published") {
    await saveBroadcastCompatibilityItem(db, item);
  }

  await saveAiLog(db, {
    id,
    eventType,
    targetId,
    status,
    contextSummary,
    contextPackage: packet,
    prompt,
    promptPreview: promptPreview(prompt.user),
    output: {
      aiText: generation.aiText,
      fallbackText: generation.fallbackText,
      rejectionReason: rejectionReason ?? null
    },
    outputPreview: text || rejectionReason || generation.fallbackText,
    rejectionReason: rejectionReason ?? null,
    createdAt,
    updatedAt: createdAt
  });
}

export async function enqueueTicketLockedAi({
  db,
  ticketId,
  provider,
  now = () => new Date()
}: {
  db: AiEventDb;
  ticketId: string;
  provider?: RecapProvider;
  now?: () => Date;
}): Promise<void> {
  try {
    const { packet, summary } = await buildTicketFacts(db, ticketId);
    await generateEventAi({
      db,
      eventType: "ticket_lock",
      targetId: ticketId,
      factsPacket: packet,
      contextSummary: summary,
      provider,
      now
    });
  } catch (error) {
    const nowIso = now().toISOString();
    await saveAiLog(db, {
      id: aiItemId("ticket_lock", ticketId),
      eventType: "ticket_lock",
      targetId: ticketId,
      status: "failedGeneration",
      contextSummary: "Ticket lock AI context failed.",
      promptPreview: "",
      outputPreview: "",
      rejectionReason: error instanceof Error ? error.message : String(error),
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }
}

export async function enqueueMatchSettledAi({
  db,
  matchId,
  provider,
  now = () => new Date()
}: {
  db: AiEventDb;
  matchId: string;
  provider?: RecapProvider;
  now?: () => Date;
}): Promise<void> {
  try {
    const { packet, summary } = await buildMatchFacts(db, matchId);
    await generateEventAi({
      db,
      eventType: "match_result",
      targetId: matchId,
      factsPacket: packet,
      contextSummary: summary,
      provider,
      now
    });
  } catch (error) {
    const nowIso = now().toISOString();
    await saveAiLog(db, {
      id: aiItemId("match_result", matchId),
      eventType: "match_result",
      targetId: matchId,
      status: "failedGeneration",
      contextSummary: "Match result AI context failed.",
      promptPreview: "",
      outputPreview: "",
      rejectionReason: error instanceof Error ? error.message : String(error),
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }
}

export async function enqueueDailySettledAi({
  db,
  ticketId,
  provider,
  now = () => new Date()
}: {
  db: AiEventDb;
  ticketId: string;
  provider?: RecapProvider;
  now?: () => Date;
}): Promise<void> {
  try {
    const ticket = await requiredDoc(db, "tickets", ticketId);
    const table = await buildDailyResultTable({ db: db as never, ticketId });
    await publishDailyResultBroadcast({
      db,
      table,
      dayKey: stringValue(ticket.officialMatchdayKey) ?? ticketId,
      dateLabel: stringValue(ticket.dateLabel) ?? stringValue(ticket.officialMatchdayKey) ?? table.ticketLabel,
      provider,
      now
    });
  } catch (error) {
    const nowIso = now().toISOString();
    await saveAiLog(db, {
      id: aiItemId("daily_result", ticketId),
      eventType: "daily_result",
      targetId: ticketId,
      status: "failedGeneration",
      contextSummary: "Daily result AI context failed.",
      promptPreview: "",
      outputPreview: "",
      rejectionReason: error instanceof Error ? error.message : String(error),
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }
}
