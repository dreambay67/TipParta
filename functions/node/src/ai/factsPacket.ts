export type FactsPacketTicketInput = {
  id: string;
  dayKey: string;
  label: string;
  dateLabel: string;
};

export type FactsPacketPlayerInput = {
  id: string;
  name: string;
  aliases?: string[];
};

export type ChangedBadgeInput = {
  badgeName: string;
  newHolderId: string;
  previousHolderId?: string | null;
  indicators?: string[];
  reason?: string;
  reasonMatchId?: string;
  reasonMatchLabel?: string;
};

export type MatchExactTipInput = {
  playerId: string;
  tip: string;
};

export type MatchResultReasonInput = {
  matchId: string;
  matchLabel: string;
  finalScore: string;
  notableExactTips?: MatchExactTipInput[];
};

export type LeaderboardImpactInput = {
  playerId: string;
  previousRank?: number;
  newRank?: number;
  balanceDeltaLabel: string;
  exactHitsDelta?: number;
  reasonMatchId?: string;
  reasonMatchLabel?: string;
};

export type ExactBetInput = {
  playerId: string;
  matchId?: string;
  matchLabel: string;
  tip: string;
};

export type DailyExtremeInput = {
  playerId: string;
  balanceDeltaLabel: string;
  reason?: string;
};

export type BadgeContextInput = {
  badgeKey: string;
  badgeName: string;
  kind?: "result" | "bet" | string;
  emoji?: string;
  caption?: string;
  leaderId?: string;
  followerIds?: string[];
  indicators?: string[];
  explainer?: string;
};

export type FactsPacketInput = {
  ticket: FactsPacketTicketInput;
  players: FactsPacketPlayerInput[];
  contextNotes?: string[];
  changedBadges?: ChangedBadgeInput[];
  matchResults?: MatchResultReasonInput[];
  leaderboardImpact?: LeaderboardImpactInput[];
  exactBets?: ExactBetInput[];
  dailyWinner?: DailyExtremeInput;
  dailyLoser?: DailyExtremeInput;
  badgeContext?: BadgeContextInput[];
  storyFacts?: string[];
};

export type ChangedBadgeFact = {
  badgeName: string;
  newHolderName: string;
  previousHolderName?: string;
  indicators: string[];
  reason?: string;
  reasonMatchLabel?: string;
};

export type MatchResultReasonFact = {
  matchLabel: string;
  finalScore: string;
  notableExactTips: Array<{
    playerName: string;
    tip: string;
  }>;
};

export type LeaderboardImpactFact = {
  playerName: string;
  previousRank?: number;
  newRank?: number;
  balanceDeltaLabel: string;
  exactHitsDelta: number;
  reasonMatchLabel?: string;
};

export type ExactBetFact = {
  playerName: string;
  matchLabel: string;
  tip: string;
};

export type DailyExtremeFact = {
  playerName: string;
  balanceDeltaLabel: string;
  reason?: string;
};

export type BadgeContextFact = {
  badgeKey: string;
  badgeName: string;
  kind: string;
  emoji?: string;
  caption?: string;
  leaderName?: string;
  followerNames: string[];
  indicators: string[];
  explainer?: string;
};

export type FactsPacket = {
  ticket: FactsPacketTicketInput;
  contextNotes?: string[];
  continuity?: {
    previousLines: string[];
    recentlyMentionedPlayers: string[];
  };
  changedBadges: ChangedBadgeFact[];
  matchResults: MatchResultReasonFact[];
  leaderboardImpact: LeaderboardImpactFact[];
  exactBets: ExactBetFact[];
  dailyWinner?: DailyExtremeFact;
  dailyLoser?: DailyExtremeFact;
  badgeContext: BadgeContextFact[];
  storyFacts: string[];
  matchCount: number;
  knownPlayers: string[];
  knownPlayerAliases: string[];
  knownMatches: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function playerNameById(players: FactsPacketPlayerInput[]): Map<string, string> {
  return new Map(players.map((player) => [player.id, player.name]));
}

function resolvePlayerName(playersById: Map<string, string>, playerId: string): string {
  return playersById.get(playerId) ?? playerId;
}

function matchLabelById(matches: MatchResultReasonInput[]): Map<string, string> {
  return new Map(matches.map((match) => [match.matchId, match.matchLabel]));
}

function resolveMatchLabel(
  matchesById: Map<string, string>,
  matchId?: string,
  explicitLabel?: string
): string | undefined {
  if (explicitLabel) {
    return explicitLabel;
  }

  return matchId ? matchesById.get(matchId) : undefined;
}

export function buildFactsPacket(input: FactsPacketInput): FactsPacket {
  const playersById = playerNameById(input.players);
  const matchInputs = input.matchResults ?? [];
  const matchesById = matchLabelById(matchInputs);

  const matchResults = matchInputs.map((match) => ({
    matchLabel: match.matchLabel,
    finalScore: match.finalScore,
    notableExactTips: (match.notableExactTips ?? []).map((tip) => ({
      playerName: resolvePlayerName(playersById, tip.playerId),
      tip: tip.tip
    }))
  }));

  const changedBadges = (input.changedBadges ?? []).map((badge) => ({
    badgeName: badge.badgeName,
    newHolderName: resolvePlayerName(playersById, badge.newHolderId),
    previousHolderName: badge.previousHolderId
      ? resolvePlayerName(playersById, badge.previousHolderId)
      : undefined,
    indicators: badge.indicators ?? [],
    reason: badge.reason,
    reasonMatchLabel: resolveMatchLabel(matchesById, badge.reasonMatchId, badge.reasonMatchLabel)
  }));

  const leaderboardImpact = (input.leaderboardImpact ?? []).map((impact) => ({
    playerName: resolvePlayerName(playersById, impact.playerId),
    previousRank: impact.previousRank,
    newRank: impact.newRank,
    balanceDeltaLabel: impact.balanceDeltaLabel,
    exactHitsDelta: impact.exactHitsDelta ?? 0,
    reasonMatchLabel: resolveMatchLabel(matchesById, impact.reasonMatchId, impact.reasonMatchLabel)
  }));

  const exactBets = (input.exactBets ?? []).map((bet) => ({
    playerName: resolvePlayerName(playersById, bet.playerId),
    matchLabel: bet.matchLabel,
    tip: bet.tip
  }));

  const dailyWinner = input.dailyWinner
    ? {
        playerName: resolvePlayerName(playersById, input.dailyWinner.playerId),
        balanceDeltaLabel: input.dailyWinner.balanceDeltaLabel,
        reason: input.dailyWinner.reason
      }
    : undefined;
  const dailyLoser = input.dailyLoser
    ? {
        playerName: resolvePlayerName(playersById, input.dailyLoser.playerId),
        balanceDeltaLabel: input.dailyLoser.balanceDeltaLabel,
        reason: input.dailyLoser.reason
      }
    : undefined;
  const badgeContext = (input.badgeContext ?? []).map((badge) => ({
    badgeKey: badge.badgeKey,
    badgeName: badge.badgeName,
    kind: badge.kind ?? "result",
    emoji: badge.emoji,
    caption: badge.caption,
    leaderName: badge.leaderId ? resolvePlayerName(playersById, badge.leaderId) : undefined,
    followerNames: (badge.followerIds ?? []).map((playerId) => resolvePlayerName(playersById, playerId)),
    indicators: badge.indicators ?? [],
    explainer: badge.explainer
  }));

  return {
    ticket: { ...input.ticket },
    contextNotes: input.contextNotes ?? [],
    changedBadges,
    matchResults,
    leaderboardImpact,
    exactBets,
    dailyWinner,
    dailyLoser,
    badgeContext,
    storyFacts: input.storyFacts ?? [],
    matchCount: matchResults.length,
    knownPlayers: unique(input.players.map((player) => player.name)),
    knownPlayerAliases: unique(input.players.flatMap((player) => player.aliases ?? [])),
    knownMatches: unique([
      ...matchResults.map((match) => match.matchLabel),
      ...exactBets.map((bet) => bet.matchLabel),
      ...changedBadges.flatMap((badge) => (badge.reasonMatchLabel ? [badge.reasonMatchLabel] : [])),
      ...leaderboardImpact.flatMap((impact) =>
        impact.reasonMatchLabel ? [impact.reasonMatchLabel] : []
      )
    ])
  };
}
