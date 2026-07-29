import { Medal, Trophy } from "lucide-react";
import { BadgeChipRack, type PlayerBadgeChip } from "@/features/badges/BadgeShowcase";

export type MainPodiumRow = {
  playerId: string;
  displayName: string;
  value: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  avatarLabel?: string;
  badges?: PlayerBadgeChip[];
};

type MainPodiumProps = {
  title: string;
  rows: MainPodiumRow[];
  eyebrow?: string;
  valueLabel?: string;
  emptyText?: string;
};

function BadgeWindow({ row, large }: { row: MainPodiumRow; large: boolean }) {
  return (
    <div
      className={`grid content-start gap-2 border-2 border-slate-600 bg-[#101923] p-2 ${
        large ? "min-h-28 w-full sm:min-h-36" : "min-h-20 min-w-24"
      }`}
    >
      <p className="font-mono text-[0.62rem] font-black uppercase text-slate-400">
        Odznaky
      </p>
      <BadgeChipRack
        badges={row.badges}
        emptyText="Zatiaľ bez odznaku"
        size={large ? "large" : "medium"}
      />
    </div>
  );
}

function PodiumSlot({
  row,
  rank
}: {
  row: MainPodiumRow;
  rank: 1 | 2 | 3;
}) {
  const isWinner = rank === 1;
  const shell = isWinner
    ? "min-h-56 border-yellow-300 bg-[#24313e] px-3 py-4 shadow-[5px_5px_0_#f43f5e] sm:min-h-72 sm:px-5 sm:py-5 sm:shadow-[7px_7px_0_#f43f5e]"
    : "min-h-36 border-cyan-300 bg-[#162433] px-3 py-3 shadow-[4px_4px_0_#020617] sm:min-h-44 sm:px-4 sm:py-4 sm:shadow-[5px_5px_0_#020617]";

  return (
    <article className={`min-w-0 overflow-hidden border-4 ${shell}`}>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black uppercase tracking-wider text-slate-300">
            #{rank}
          </p>
          <h3
            className={`mt-2 break-words font-black uppercase leading-none text-white [overflow-wrap:anywhere] ${
              isWinner ? "text-2xl sm:text-4xl" : "text-lg sm:text-2xl"
            }`}
          >
            {row.displayName}
          </h3>
        </div>
        {isWinner ? (
          <Trophy aria-hidden className="h-8 w-8 shrink-0 text-yellow-300" />
        ) : (
          <Medal aria-hidden className="h-6 w-6 shrink-0 text-cyan-200" />
        )}
      </div>

      <div
        className={`mt-4 grid gap-3 sm:mt-5 sm:gap-4 ${
          isWinner ? "sm:grid-cols-[1fr_1.1fr]" : "grid-cols-[auto_minmax(0,1fr)] items-end"
        }`}
      >
        <BadgeWindow large={isWinner} row={row} />
        <div className={`min-w-0 ${isWinner ? "text-left" : "text-right"}`}>
          <p className="font-mono text-xs font-black uppercase text-slate-300">
            {row.secondaryLabel ?? "Skóre"}
          </p>
          <p
            className={`break-words font-black leading-none text-yellow-200 [overflow-wrap:anywhere] ${
              isWinner ? "text-3xl sm:text-4xl" : "text-xl sm:text-3xl"
            }`}
          >
            {row.value}
          </p>
          {row.secondaryValue ? (
            <p className="mt-1 break-words font-mono text-xs font-bold uppercase text-cyan-100 [overflow-wrap:anywhere]">
              {row.secondaryValue}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MainPodium({
  title,
  rows,
  eyebrow = "Rebríček",
  valueLabel = "Výkon",
  emptyText = "Rebríček zatiaľ čaká na vyhodnotené dáta."
}: MainPodiumProps) {
  const [winner, second, third, ...rest] = rows;

  return (
    <section className="min-w-0 border-2 border-slate-700 bg-[#111820] text-white sm:border-4">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-700 bg-slate-950 px-3 py-2 sm:gap-3 sm:border-b-4 sm:px-4 sm:py-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-black uppercase leading-none sm:text-2xl">{title}</h2>
        </div>
        <span className="max-w-full break-words border-2 border-cyan-300 px-3 py-2 font-mono text-xs font-black uppercase text-cyan-100">
          {valueLabel}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="p-4 font-mono text-sm font-bold uppercase text-slate-300">{emptyText}</div>
      ) : (
        <div className="grid gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="grid gap-3 sm:gap-4">
            {winner ? <PodiumSlot rank={1} row={winner} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {second ? <PodiumSlot rank={2} row={second} /> : null}
              {third ? <PodiumSlot rank={3} row={third} /> : null}
            </div>
          </div>

          {rest.length > 0 ? (
            <ol className="grid gap-2">
              {rest.map((row, index) => (
                <li
                  className="grid grid-cols-[2.2rem_minmax(0,1fr)_minmax(4rem,auto)] items-center gap-2 border-2 border-slate-700 bg-[#172331] px-2 py-2 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(4.5rem,auto)] sm:gap-3 sm:px-3"
                  key={row.playerId}
                >
                  <span className="font-mono text-sm font-black uppercase text-yellow-300">
                    #{index + 4}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-black uppercase text-white">
                      {row.displayName}
                    </span>
                    <BadgeChipRack badges={row.badges} className="mt-1" />
                  </span>
                  <span className="min-w-0 break-words text-right font-mono text-sm font-black text-cyan-100 [overflow-wrap:anywhere]">
                    {row.value}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </section>
  );
}
