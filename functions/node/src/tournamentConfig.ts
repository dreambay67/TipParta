import type { TicketLockOptions } from "./tickets.js";

export type TournamentRuntimeConfig = {
  ticketLock: TicketLockOptions;
};

const DEFAULT_CONFIG: TournamentRuntimeConfig = {
  ticketLock: {}
};

/**
 * Future tournament-specific overrides belong in a new configuration module.
 * Keeping the default empty prevents dates or lock times from leaking across
 * tournaments.
 */
export function tournamentRuntimeConfig(_tournamentKey: string): TournamentRuntimeConfig {
  return DEFAULT_CONFIG;
}
