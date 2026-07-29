'use client';

import { FormEvent, useMemo, useState } from "react";
import { Save, XCircle } from "lucide-react";
import type { BetDocument, MatchDocument, TicketDocument } from "./ticketRepository";
import { saveExactScoreBet } from "./ticketRepository";
import { TeamPill, teamDisplayName } from "./TeamIdentity";

type BetInputProps = {
  bet?: BetDocument;
  disabled: boolean;
  match: MatchDocument;
  playerId: string;
  ticket: TicketDocument;
};

function parseScorePart(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) {
    return null;
  }

  return Number(value);
}

function kickoffLabel(match: MatchDocument): string {
  const value = match.kickoffAtUtc || match.kickoffAtSk;
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "čas čaká";
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
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const time = `${values.hour}:${values.minute}`;
  const skDateKey = `${values.year}-${values.month}-${values.day}`;

  return match.officialMatchdayKey && skDateKey !== match.officialMatchdayKey
    ? `${Number(values.day)}.${Number(values.month)}. ${Number(values.hour)}:${values.minute}`
    : time;
}

export function BetInput({ bet, disabled, match, playerId, ticket }: BetInputProps) {
  const [home, setHome] = useState(bet ? String(bet.score.home) : "");
  const [away, setAway] = useState(bet ? String(bet.score.away) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const homeScore = useMemo(() => parseScorePart(home), [home]);
  const awayScore = useMemo(() => parseScorePart(away), [away]);
  const savedHome = bet ? String(bet.score.home) : "";
  const savedAway = bet ? String(bet.score.away) : "";
  const dirty = !disabled && (home !== savedHome || away !== savedAway);
  const canSave = !disabled && !saving && dirty && homeScore !== null && awayScore !== null;

  function updateHome(value: string) {
    setHome(value);
    setMessage(null);
    setError(null);
  }

  function updateAway(value: string) {
    setAway(value);
    setMessage(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (homeScore === null || awayScore === null) {
      setError("Zadaj celé skóre pre oba tímy.");
      return;
    }

    setSaving(true);

    try {
      await saveExactScoreBet({
        playerId,
        ticketId: ticket.id,
        matchId: match.id,
        score: {
          home: homeScore,
          away: awayScore
        }
      });
      setMessage("Tip uložený.");
    } catch {
      setError("Tip sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="grid min-h-[112px] gap-4 border-2 border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
      onSubmit={handleSubmit}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <TeamPill code={match.homeTeamCode} tone="home" tournamentId={match.tournamentId} />
          <span className="font-mono text-xs font-black uppercase text-slate-400">vs</span>
          <TeamPill code={match.awayTeamCode} tone="away" tournamentId={match.tournamentId} />
          <span className="font-mono text-xs font-bold uppercase text-slate-400">
            {kickoffLabel(match)}
          </span>
        </div>
        <div className="mt-3 min-h-5 font-mono text-xs font-bold uppercase">
          {message ? <span className="text-emerald-300">{message}</span> : null}
          {error ? (
            <span className="inline-flex items-center gap-1 text-red-200">
              <XCircle aria-hidden className="h-3.5 w-3.5" />
              {error}
            </span>
          ) : null}
          {!message && !error && disabled ? (
            <span className="text-slate-400">Uzávierka zatvorila tipovanie.</span>
          ) : null}
          {!message && !error && !disabled && dirty ? (
            <span className="text-yellow-200">Neuložené</span>
          ) : null}
          {!message && !error && !disabled && !dirty && bet ? (
            <span className="text-slate-400">
              Naposledy uložené: {bet.score.home}:{bet.score.away}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
        <label className="grid gap-1">
          <span className="font-mono text-[10px] font-black uppercase text-slate-400">
            Domáci
          </span>
          <input
            aria-label={`${teamDisplayName(match.tournamentId, match.homeTeamCode)} góly`}
            className="h-12 w-16 border-4 border-slate-600 bg-white text-center font-mono text-xl font-black text-slate-950 outline-none focus:border-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={disabled || saving}
            inputMode="numeric"
            max={99}
            min={0}
            onChange={(event) => updateHome(event.target.value)}
            type="number"
            value={home}
          />
        </label>
        <span className="mb-2 font-mono text-xl font-black text-yellow-300">:</span>
        <label className="grid gap-1">
          <span className="font-mono text-[10px] font-black uppercase text-slate-400">
            Hostia
          </span>
          <input
            aria-label={`${teamDisplayName(match.tournamentId, match.awayTeamCode)} góly`}
            className="h-12 w-16 border-4 border-slate-600 bg-white text-center font-mono text-xl font-black text-slate-950 outline-none focus:border-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={disabled || saving}
            inputMode="numeric"
            max={99}
            min={0}
            onChange={(event) => updateAway(event.target.value)}
            type="number"
            value={away}
          />
        </label>
        <button
          className="inline-flex h-12 items-center gap-2 border-4 border-yellow-300 bg-yellow-300 px-4 font-mono text-xs font-black uppercase text-slate-950 shadow-[3px_3px_0_#020617] hover:bg-cyan-300 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-600 disabled:text-slate-300 disabled:shadow-none"
          disabled={!canSave}
          type="submit"
        >
          <Save aria-hidden className="h-4 w-4" />
          {saving ? "Ukladám" : "Uložiť"}
        </button>
      </div>
    </form>
  );
}
