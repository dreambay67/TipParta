import { Trophy } from "lucide-react";
import { useDragScroll } from "@/features/common/useDragScroll";
import type { PreviousDayResultTableData, ResultsTicket } from "./resultsRepository";

type PreviousDayResultTableProps = {
  table: PreviousDayResultTableData | null;
  ticket: ResultsTicket | null;
};

function cellForMatch(
  cells: PreviousDayResultTableData["rows"][number]["cells"],
  matchId: string,
  fallbackIndex: number
) {
  return cells.find((cell) => cell.matchId === matchId) ?? cells[fallbackIndex] ?? null;
}

function amountTone(units: number | undefined): string {
  if (typeof units !== "number") {
    return "text-slate-200";
  }

  return units > 0 ? "text-emerald-300" : units < 0 ? "text-red-300" : "text-slate-200";
}

export function PreviousDayResultTable({ table, ticket }: PreviousDayResultTableProps) {
  const scrollHandlers = useDragScroll<HTMLDivElement>({ axis: "x" });

  return (
    <section className="min-w-0 max-w-full overflow-hidden border-2 border-slate-700 bg-[#111820] text-white sm:border-4">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-700 bg-slate-950 px-3 py-2 sm:gap-3 sm:border-b-4 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <Trophy aria-hidden className="h-5 w-5 text-yellow-300" />
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
              Uzavretý lístok
            </p>
            <h2 className="mt-1 text-xl font-black uppercase leading-none sm:text-2xl">
              Výsledky predchádzajúceho dňa
            </h2>
          </div>
        </div>
        {ticket ? (
          <span className="max-w-full break-words border-2 border-cyan-300 px-3 py-2 font-mono text-xs font-black uppercase text-cyan-100">
            {ticket.label}
          </span>
        ) : null}
      </header>

      {!ticket ? (
        <p className="p-4 font-mono text-sm font-bold uppercase text-slate-300">
          Predchádzajúci vyhodnotený lístok ešte neexistuje.
        </p>
      ) : !table ? (
        <p className="p-4 font-mono text-sm font-bold uppercase text-slate-300">
          Tabuľka predchádzajúceho dňa sa pripravuje.
        </p>
      ) : table.matches.length === 0 || table.rows.length === 0 ? (
        <p className="p-4 font-mono text-sm font-bold uppercase text-slate-300">
          Tabuľka je zatiaľ prázdna.
        </p>
      ) : (
        <div className="ticket-pan-frame ticket-pan-frame--table p-2 sm:p-4" {...scrollHandlers}>
          <table className="min-w-[760px] border-collapse font-mono text-[0.65rem] font-black uppercase sm:min-w-[920px] sm:text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-left text-yellow-300 sm:px-3">
                  Tipér
                </th>
                {table.matches.map((match) => (
                  <th
                    className="sticky top-0 z-10 min-w-28 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-left text-cyan-100 sm:min-w-36 sm:px-3"
                    key={match.matchId}
                  >
                    <span className="block whitespace-normal leading-tight">{match.label}</span>
                  </th>
                ))}
                <th className="sticky top-0 z-10 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-right text-yellow-300 sm:px-3">
                  Denná zmena
                </th>
                <th className="sticky top-0 z-10 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-right text-yellow-300 sm:px-3">
                  Celkový stav
                </th>
                <th className="sticky top-0 z-10 border-2 border-slate-600 bg-slate-950 px-2 py-2 text-right text-yellow-300 sm:px-3">
                  Bonus
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="sticky left-0 z-10 border-2 border-slate-600 bg-[#101923] px-2 py-2 text-left text-yellow-300 sm:px-3">
                  Výsledok
                </th>
                {table.matches.map((match) => (
                  <td
                    className="border-2 border-slate-600 bg-[#101923] px-2 py-2 text-cyan-100 sm:px-3"
                    key={`result-${match.matchId}`}
                  >
                    {match.finalScoreLabel}
                  </td>
                ))}
                <td className="border-2 border-slate-600 bg-[#101923] px-2 py-2 text-right text-slate-500 sm:px-3">
                  -
                </td>
                <td className="border-2 border-slate-600 bg-[#101923] px-2 py-2 text-right text-slate-500 sm:px-3">
                  -
                </td>
                <td className="border-2 border-slate-600 bg-[#101923] px-2 py-2 text-right text-slate-500 sm:px-3">
                  -
                </td>
              </tr>
              {table.rows.map((row) => (
                <tr key={row.playerId}>
                  <th className="sticky left-0 z-10 max-w-28 border-2 border-slate-600 bg-[#172331] px-2 py-2 text-left text-white sm:max-w-48 sm:px-3">
                    <span className="block whitespace-normal break-words">{row.playerName}</span>
                  </th>
                  {table.matches.map((match, index) => {
                    const cell = cellForMatch(row.cells, match.matchId, index);
                    return (
                      <td
                        className={
                          cell?.exactHit
                            ? "border-2 border-slate-600 bg-yellow-300 px-2 py-2 text-slate-950 sm:px-3"
                            : "border-2 border-slate-600 bg-[#172331] px-2 py-2 text-slate-100 sm:px-3"
                        }
                        key={`${row.playerId}-${match.matchId}`}
                      >
                        {cell ? (
                          <span className="grid gap-1">
                            <span className={cell.exactHit ? "whitespace-nowrap text-slate-950" : "whitespace-nowrap text-white"}>{cell.betLabel}</span>
                            <span className={`whitespace-nowrap ${cell.exactHit ? "text-emerald-800" : amountTone(cell.units)}`}>{cell.moneyLabel}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">bez tipu</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-2 border-slate-600 bg-[#172331] px-2 py-2 text-right text-yellow-200 sm:px-3">
                    {row.dailyTotalLabel}
                  </td>
                  <td className="border-2 border-slate-600 bg-[#172331] px-2 py-2 text-right text-yellow-200 sm:px-3">
                    {row.totalLabel}
                  </td>
                  <td className="border-2 border-slate-600 bg-[#172331] px-2 py-2 text-right text-cyan-100 sm:px-3">
                    {row.bonus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
