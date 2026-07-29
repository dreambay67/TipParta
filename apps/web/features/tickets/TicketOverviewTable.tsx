'use client';

import type { Score } from "@tipparta/shared";
import { LockKeyhole } from "lucide-react";
import { useRef, type CSSProperties, type MouseEvent, type TouchEvent } from "react";
import { BadgeChipRack } from "@/features/badges/BadgeShowcase";
import type {
  MatchDocument,
  TicketFeedPlayer,
  TicketSnapshotDocument
} from "./ticketRepository";
import { MatchupLabel } from "./TeamIdentity";

type TicketOverviewTableProps = {
  currentPlayerId: string;
  matches: MatchDocument[];
  playersById: Record<string, TicketFeedPlayer>;
  snapshot?: TicketSnapshotDocument;
};

type RailDragState = {
  startX: number;
  scrollLeft: number;
  dragged: boolean;
};

function betScoreText(score: Score | null | undefined): string {
  return score ? `${score.home}:${score.away}` : "chýba";
}

function resultScoreText(match: MatchDocument): string {
  if (match.status === "live" && match.currentScore) {
    return `${match.currentScore.home}:${match.currentScore.away}`;
  }

  if (match.status === "cancelled") {
    return "Neodohrané";
  }

  return match.finalScore ? `${match.finalScore.home}:${match.finalScore.away}` : "čaká";
}

function sameScore(left: Score | null | undefined, right: Score | null | undefined): boolean {
  return Boolean(left && right && left.home === right.home && left.away === right.away);
}

function shouldIgnoreDrag(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button,a,input,textarea,select,label"));
}

function kickoffLabel(match: MatchDocument): string {
  const value = match.kickoffAtUtc || match.kickoffAtSk;
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const time = `${values.hour}:${values.minute}`;
  const skDateKey = `${values.year}-${values.month}-${values.day}`;

  return match.officialMatchdayKey && skDateKey !== match.officialMatchdayKey
    ? `${Number(values.day)}.${Number(values.month)}. ${Number(values.hour)}:${values.minute}`
    : time;
}

function PlayerNameWithBadges({ player }: { player: TicketFeedPlayer }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 break-words">
        #{player.registrationOrder} {player.displayName}
      </span>
      <BadgeChipRack badges={player.badges} />
    </span>
  );
}

export function TicketOverviewTable({
  currentPlayerId,
  matches,
  playersById,
  snapshot
}: TicketOverviewTableProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<RailDragState | null>(null);

  if (!snapshot) {
    return (
      <div className="border-2 border-yellow-300 bg-slate-950 p-4 font-mono text-sm font-black uppercase text-yellow-200">
        Prehľad dňa sa pripravuje.
      </div>
    );
  }

  const players = snapshot.playerIds
    .map((playerId) => playersById[playerId])
    .filter((player): player is TicketFeedPlayer => Boolean(player));
  const betByPlayerAndMatch = new Map(
    snapshot.bets.map((bet) => [`${bet.playerId}\n${bet.matchId}`, bet.score] as const)
  );
  const mobileGridTemplateColumns = `96px repeat(${matches.length}, 104px)`;
  const desktopGridTemplateColumns = `220px repeat(${matches.length}, 150px)`;
  const overviewGridStyle = {
    "--ticket-overview-mobile-columns": mobileGridTemplateColumns,
    "--ticket-overview-mobile-width": `${96 + matches.length * 104}px`,
    "--ticket-overview-desktop-columns": desktopGridTemplateColumns,
    "--ticket-overview-desktop-width": `${220 + matches.length * 150}px`
  } as CSSProperties;

  const beginRailDrag = (clientX: number, target: EventTarget | null) => {
    if (shouldIgnoreDrag(target)) {
      return;
    }

    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) {
      return;
    }

    dragRef.current = {
      dragged: false,
      startX: clientX,
      scrollLeft: rail.scrollLeft
    };
    rail.classList.add("drag-scroll--dragging");
  };

  const moveRailDrag = (clientX: number) => {
    const drag = dragRef.current;
    const rail = railRef.current;
    if (!drag || !rail) {
      return;
    }

    const deltaX = clientX - drag.startX;
    if (Math.abs(deltaX) > 2) {
      drag.dragged = true;
    }
    rail.scrollLeft = drag.scrollLeft - deltaX;
  };

  const endRailDrag = () => {
    railRef.current?.classList.remove("drag-scroll--dragging");
    dragRef.current = null;
  };

  const onRailMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    beginRailDrag(event.clientX, event.target);
    event.preventDefault();

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      moveRailDrag(moveEvent.clientX);
      moveEvent.preventDefault();
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      endRailDrag();
    };

    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
  };

  const onRailTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    beginRailDrag(touch.clientX, event.target);

    const onTouchMove = (moveEvent: globalThis.TouchEvent) => {
      const nextTouch = moveEvent.touches[0];
      if (!nextTouch || !dragRef.current) {
        return;
      }
      moveRailDrag(nextTouch.clientX);
      if (dragRef.current.dragged) {
        moveEvent.preventDefault();
      }
    };
    const onTouchEnd = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      endRailDrag();
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  };

  return (
    <section className="min-w-0 max-w-full overflow-hidden border-2 border-yellow-300 bg-[#0b1118] md:border-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-yellow-300 px-2 py-2 md:border-b-4 md:px-3">
        <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-yellow-200">
          <LockKeyhole aria-hidden className="h-4 w-4" />
          Zamknutý prehľad
        </p>
        <p className="font-mono text-[0.68rem] font-bold uppercase text-slate-300 md:text-xs">
          Rovnaký tip ako tvoj je zvýraznený
        </p>
      </div>

      <div className="hidden">
        {matches.map((match) => {
          const currentPlayerScore = betByPlayerAndMatch.get(`${currentPlayerId}\n${match.id}`) ?? null;

          return (
            <article className="border-2 border-slate-600 bg-[#101923]" key={`mobile-${match.id}`}>
              <header className="grid gap-2 border-b-2 border-slate-700 p-3">
                <div className="font-black text-slate-50">
                  <MatchupLabel match={match} />
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-black uppercase text-slate-400">
                  <span>{kickoffLabel(match)}</span>
                  <span className="inline-flex min-w-16 justify-center border-2 border-cyan-300 bg-slate-950 px-2 py-1 text-cyan-100">
                    {resultScoreText(match)}
                  </span>
                  {match.status === "live" ? (
                    <span className="inline-flex border-2 border-red-400 bg-red-700 px-2 py-1 text-[10px] text-white">
                      LIVE
                    </span>
                  ) : null}
                </div>
              </header>
              <div className="grid">
                {players.map((player) => {
                  const score = betByPlayerAndMatch.get(`${player.id}\n${match.id}`) ?? null;
                  const highlight = sameScore(score, currentPlayerScore);
                  const isCurrentPlayer = player.id === currentPlayerId;

                  return (
                    <div
                      className={
                        isCurrentPlayer
                          ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b-2 border-yellow-300 bg-yellow-300 px-3 py-2 font-mono text-xs font-black uppercase text-slate-950 last:border-b-0"
                          : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b-2 border-slate-800 px-3 py-2 font-mono text-xs font-black uppercase text-slate-100 last:border-b-0"
                      }
                      key={`${player.id}-${match.id}-mobile`}
                    >
                      <PlayerNameWithBadges player={player} />
                      <span
                        className={
                          highlight
                            ? "inline-flex min-w-14 justify-center border-2 border-yellow-300 bg-yellow-300 px-2 py-1 text-slate-950 shadow-[0_0_0_2px_#0b1118]"
                            : score
                              ? "inline-flex min-w-14 justify-center border-2 border-slate-600 bg-[#0b1118] px-2 py-1 text-slate-50"
                              : "inline-flex min-w-14 justify-center border-2 border-red-300 bg-red-800 px-2 py-1 text-red-50"
                        }
                      >
                        {betScoreText(score)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <div
        className="ticket-pan-frame ticket-pan-frame--table block"
        aria-label="Posuvný prehľad tipov"
        data-testid="ticket-overview-rail"
        onDragStart={(event) => event.preventDefault()}
        onMouseDown={onRailMouseDown}
        onTouchStart={onRailTouchStart}
        ref={railRef}
        role="region"
        tabIndex={0}
      >
        <div
          className="ticket-overview-grid grid min-w-full text-left text-xs md:text-sm"
          data-testid="ticket-overview-grid"
          style={overviewGridStyle}
        >
          <div className="sticky left-0 z-30 flex min-h-16 items-center border-b-2 border-r-2 border-slate-700 bg-slate-950 px-2 py-2 font-mono text-[0.65rem] font-black uppercase text-slate-300 shadow-[8px_0_0_rgba(7,10,14,0.62)] md:min-h-24 md:px-3 md:py-3 md:text-xs">
            Hráč
          </div>
          {matches.map((match) => (
            <div
              className="flex min-h-16 flex-col justify-end border-b-2 border-r-2 border-slate-700 bg-slate-950 px-2 py-2 md:min-h-24 md:px-3 md:py-3"
              key={match.id}
            >
              <span className="block text-[0.65rem] font-black leading-tight text-slate-50 md:text-xs">
                <MatchupLabel match={match} />
              </span>
              <span className="mt-1 block font-mono text-[9px] font-black uppercase text-slate-400 md:text-[10px]">
                {kickoffLabel(match)}
              </span>
            </div>
          ))}

          <div className="sticky left-0 z-20 flex min-h-12 items-center border-b-2 border-r-2 border-cyan-900 bg-cyan-950 px-2 py-2 font-mono text-[0.65rem] font-black uppercase text-cyan-100 shadow-[8px_0_0_rgba(7,10,14,0.52)] md:min-h-16 md:px-3 md:py-3 md:text-xs">
            Výsledok
          </div>
          {matches.map((match) => (
            <div
              className="flex min-h-12 items-center border-b-2 border-r-2 border-cyan-900 bg-cyan-950/50 px-2 py-2 font-mono text-xs font-black text-cyan-100 md:min-h-16 md:px-3 md:py-3 md:text-sm"
              key={`result-${match.id}`}
            >
              <span className="inline-flex min-w-10 justify-center border-2 border-cyan-300 bg-slate-950 px-1 py-1 md:min-w-16 md:px-2">
                {resultScoreText(match)}
              </span>
              {match.status === "live" ? (
                <span className="ml-1 inline-flex border-2 border-red-400 bg-red-700 px-1 py-1 text-[8px] text-white md:ml-2 md:px-2 md:text-[10px]">
                  LIVE
                </span>
              ) : null}
            </div>
          ))}

          {players.map((player) => {
            const currentPlayerScoreByMatch = new Map(
              matches.map((match) => [
                match.id,
                betByPlayerAndMatch.get(`${currentPlayerId}\n${match.id}`) ?? null
              ])
            );
            const isCurrentPlayer = player.id === currentPlayerId;

            return [
              <div
                className={
                  isCurrentPlayer
                    ? "sticky left-0 z-20 flex min-h-12 items-center border-b-2 border-r-2 border-yellow-300 bg-yellow-300 px-2 py-2 font-mono text-[0.65rem] font-black uppercase text-slate-950 shadow-[8px_0_0_rgba(7,10,14,0.42)] md:min-h-16 md:px-3 md:py-3 md:text-xs"
                    : "sticky left-0 z-20 flex min-h-12 items-center border-b-2 border-r-2 border-slate-800 bg-[#0b1118] px-2 py-2 font-mono text-[0.65rem] font-black uppercase text-slate-100 shadow-[8px_0_0_rgba(7,10,14,0.52)] md:min-h-16 md:px-3 md:py-3 md:text-xs"
                }
                key={`${player.id}-name`}
              >
                <PlayerNameWithBadges player={player} />
              </div>,
              ...matches.map((match) => {
                const score = betByPlayerAndMatch.get(`${player.id}\n${match.id}`) ?? null;
                const highlight = sameScore(score, currentPlayerScoreByMatch.get(match.id));

                return (
                  <div
                    className={
                      isCurrentPlayer
                        ? "flex min-h-12 items-center border-b-2 border-r-2 border-yellow-300 bg-yellow-950/30 px-2 py-2 font-mono text-xs font-black text-yellow-200 md:min-h-16 md:px-3 md:py-3 md:text-sm"
                        : "flex min-h-12 items-center border-b-2 border-r-2 border-slate-800 px-2 py-2 font-mono text-xs font-black text-slate-100 md:min-h-16 md:px-3 md:py-3 md:text-sm"
                    }
                    key={`${player.id}-${match.id}`}
                  >
                    <span
                      className={
                        highlight
                          ? "inline-flex min-w-10 justify-center border-2 border-yellow-300 bg-yellow-300 px-1 py-1 text-slate-950 md:min-w-14 md:px-2"
                          : score
                            ? "inline-flex min-w-10 justify-center border-2 border-slate-600 px-1 py-1 md:min-w-14 md:px-2"
                            : "inline-flex min-w-10 justify-center border-2 border-red-300 bg-red-800 px-1 py-1 text-red-50 md:min-w-14 md:px-2"
                      }
                    >
                      {betScoreText(score)}
                    </span>
                  </div>
                );
              })
            ];
          })}
        </div>
      </div>
    </section>
  );
}
