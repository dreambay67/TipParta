import { Crown } from "lucide-react";
import { useDragScroll } from "@/features/common/useDragScroll";
import type { LongTermOverviewData, LongTermOverviewTeam } from "./resultsRepository";

type LongTermOverviewTableProps = {
  overview: LongTermOverviewData | null;
};

function TeamCell({ team }: { team?: LongTermOverviewTeam }) {
  if (!team) {
    return <span className="text-slate-500">Bez tipu</span>;
  }

  return (
    <span className="inline-flex max-w-full items-center justify-center gap-2">
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

export function LongTermOverviewTable({ overview }: LongTermOverviewTableProps) {
  const scrollHandlers = useDragScroll<HTMLDivElement>({ axis: "x" });

  if (!overview) {
    return null;
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden border-2 border-yellow-300 bg-[#111820] text-white sm:border-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-yellow-300 bg-slate-950 px-3 py-2 sm:gap-3 sm:border-b-4 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <Crown aria-hidden className="h-5 w-5 text-yellow-300" />
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
              Turnajové proroctvá
            </p>
            <h2 className="mt-1 text-xl font-black uppercase leading-none sm:text-2xl">
              Prehľad dlhodobých tipov
            </h2>
          </div>
        </div>
        <span className="max-w-full break-words border-2 border-cyan-300 px-3 py-2 font-mono text-xs font-black uppercase text-cyan-100">
          {overview.label}
        </span>
      </header>

      <div className="ticket-pan-frame ticket-pan-frame--table p-2 sm:p-4" {...scrollHandlers}>
        <table className="min-w-[640px] border-collapse font-mono text-[0.65rem] font-black uppercase sm:min-w-[820px] sm:text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-left text-yellow-300 sm:px-3">
                Tipér
              </th>
              {overview.slots.map((slot) => (
                <th
                  className="sticky top-0 z-10 min-w-32 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-center text-cyan-100 sm:min-w-40 sm:px-3"
                  key={slot.key}
                >
                  {slot.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overview.rows.map((row) => (
              <tr key={row.playerId}>
                <th className="sticky left-0 z-10 max-w-32 border-2 border-slate-600 bg-[#172331] px-2 py-2 text-left text-white sm:max-w-48 sm:px-3">
                  <span className="block whitespace-normal break-words">{row.playerName}</span>
                </th>
                {overview.slots.map((slot) => (
                  <td
                    className="border-2 border-slate-600 bg-[#172331] px-2 py-2 text-center text-slate-100 sm:px-3"
                    key={`${row.playerId}-${slot.key}`}
                  >
                    <TeamCell team={row.picks[slot.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
