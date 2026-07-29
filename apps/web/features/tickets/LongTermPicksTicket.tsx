"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Save, Trophy } from "lucide-react";
import {
  DEFAULT_TOURNAMENT_KEY,
  LONG_TERM_PREDICTION_SLOTS,
  TEAM_SEEDS,
  resolveTournamentTeamDisplay,
  type LongTermPredictionSlot
} from "@tipparta/shared";
import type { LongTermPickDocument, TicketDocument } from "./ticketRepository";
import { saveLongTermPicks } from "./ticketRepository";

type LongTermPicksTicketProps = {
  existingPick?: LongTermPickDocument;
  playerId: string;
  ticket: TicketDocument;
};

type DraftPicks = Partial<Record<LongTermPredictionSlot["key"], string>>;

const TEAM_OPTIONS = TEAM_SEEDS.map((team) => ({
  code: team.code,
  label: team.nameSk
})).sort((left, right) => left.label.localeCompare(right.label, "sk"));

function slotsForTicket(ticket: TicketDocument): LongTermPredictionSlot[] {
  return ticket.predictionSlots?.length
    ? ticket.predictionSlots
    : LONG_TERM_PREDICTION_SLOTS.map((slot) => ({ ...slot }));
}

function teamInputValue(code: string | undefined): string {
  if (!code) {
    return "";
  }

  const team = resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, code);
  return team.nameSk;
}

function inputDraftFromPicks(slots: LongTermPredictionSlot[], picks: DraftPicks): Record<string, string> {
  return Object.fromEntries(slots.map((slot) => [slot.key, teamInputValue(picks[slot.key])]));
}

function teamCodeFromInput(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase("sk");
  if (!normalized) {
    return null;
  }

  const direct = TEAM_OPTIONS.find((team) => team.code.toLocaleLowerCase("sk") === normalized);
  if (direct) {
    return direct.code;
  }

  const byName = TEAM_OPTIONS.find((team) => team.label.toLocaleLowerCase("sk") === normalized);
  return byName?.code ?? null;
}

function nextTeamCode(currentCode: string | undefined, direction: 1 | -1): string {
  const currentIndex = TEAM_OPTIONS.findIndex((team) => team.code === currentCode);
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : TEAM_OPTIONS.length - 1
      : (currentIndex + direction + TEAM_OPTIONS.length) % TEAM_OPTIONS.length;
  return TEAM_OPTIONS[nextIndex]?.code ?? TEAM_OPTIONS[0]!.code;
}

function hasDuplicates(picks: DraftPicks): boolean {
  const selected = Object.values(picks).filter((code): code is string => Boolean(code));
  return selected.length !== new Set(selected).size;
}

function hasAllSlots(slots: LongTermPredictionSlot[], picks: DraftPicks): boolean {
  return slots.every((slot) => Boolean(picks[slot.key]));
}

export function LongTermPicksTicket({ existingPick, playerId, ticket }: LongTermPicksTicketProps) {
  const slots = useMemo(() => slotsForTicket(ticket), [ticket]);
  const [draft, setDraft] = useState<DraftPicks>(() => existingPick?.picks ?? {});
  const [inputDraft, setInputDraft] = useState<Record<string, string>>(() =>
    inputDraftFromPicks(slots, existingPick?.picks ?? {})
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicate = hasDuplicates(draft);
  const complete = hasAllSlots(slots, draft);
  const canSave = complete && !duplicate && !saving;

  useEffect(() => {
    const nextPicks = existingPick?.picks ?? {};
    setDraft(nextPicks);
    setInputDraft(inputDraftFromPicks(slots, nextPicks));
    setSaved(false);
    setError(null);
  }, [existingPick?.id, existingPick?.updatedAt, slots]);

  function setPick(slotKey: LongTermPredictionSlot["key"], code: string | null) {
    setSaved(false);
    setError(null);
    setInputDraft((current) => ({
      ...current,
      [slotKey]: code ? teamInputValue(code) : ""
    }));
    setDraft((current) => {
      const next = { ...current };
      if (code) {
        next[slotKey] = code;
      } else {
        delete next[slotKey];
      }
      return next;
    });
  }

  function handleTeamInput(slotKey: LongTermPredictionSlot["key"], value: string) {
    setSaved(false);
    setError(null);
    setInputDraft((current) => ({ ...current, [slotKey]: value }));
    const code = teamCodeFromInput(value);

    setDraft((current) => {
      const next = { ...current };
      if (code) {
        next[slotKey] = code;
      } else {
        delete next[slotKey];
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await saveLongTermPicks({
        playerId,
        ticketId: ticket.id,
        tournamentId: ticket.tournamentId,
        tournamentKey: ticket.tournamentKey,
        picks: draft
      });
      setSaved(true);
    } catch {
      setError("Dlhodobé tipy sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 border-2 border-yellow-300 bg-[#101820] p-3 sm:border-4 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
            <Trophy aria-hidden className="h-4 w-4" />
            Turnajový lístok
          </p>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-200">
            Vyber štyri rôzne tímy. Tieto tipy sa zamknú až pred play-off a potom sa presunú do Výsledkov.
          </p>
        </div>
        <span className="border-2 border-cyan-300 px-3 py-2 font-mono text-xs font-black uppercase text-cyan-100">
          Uzávierka 28. 6. 18:00
        </span>
      </div>

      <div className="grid gap-3">
        {slots.map((slot) => {
          const selectedCode = draft[slot.key];
          const selectedTeam = selectedCode ? resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, selectedCode) : null;

          return (
            <label
              className="grid gap-2 border-2 border-slate-700 bg-[#172331] p-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"
              key={slot.key}
            >
              <span className="font-mono text-xs font-black uppercase text-yellow-200">
                {slot.label}
              </span>
              <span className="grid gap-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]">
                <button
                  className="inline-flex items-center justify-center border-2 border-cyan-300 px-2 py-2 text-cyan-100 hover:bg-cyan-300 hover:text-slate-950"
                  onClick={(event) => {
                    event.preventDefault();
                    setPick(slot.key, nextTeamCode(selectedCode, -1));
                  }}
                  title="Predchádzajúci tím"
                  type="button"
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </button>
                <span className="relative min-w-0">
                  {selectedTeam?.flagCode ? (
                    <span
                      aria-hidden="true"
                      className={`fi fi-${selectedTeam.flagCode} pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 shadow-[0_0_0_1px_rgba(255,255,255,0.22)]`}
                    />
                  ) : null}
                  <input
                    className="w-full border-2 border-slate-600 bg-white py-2 pl-11 pr-3 font-mono text-sm font-black uppercase text-slate-950 outline-none focus:border-yellow-300"
                    autoComplete="off"
                    list="long-term-teams"
                    onBlur={() => {
                      const code = teamCodeFromInput(inputDraft[slot.key] ?? "");
                      if (code) {
                        setPick(slot.key, code);
                      }
                    }}
                    onChange={(event) => handleTeamInput(slot.key, event.target.value)}
                    placeholder="Napíš tím alebo použi šípky"
                    value={inputDraft[slot.key] ?? teamInputValue(selectedCode)}
                  />
                </span>
                <button
                  className="inline-flex items-center justify-center border-2 border-cyan-300 px-2 py-2 text-cyan-100 hover:bg-cyan-300 hover:text-slate-950"
                  onClick={(event) => {
                    event.preventDefault();
                    setPick(slot.key, nextTeamCode(selectedCode, 1));
                  }}
                  title="Ďalší tím"
                  type="button"
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              </span>
            </label>
          );
        })}
      </div>

      <datalist id="long-term-teams">
        {TEAM_OPTIONS.map((team) => (
          <option key={team.code} value={team.label} />
        ))}
      </datalist>

      {duplicate ? (
        <p className="border-2 border-red-300 bg-red-950 px-3 py-2 font-mono text-xs font-black uppercase text-red-100">
          Rovnaký tím nemôže byť vybraný dvakrát.
        </p>
      ) : null}
      {error ? (
        <p className="border-2 border-red-300 bg-red-950 px-3 py-2 font-mono text-xs font-black uppercase text-red-100">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="flex items-center gap-2 border-2 border-emerald-300 bg-emerald-950 px-3 py-2 font-mono text-xs font-black uppercase text-emerald-100">
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          Dlhodobé tipy uložené.
        </p>
      ) : null}

      <button
        className="inline-flex w-fit items-center gap-2 border-4 border-yellow-300 bg-yellow-300 px-5 py-3 font-black uppercase text-slate-950 shadow-[4px_4px_0_#020617] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canSave}
        onClick={handleSave}
        type="button"
      >
        <Save aria-hidden className="h-4 w-4" />
        {saving ? "Ukladám..." : "Uložiť"}
      </button>
    </div>
  );
}
