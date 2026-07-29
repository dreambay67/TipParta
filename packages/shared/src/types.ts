import type { Cents5 } from "./money";
import type { TeamTier } from "./teams";

export type PlayerRole = "admin" | "player";
export type PlayerStatus = "active" | "blocked";
export type PaymentStatus = "paid" | "unpaid";
export type MatchStatus = "scheduled" | "live" | "finished" | "settled";
export type TicketStatus = "open" | "locked" | "settled";
export type TicketKind = "matchday" | "longTerm";

export type Score = {
  home: number;
  away: number;
};

export type OutcomeFamily = "home" | "draw" | "away";

export type Player = {
  id: string;
  email: string;
  displayName: string;
  role: PlayerRole;
  isPlayer: boolean;
  status: PlayerStatus;
  paymentStatus: PaymentStatus;
  registrationOrder: number;
  createdAt: string;
  updatedAt?: string;
};

export type Team = {
  code: string;
  nameSk: string;
  nameEn: string;
  tier: TeamTier;
  codeAliases?: string[];
  nameAliases?: string[];
};

export type Match = {
  id: string;
  tournamentId: string;
  ticketId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  kickoffAtUtc: string;
  kickoffAtSk: string;
  officialMatchdayKey: string;
  status: MatchStatus;
  finalScore?: Score;
};

export type Ticket = {
  id: string;
  tournamentId: string;
  tournamentKey?: string;
  kind?: TicketKind;
  label: string;
  officialMatchdayKey: string;
  lockAt?: string;
  lockAtUtc: string;
  lockAtSk: string;
  status: TicketStatus;
  matchIds: string[];
  predictionSlots?: LongTermPredictionSlot[];
};

export type LongTermPredictionSlot = {
  key: "champion" | "second" | "third" | "fourth";
  label: string;
};

export type LongTermPick = {
  id: string;
  playerId: string;
  ticketId: string;
  tournamentId: string;
  tournamentKey?: string;
  picks: Partial<Record<LongTermPredictionSlot["key"], string>>;
  submittedAt?: string;
  updatedAt: string;
};

export type Bet = {
  id: string;
  playerId: string;
  matchId: string;
  ticketId: string;
  score: Score;
  submittedAt: string;
  updatedAt: string;
};

export type TicketSnapshotBet = {
  playerId: string;
  matchId: string;
  score: Score | null;
  registrationOrder: number;
};

export type MatchSettlementLine = {
  playerId: string;
  units: Cents5;
  label: string;
  exactHit: boolean;
};
