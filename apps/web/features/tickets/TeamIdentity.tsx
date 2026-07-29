import { resolveTournamentTeamDisplay } from "@tipparta/shared";
import type { MatchDocument } from "./ticketRepository";

type TeamPillProps = {
  code: string;
  tone: "home" | "away" | "plain";
  tournamentId: string;
};

const toneClasses = {
  home: "border-cyan-300 text-cyan-100",
  away: "border-yellow-300 text-yellow-200",
  plain: "border-slate-600 text-slate-50"
};

export function teamDisplayName(tournamentId: string, code: string): string {
  return resolveTournamentTeamDisplay(tournamentId, code).nameSk;
}

export function TeamPill({ code, tone, tournamentId }: TeamPillProps) {
  const team = resolveTournamentTeamDisplay(tournamentId, code);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 border-2 px-1 py-0.5 font-mono text-[0.62rem] font-black uppercase leading-tight sm:gap-2 sm:px-2 sm:py-1 sm:text-xs ${toneClasses[tone]}`}
      title={team.nameSk}
    >
      {team.flagCode ? (
        <span
          aria-hidden="true"
          className={`fi fi-${team.flagCode} shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.22)]`}
        />
      ) : null}
      <span className="min-w-0 whitespace-normal break-words">{team.nameSk}</span>
    </span>
  );
}

export function MatchupLabel({ match }: { match: MatchDocument }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1 sm:gap-2">
      <TeamPill code={match.homeTeamCode} tone="plain" tournamentId={match.tournamentId} />
      <span className="font-mono text-[0.62rem] font-black uppercase text-slate-400 sm:text-xs">vs</span>
      <TeamPill code={match.awayTeamCode} tone="plain" tournamentId={match.tournamentId} />
    </span>
  );
}
