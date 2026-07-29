import type { RecapGenerationResult } from "./recapGenerator.js";

export type AiItemStatus = "published" | "failedValidation" | "failedGeneration" | "skippedByCap" | "skipped";
export type AiItemType = "ticker" | "dailyRecap";
export type AiEventType = "ticket_lock" | "match_result" | "daily_result";

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get?(): Promise<SnapshotLike>;
  set?(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

type QuerySnapshotLike = {
  docs: Array<{
    id: string;
    data(): Record<string, unknown>;
  }>;
};

type CollectionLike = {
  doc(id: string): DocRefLike;
  get?(): Promise<QuerySnapshotLike>;
  orderBy?(field: string, direction: "asc" | "desc"): {
    limit(count: number): {
      get(): Promise<QuerySnapshotLike>;
    };
  };
};

export type AiStoreDb = {
  collection(name: string): CollectionLike;
};

export type AiContinuityPackage = {
  previousLines: string[];
  recentlyMentionedPlayers: string[];
};

export type AiLogRow = {
  id: string;
  eventType: string;
  targetId: string;
  status: string;
  contextSummary: string;
  contextPreview: string;
  promptPreview: string;
  outputPreview: string;
  rejectionReason: string | null;
  createdAt: string;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonPreview(value: unknown, maxLength = 1600): string {
  if (value === null || value === undefined) {
    return "";
  }

  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return "";
  }
}

function cleanPublishedLine(value: unknown): string {
  const text = stringValue(value).trim();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const data = parsed as { text?: unknown; tickerLine?: unknown };
      return stringValue(data.text) || stringValue(data.tickerLine);
    }
  } catch {
    // Older plain text rows are valid continuity input.
  }

  return text.startsWith("{") ? "" : text;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return null as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : stripUndefinedDeep(item))) as T;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) {
      continue;
    }
    cleaned[key] = stripUndefinedDeep(item);
  }

  return cleaned as T;
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

export function aiItemId(eventType: AiEventType, targetId: string): string {
  if (eventType === "daily_result") {
    return `daily-${targetId}`;
  }

  if (eventType === "match_result") {
    return `ticker-match-${targetId}`;
  }

  return `ticker-lock-${targetId}`;
}

export function aiItemType(eventType: AiEventType): AiItemType {
  return eventType === "daily_result" ? "dailyRecap" : "ticker";
}

export function generationStatus(generation: RecapGenerationResult): AiItemStatus {
  if (generation.status === "accepted") {
    return "published";
  }

  if (generation.status === "rejected") {
    return "failedValidation";
  }

  return "failedGeneration";
}

export function publicText(generation: RecapGenerationResult): string {
  return generation.status === "accepted" && generation.aiText ? generation.aiText : "";
}

export function aiLimit(): number {
  const fromEnv = Number(process.env.AI_DAILY_CALL_LIMIT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.floor(fromEnv) : 50;
}

export async function reserveAiCall(db: AiStoreDb, now: Date, limit = aiLimit()): Promise<boolean> {
  const dayKey = usageDayKey(now);
  const ref = db.collection("aiUsage").doc(dayKey);

  if (typeof ref.get !== "function") {
    if (typeof ref.set === "function") {
      await ref.set({ dayKey, count: 1, limit, updatedAt: now.toISOString() }, { merge: true });
    }
    return true;
  }

  const snapshot = await ref.get();
  const data = snapshot.exists ? snapshot.data() ?? {} : {};
  const currentCount = typeof data.count === "number" && Number.isFinite(data.count) ? data.count : 0;

  if (currentCount >= limit) {
    return false;
  }

  if (typeof ref.set === "function") {
    await ref.set({ dayKey, count: currentCount + 1, limit, updatedAt: now.toISOString() }, { merge: true });
  }
  return true;
}

export async function loadContinuityPackage(db: AiStoreDb, limit = 6): Promise<AiContinuityPackage> {
  const collection = db.collection("aiItems");

  if (typeof collection.orderBy !== "function") {
    return { previousLines: [], recentlyMentionedPlayers: [] };
  }

  const snap = await collection.orderBy("publishedAt", "desc").limit(limit).get();
  const published = snap.docs
    .map((doc) => doc.data())
    .filter((data) => data.status === "published");

  return {
    previousLines: published.map((data) => cleanPublishedLine(data.text)).filter(Boolean).slice(0, limit),
    recentlyMentionedPlayers: [
      ...new Set(published.flatMap((data) => stringArray(data.playersMentioned)))
    ].slice(0, 10)
  };
}

export async function saveAiItem(
  db: AiStoreDb,
  item: Record<string, unknown>
): Promise<void> {
  const id = stringValue(item.id);
  if (!id) {
    throw new Error("AI item requires an id.");
  }

  const ref = db.collection("aiItems").doc(id);
  if (typeof ref.set === "function") {
    await ref.set(stripUndefinedDeep(item), { merge: true });
  }
}

export async function saveBroadcastCompatibilityItem(
  db: AiStoreDb,
  item: Record<string, unknown>
): Promise<void> {
  const id = stringValue(item.id);
  if (!id) {
    return;
  }

  const ref = db.collection("broadcastItems").doc(id);
  if (typeof ref.set === "function") {
    await ref.set(stripUndefinedDeep(item), { merge: true });
  }
}

export async function loadPublishedAiText(db: AiStoreDb, id: string): Promise<string | undefined> {
  const ref = db.collection("aiItems").doc(id);
  if (typeof ref.get !== "function") {
    return undefined;
  }

  const snap = await ref.get();
  const data = snap.exists ? snap.data() ?? {} : {};
  return data.status === "published" ? stringValue(data.text) || undefined : undefined;
}

export async function saveAiLog(db: AiStoreDb, log: Record<string, unknown>): Promise<void> {
  const id = stringValue(log.id);
  if (!id) {
    throw new Error("AI log requires an id.");
  }

  const ref = db.collection("aiLogs").doc(id);
  if (typeof ref.set === "function") {
    await ref.set(stripUndefinedDeep(log), { merge: true });
  }
}

export async function loadRecentAiLogs(db: AiStoreDb, limit = 8): Promise<AiLogRow[]> {
  const collection = db.collection("aiLogs");
  if (typeof collection.orderBy !== "function") {
    return [];
  }

  const snap = await collection.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: stringValue(data.id) || doc.id,
      eventType: stringValue(data.eventType),
      targetId: stringValue(data.targetId),
      status: stringValue(data.status),
      contextSummary: stringValue(data.contextSummary),
      contextPreview: stringValue(data.contextPreview) || jsonPreview(data.contextPackage),
      promptPreview: stringValue(data.promptPreview) || jsonPreview(data.prompt, 1200),
      outputPreview: stringValue(data.outputPreview) || jsonPreview(data.output, 1200),
      rejectionReason: stringValue(data.rejectionReason) || null,
      createdAt: stringValue(data.createdAt)
    };
  });
}
