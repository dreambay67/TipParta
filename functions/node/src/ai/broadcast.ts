import { buildFactsPacket, type FactsPacket, type FactsPacketInput } from "./factsPacket.js";
import { loadBadgeContextForTournament, playerMapFromPairs } from "./badgeContext.js";
import {
  generateRecap,
  type RecapGenerationResult,
  type RecapProvider
} from "./recapGenerator.js";
import type { DailyResultRow, DailyResultTable } from "../results/dailyResultTable.js";
import {
  aiItemId,
  loadContinuityPackage,
  saveAiItem,
  saveAiLog,
  saveBroadcastCompatibilityItem,
  stripUndefinedDeep
} from "./aiItems.js";
import { buildRecapPrompt } from "./templates.js";

export type BroadcastEventType = "daily_result" | "match_result" | "ticket_lock";

export type BroadcastStatus = RecapGenerationResult["status"];

export type BroadcastItemPayload = {
  id: string;
  eventType: BroadcastEventType;
  targetId: string;
  status: BroadcastStatus;
  text: string;
  aiText: string | null;
  fallbackText: string;
  rejectionReason?: string;
  factsPacket: FactsPacket;
  publishedAt: string;
  updatedAt: string;
  audience: "public";
};

type BroadcastDocRef = {
  get?(): Promise<{
    exists: boolean;
    data(): Record<string, unknown> | undefined;
  }>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type BroadcastDb = {
  collection(name: string): {
    doc(id: string): BroadcastDocRef;
  };
};

type DailyResultFactsInput = {
  table: DailyResultTable;
  dayKey: string;
  dateLabel: string;
  badgeContext?: FactsPacketInput["badgeContext"];
};

type PublishDailyResultBroadcastInput = DailyResultFactsInput & {
  db: BroadcastDb;
  provider?: RecapProvider;
  now?: () => Date;
  dailyAiLimit?: number;
};

const DEFAULT_DAILY_AI_LIMIT = 50;

function rowValue(row: DailyResultRow): number {
  return typeof row.dailyUnits === "number" && Number.isFinite(row.dailyUnits)
    ? row.dailyUnits
    : 0;
}

function bestRow(rows: DailyResultRow[]): DailyResultRow | undefined {
  return [...rows].sort((left, right) => rowValue(right) - rowValue(left) || left.playerName.localeCompare(right.playerName))[0];
}

function worstRow(rows: DailyResultRow[]): DailyResultRow | undefined {
  return [...rows].sort((left, right) => rowValue(left) - rowValue(right) || left.playerName.localeCompare(right.playerName))[0];
}

function exactTipsForMatch(table: DailyResultTable, matchId: string) {
  return table.rows.flatMap((row) =>
    row.cells
      .filter((cell) => cell.matchId === matchId && cell.exactHit)
      .map((cell) => ({
        playerId: row.playerId,
        tip: cell.betLabel
      }))
  );
}

function exactBets(table: DailyResultTable) {
  const matchesById = new Map(table.matches.map((match) => [match.matchId, match]));

  return table.rows.flatMap((row) =>
    row.cells
      .filter((cell) => cell.exactHit)
      .map((cell) => ({
        playerId: row.playerId,
        matchId: cell.matchId,
        matchLabel: matchesById.get(cell.matchId)?.label ?? cell.matchId,
        tip: cell.betLabel
      }))
  );
}

function topRows(rows: DailyResultRow[], direction: "best" | "worst", count = 3): DailyResultRow[] {
  return [...rows]
    .sort((left, right) => {
      const byUnits = direction === "best" ? rowValue(right) - rowValue(left) : rowValue(left) - rowValue(right);
      return byUnits || left.playerName.localeCompare(right.playerName, "sk");
    })
    .slice(0, count);
}

function dailyResultContextNotes(table: DailyResultTable): string[] {
  const best = topRows(table.rows, "best")
    .map((row) => `${row.playerName} ${row.dailyTotalLabel}`)
    .join(", ");
  const worst = topRows(table.rows, "worst")
    .map((row) => `${row.playerName} ${row.dailyTotalLabel}`)
    .join(", ");
  const exactLeaders = [...table.rows]
    .map((row) => ({
      playerName: row.playerName,
      exactHits: row.cells.filter((cell) => cell.exactHit).length
    }))
    .filter((row) => row.exactHits > 0)
    .sort((left, right) => right.exactHits - left.exactHits || left.playerName.localeCompare(right.playerName, "sk"))
    .slice(0, 3)
    .map((row) => `${row.playerName} ${row.exactHits}x presne`)
    .join(", ");

  return [
    best ? `Najväčšie denné zisky: ${best}.` : "Denný tiket nemal kladného víťaza.",
    worst ? `Najväčšie denné straty: ${worst}.` : "Denný tiket nemal mínusového hráča.",
    exactLeaders ? `Presné zásahy dňa: ${exactLeaders}.` : "Dnes nikto netrafil presný výsledok.",
    `Aktuálny turnajový bonus v tabuľke je celkový počet presných zásahov, nie iba denná zmena.`
  ];
}

export function buildDailyResultFactsInput({
  table,
  dayKey,
  dateLabel,
  badgeContext
}: DailyResultFactsInput): FactsPacketInput {
  const winner = bestRow(table.rows);
  const loser = worstRow(table.rows);

  return {
    ticket: {
      id: table.ticketId,
      dayKey,
      label: table.ticketLabel,
      dateLabel
    },
    players: table.rows.map((row) => ({
      id: row.playerId,
      name: row.playerName
    })),
    badgeContext,
    contextNotes: dailyResultContextNotes(table),
    matchResults: table.matches.map((match) => ({
      matchId: match.matchId,
      matchLabel: match.label,
      finalScore: match.finalScoreLabel,
      notableExactTips: exactTipsForMatch(table, match.matchId)
    })),
    exactBets: exactBets(table),
    ...(winner
      ? {
          dailyWinner: {
            playerId: winner.playerId,
            balanceDeltaLabel: winner.dailyTotalLabel,
            reason: "najvyššia denná zmena"
          }
        }
      : {}),
    ...(loser
      ? {
          dailyLoser: {
            playerId: loser.playerId,
            balanceDeltaLabel: loser.dailyTotalLabel,
            reason: "najnižšia denná zmena"
          }
        }
      : {})
  };
}

function usageDayKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? now.getUTCFullYear().toString();
  const month = parts.find((part) => part.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value ?? String(now.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function usageLimit(input?: number): number {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.floor(input);
  }

  const fromEnv = Number(process.env.AI_DAILY_CALL_LIMIT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.floor(fromEnv) : DEFAULT_DAILY_AI_LIMIT;
}

async function reserveAiCall(db: BroadcastDb, now: Date, limit: number): Promise<boolean> {
  const dayKey = usageDayKey(now);
  const ref = db.collection("aiUsage").doc(dayKey);

  if (typeof ref.get !== "function") {
    return true;
  }

  const snapshot = await ref.get();
  const data = snapshot.exists ? snapshot.data() ?? {} : {};
  const currentCount = typeof data.count === "number" && Number.isFinite(data.count) ? data.count : 0;

  if (currentCount >= limit) {
    return false;
  }

  await ref.set(
    {
      dayKey,
      count: currentCount + 1,
      limit,
      updatedAt: now.toISOString()
    },
    { merge: true }
  );

  return true;
}

export async function publishDailyResultBroadcast({
  db,
  table,
  dayKey,
  dateLabel,
  provider,
  now = () => new Date(),
  dailyAiLimit
}: PublishDailyResultBroadcastInput): Promise<BroadcastItemPayload> {
  const badgeContext = await loadBadgeContextForTournament({
    db: db as never,
    tournamentKey: table.tournamentKey,
    playersById: playerMapFromPairs(table.rows.map((row) => ({ id: row.playerId, name: row.playerName })))
  });
  const baseFactsPacket = buildFactsPacket(buildDailyResultFactsInput({ table, dayKey, dateLabel, badgeContext }));
  const nowDate = now();
  const continuity = await loadContinuityPackage(db as never);
  const factsPacket: FactsPacket = {
    ...baseFactsPacket,
    contextNotes: [
      ...(baseFactsPacket.contextNotes ?? []),
      `Denný tiket ${table.ticketLabel} je celý vyhodnotený.`,
      `Počet zápasov vo výsledkovej tabuľke: ${table.matches.length}.`,
      `Počet hráčov vo výsledkovej tabuľke: ${table.rows.length}.`
    ],
    continuity
  };
  const prompt = buildRecapPrompt(factsPacket, "daily_result");
  const providerWithinBudget =
    provider && (await reserveAiCall(db, nowDate, usageLimit(dailyAiLimit))) ? provider : undefined;
  const generation = await generateRecap(factsPacket, { provider: providerWithinBudget, eventType: "daily_result" });
  const publishedAt = nowDate.toISOString();
  const id = `dailyResult_${table.ticketId}`;
  const rejectionReason = "rejectionReason" in generation ? generation.rejectionReason : undefined;
  const publicText = generation.status === "accepted" && generation.aiText ? generation.aiText : "";
  const payload: BroadcastItemPayload = {
    id,
    eventType: "daily_result",
    targetId: table.ticketId,
    status: generation.status,
    text: publicText,
    aiText: generation.aiText,
    fallbackText: generation.fallbackText,
    ...(rejectionReason ? { rejectionReason } : {}),
    factsPacket,
    publishedAt,
    updatedAt: publishedAt,
    audience: "public"
  };

  await db.collection("broadcastItems").doc(id).set(stripUndefinedDeep(payload), { merge: true });

  if (generation.status === "accepted" && generation.aiText) {
    await saveAiItem(db as never,
      {
        id: aiItemId("daily_result", table.ticketId),
        type: "dailyRecap",
        status: "published",
        eventType: "daily_result",
        targetId: table.ticketId,
        text: generation.aiText,
        playersMentioned:
          "playersMentioned" in generation && generation.playersMentioned
            ? generation.playersMentioned
            : factsPacket.knownPlayers.filter((name) => generation.aiText?.includes(name)),
        factsPacket,
        publishedAt,
        updatedAt: publishedAt,
        audience: "public"
      },
    );
    await saveBroadcastCompatibilityItem(db as never, {
      ...payload,
      id: aiItemId("daily_result", table.ticketId),
      type: "dailyRecap",
      status: "published"
    });
  }

  await saveAiLog(db as never, {
    id: aiItemId("daily_result", table.ticketId),
    eventType: "daily_result",
    targetId: table.ticketId,
    status: generation.status === "accepted" ? "published" : generation.status,
    contextSummary: `Denný výsledok ${table.ticketLabel}: ${table.matches.length} zápasov, ${table.rows.length} hráčov.`,
    contextPackage: factsPacket,
    prompt,
    promptPreview: prompt.user.length > 600 ? `${prompt.user.slice(0, 600)}...` : prompt.user,
    output: {
      aiText: generation.aiText,
      fallbackText: generation.fallbackText,
      rejectionReason: rejectionReason ?? null
    },
    outputPreview: publicText || rejectionReason || generation.fallbackText,
    rejectionReason: rejectionReason ?? null,
    createdAt: publishedAt,
    updatedAt: publishedAt
  });

  return payload;
}
