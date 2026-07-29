import type { BadgeContextInput } from "./factsPacket.js";

type SnapshotLike = {
  exists: boolean;
  id?: string;
  data(): Record<string, unknown> | undefined;
};

type DocRefLike = {
  get?(): Promise<SnapshotLike>;
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
};

export type BadgeContextDb = {
  collection(name: string): CollectionLike;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function badgeBelongsToTournament(data: Record<string, unknown>, tournamentKey: string | null): boolean {
  if (!tournamentKey) {
    return true;
  }

  const badgeTournament = data.tournamentKey ?? data.tournamentId ?? data.allowedTournamentId;
  return badgeTournament === tournamentKey || badgeTournament === undefined || badgeTournament === null;
}

function playerIdFrom(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return optionalString(data.playerId) ?? optionalString(data.player_id);
  }

  return undefined;
}

function leaderPlayerId(data: Record<string, unknown>): string | undefined {
  return playerIdFrom(data.leader) ?? optionalString(data.leaderPlayerId) ?? optionalString(data.leader_player_id);
}

function followerPlayerIds(data: Record<string, unknown>): string[] {
  const followers = data.followers;
  if (!Array.isArray(followers)) {
    return [];
  }

  return followers.map(playerIdFrom).filter((playerId): playerId is string => Boolean(playerId));
}

function indicatorLabel(indicator: unknown): string | undefined {
  if (typeof indicator === "string" && indicator.trim().length > 0) {
    return indicator.trim();
  }

  if (!indicator || typeof indicator !== "object") {
    return undefined;
  }

  const data = indicator as Record<string, unknown>;
  const label = optionalString(data.label);
  const value = optionalString(data.value);

  if (label && value) {
    return `${label}: ${value}`;
  }

  return label ?? value;
}

function indicatorLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(indicatorLabel).filter((indicator): indicator is string => Boolean(indicator));
}

async function playerDisplayName(
  db: BadgeContextDb,
  playerId: string,
  playersById: Map<string, string>
): Promise<string> {
  const known = playersById.get(playerId);
  if (known) {
    return known;
  }

  const ref = db.collection("players").doc(playerId);
  if (typeof ref.get !== "function") {
    return playerId;
  }

  const snap = await ref.get();
  const data = snap.exists ? snap.data() ?? {} : {};
  return optionalString(data.displayName) ?? optionalString(data.name) ?? playerId;
}

function badgeExplainer(kind: string, caption?: string): string {
  const base =
    kind === "bet"
      ? "Tipérsky odznak: vzniká z uzamknutých tipov a opisuje štýl tipovania, nie výsledkovú výplatu."
      : "Výsledkový odznak: vzniká z už spočítaných výsledkov, ziskov, strát, presných zásahov a denných sérií.";

  return caption ? `${base} Princíp: ${caption}` : base;
}

export async function loadBadgeContextForTournament({
  db,
  tournamentKey,
  playersById = new Map()
}: {
  db: BadgeContextDb;
  tournamentKey: string | null;
  playersById?: Map<string, string>;
}): Promise<BadgeContextInput[]> {
  const collection = db.collection("badges");

  if (typeof collection.get !== "function") {
    return [];
  }

  const snap = await collection.get();
  const badges: BadgeContextInput[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!badgeBelongsToTournament(data, tournamentKey)) {
      continue;
    }

    const badgeName = optionalString(data.title) ?? optionalString(data.name) ?? doc.id;
    const badgeKey = optionalString(data.badgeKey) ?? doc.id;
    const kind = optionalString(data.kind) ?? "result";
    const leaderId = leaderPlayerId(data);
    const followerIds = followerPlayerIds(data);
    const caption = optionalString(data.caption) ?? optionalString(data.explanation);
    const indicators = indicatorLabels(data.indicators);

    for (const playerId of [leaderId, ...followerIds].filter((id): id is string => Boolean(id))) {
      if (!playersById.has(playerId)) {
        playersById.set(playerId, await playerDisplayName(db, playerId, playersById));
      }
    }

    badges.push({
      badgeKey,
      badgeName,
      kind,
      emoji: optionalString(data.emoji),
      caption,
      leaderId,
      followerIds,
      indicators,
      explainer: badgeExplainer(kind, caption)
    });
  }

  return badges.sort((left, right) => {
    const kindOrder = left.kind === right.kind ? 0 : left.kind === "result" ? -1 : 1;
    return kindOrder || left.badgeName.localeCompare(right.badgeName, "sk");
  });
}

export function playerMapFromPairs(players: Array<{ id: string; name: string }>): Map<string, string> {
  return new Map(players.map((player) => [player.id, player.name]));
}
