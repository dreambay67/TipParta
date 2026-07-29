'use client';

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RadioTower,
  RefreshCw
} from "lucide-react";
import type { PlayerDocument } from "@/features/players/playerRepository";
import { BetInput } from "./BetInput";
import { LongTermPicksTicket } from "./LongTermPicksTicket";
import { TicketOverviewTable } from "./TicketOverviewTable";
import {
  EMPTY_TICKET_FEED_STATE,
  subscribeTicketFeed,
  type MatchDocument,
  type TicketDocument,
  type TicketFeedState,
  type TicketSnapshotDocument
} from "./ticketRepository";

type TicketFeedProps = {
  player: PlayerDocument;
  sandboxState?: TicketFeedState | null;
};

type SubmissionStatus = {
  complete: boolean;
  expired: boolean;
  saved: number;
  total: number;
  tone: "complete" | "missing" | "neutral";
  title: string;
};

function parseDate(value: string): Date | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatLock(ticket: TicketDocument): string {
  const date = parseDate(ticket.lockAtUtc);

  if (!date) {
    return ticket.lockAtSk || "18:00 SK";
  }

  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function ticketIsOpen(ticket: TicketDocument, now: number): boolean {
  const lock = parseDate(ticket.lockAtUtc);
  return ticket.status === "open" && (!lock || lock.getTime() > now);
}

function lockBadgeText(ticket: TicketDocument, now: number): string {
  if (ticketIsOpen(ticket, now)) {
    return `Otvorené do ${formatLock(ticket)}`;
  }

  if (ticket.status === "settled") {
    return "Vyhodnotené";
  }

  return "Zamknuté";
}

function ticketTone(ticket: TicketDocument, now: number): string {
  if (ticketIsOpen(ticket, now)) {
    return "border-cyan-300 text-cyan-100";
  }

  if (ticket.status === "settled") {
    return "border-emerald-300 text-emerald-100";
  }

  return "border-yellow-300 text-yellow-100";
}

function ticketsWithCounts(state: TicketFeedState): TicketDocument[] {
  return state.tickets
    .filter((ticket) => {
      if (ticket.kind === "longTerm") {
        return ticket.status === "open";
      }

      const matches = state.matchesByTicketId[ticket.id] ?? [];
      return ticket.status !== "settled" && (matches.length > 0 || ticket.matchIds.length > 0);
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "longTerm" ? 1 : -1;
      }

      const leftSettled = left.status === "settled" ? 1 : 0;
      const rightSettled = right.status === "settled" ? 1 : 0;
      const settledOrder = leftSettled - rightSettled;
      return settledOrder === 0 ? left.lockAtUtc.localeCompare(right.lockAtUtc) : settledOrder;
    });
}

function savedBetCount({
  matches,
  playerId,
  snapshot,
  state
}: {
  matches: MatchDocument[];
  playerId: string;
  snapshot?: TicketSnapshotDocument;
  state: TicketFeedState;
}): number {
  if (snapshot) {
    const savedMatchIds = new Set(
      snapshot.bets
        .filter((bet) => bet.playerId === playerId && bet.score)
        .map((bet) => bet.matchId)
    );

    return matches.filter((match) => savedMatchIds.has(match.id)).length;
  }

  return matches.filter((match) => Boolean(state.ownBetsByMatchId[match.id])).length;
}

function submissionStatus({
  matches,
  now,
  playerId,
  snapshot,
  state,
  ticket
}: {
  matches: MatchDocument[];
  now: number;
  playerId: string;
  snapshot?: TicketSnapshotDocument;
  state: TicketFeedState;
  ticket: TicketDocument;
}): SubmissionStatus {
  const total = matches.length;
  const saved = savedBetCount({ matches, playerId, snapshot, state });
  const complete = total > 0 && saved >= total;
  const expired = !ticketIsOpen(ticket, now) && !complete;

  if (complete) {
    return {
      complete,
      expired,
      saved,
      total,
      tone: "complete",
      title: "Natipované"
    };
  }

  if (expired) {
    return {
      complete,
      expired,
      saved,
      total,
      tone: "missing",
      title: "Bohužiaľ, čas na dodanie tipov vypršal"
    };
  }

  return {
    complete,
    expired,
    saved,
    total,
    tone: "missing",
    title: "Chýbajúce tipy"
  };
}

function focusTicketId(tickets: TicketDocument[]): string | null {
  return tickets.find((ticket) => ticket.kind !== "longTerm" && ticket.status !== "settled")?.id ?? tickets[0]?.id ?? null;
}

function matchIsComplete(match: MatchDocument): boolean {
  if (match.status === "cancelled" || match.status === "settled") {
    return true;
  }

  return match.status === "finished" && Boolean(match.finalScore);
}

function ticketResultsArePreparing(ticket: TicketDocument, matches: MatchDocument[]): boolean {
  return ticket.status === "locked" && matches.length > 0 && matches.every(matchIsComplete);
}

function articleTone(isFocus: boolean, status: SubmissionStatus): string {
  if (!isFocus) {
    return "border-slate-600";
  }

  return status.tone === "complete" ? "border-emerald-300" : "border-red-300";
}

function statusTone(status: SubmissionStatus): string {
  return status.tone === "complete"
    ? "border-emerald-300 bg-emerald-950 text-emerald-200"
    : "border-red-300 bg-red-950 text-red-100";
}

export function TicketFeed({ player, sandboxState = null }: TicketFeedProps) {
  const [state, setState] = useState<TicketFeedState>(EMPTY_TICKET_FEED_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const visibleTickets = useMemo(() => ticketsWithCounts(state), [state]);
  const currentFocusTicketId = useMemo(() => focusTicketId(visibleTickets), [visibleTickets]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sandboxState) {
      setState(sandboxState);
      setLoading(false);
      setError(null);
      return;
    }

    return subscribeTicketFeed(
      player.id,
      (nextState) => {
        setState(nextState);
        setLoading(false);
      },
      () => {
        setError("Lístky sa nepodarilo načítať.");
        setLoading(false);
      }
    );
  }, [player.id, sandboxState]);

  const focusTicket = visibleTickets.find((ticket) => ticket.id === currentFocusTicketId);
  const focusMatches = focusTicket ? state.matchesByTicketId[focusTicket.id] ?? [] : [];
  const focusStatus = focusTicket
    ? submissionStatus({
        matches: focusMatches,
        now,
        playerId: player.id,
        snapshot: state.snapshotsByTicketId[focusTicket.id],
        state,
        ticket: focusTicket
      })
    : null;

  return (
    <section className="mx-auto min-w-0 w-full max-w-[min(1180px,calc(100vw-1rem))] overflow-hidden border-2 border-slate-700 bg-[#172331] sm:border-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-700 bg-slate-950 px-3 py-2 sm:gap-3 sm:border-b-4 sm:px-4 sm:py-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
            <RadioTower aria-hidden className="h-4 w-4" />
            Denné lístky
          </p>
          <h2 className="mt-1 text-xl font-black uppercase leading-none text-white sm:text-3xl">
            Tipovací prenos
          </h2>
        </div>
        {focusStatus ? (
          <div
            className={`flex items-center gap-2 border-2 px-3 py-2 font-mono text-xs font-black uppercase ${statusTone(focusStatus)}`}
          >
            {focusStatus.complete ? (
              <CheckCircle2 aria-hidden className="h-4 w-4" />
            ) : (
              <AlertTriangle aria-hidden className="h-4 w-4" />
            )}
            <span>{focusStatus.title}</span>
            <span className="text-slate-300">
              {focusStatus.saved}/{focusStatus.total}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-2 border-cyan-300 px-3 py-2 font-mono text-xs font-black uppercase text-cyan-100">
            <CalendarClock aria-hidden className="h-4 w-4" />
            Čakám na lístok
          </div>
        )}
      </header>

      {loading ? (
        <div className="flex items-center gap-3 p-4 font-mono text-sm font-black uppercase text-slate-200">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          Načítavam lístky
        </div>
      ) : null}

      {error ? (
        <div className="m-4 flex items-center gap-2 border-2 border-red-300 bg-red-800 px-3 py-2 font-mono text-sm font-black uppercase text-red-50">
          <RefreshCw aria-hidden className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {!loading && !error && visibleTickets.length === 0 ? (
        <div className="p-4 font-mono text-sm font-bold uppercase text-slate-300">
          Zatiaľ nie sú pripravené žiadne zápasové lístky.
        </div>
      ) : null}

      {visibleTickets.length > 0 ? (
        <div className="ticket-stack-flow grid min-w-0 gap-3 p-2 sm:gap-4 sm:p-4">
          {visibleTickets.map((ticket) => {
            const isLongTerm = ticket.kind === "longTerm";
            const open = ticketIsOpen(ticket, now);
            const matches = state.matchesByTicketId[ticket.id] ?? [];
            const snapshot = state.snapshotsByTicketId[ticket.id];
            const isFocus = ticket.id === currentFocusTicketId;
            const status = isLongTerm
              ? null
              : submissionStatus({
                  matches,
                  now,
                  playerId: player.id,
                  snapshot,
                  state,
                  ticket
                });
            const resultsPreparing = Boolean(snapshot) && ticketResultsArePreparing(ticket, matches);

            return (
              <article
                className={`min-w-0 w-full overflow-hidden border-2 bg-[#111820] shadow-[4px_4px_0_#020617] sm:border-4 sm:shadow-[5px_5px_0_#020617] ${isLongTerm ? "border-yellow-300" : articleTone(isFocus, status!)}`}
                key={ticket.id}
              >
                <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-slate-600 px-3 py-2 sm:gap-3 sm:border-b-4 sm:px-4 sm:py-3">
                  <div>
                    <p className="font-mono text-xs font-black uppercase text-slate-400">
                      Oficiálny deň {ticket.officialMatchdayKey}
                    </p>
                    <h3 className="mt-1 text-xl font-black uppercase leading-none text-white sm:text-2xl">
                      {ticket.label || ticket.officialMatchdayKey}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isFocus && status ? (
                      <span
                      className={`inline-flex items-center gap-2 border-2 px-2 py-2 font-mono text-[0.68rem] font-black uppercase sm:px-3 sm:text-xs ${statusTone(status)}`}
                      >
                        {status.complete ? (
                          <CheckCircle2 aria-hidden className="h-4 w-4" />
                        ) : (
                          <AlertTriangle aria-hidden className="h-4 w-4" />
                        )}
                        {status.title}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center gap-2 border-2 px-2 py-2 font-mono text-[0.68rem] font-black uppercase sm:px-3 sm:text-xs ${ticketTone(ticket, now)}`}
                    >
                      <LockKeyhole aria-hidden className="h-4 w-4" />
                      {lockBadgeText(ticket, now)}
                    </span>
                  </div>
                </header>

                <div className="grid min-w-0 gap-2 p-2 sm:gap-3 sm:p-3">
                  {isLongTerm ? (
                    <LongTermPicksTicket
                      existingPick={state.ownLongTermPicksByTicketId[ticket.id]}
                      playerId={player.id}
                      ticket={ticket}
                    />
                  ) : open ? (
                    matches.map((match) => {
                      const bet = state.ownBetsByMatchId[match.id];

                      return (
                        <BetInput
                          bet={bet}
                          disabled={!open}
                          key={`${match.id}-${bet?.score.home ?? "n"}-${bet?.score.away ?? "n"}`}
                          match={match}
                          playerId={player.id}
                          ticket={ticket}
                        />
                      );
                    })
                  ) : (
                    <>
                      {resultsPreparing ? (
                        <div className="border-2 border-cyan-300 bg-slate-950 px-3 py-2 font-mono text-sm font-black uppercase text-cyan-100">
                          Výsledky dňa sa pripravujú.
                        </div>
                      ) : null}
                      <TicketOverviewTable
                        currentPlayerId={player.id}
                        matches={matches}
                        playersById={state.playersById}
                        snapshot={snapshot}
                      />
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
