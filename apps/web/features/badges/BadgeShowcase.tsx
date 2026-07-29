import { Award, Crown, Sparkles } from "lucide-react";

export type BadgeKind = "result" | "bet";

export type BadgeBorderTone =
  | "orange"
  | "brown"
  | "yellow"
  | "green"
  | "blue"
  | "red"
  | "white";

export type BadgePerson = {
  playerId: string;
  displayName: string;
  avatarLabel?: string;
};

export type BadgeIndicator = {
  label: string;
  value: string;
};

export type PlayerBadgeChip = {
  badgeKey: string;
  title: string;
  explanation: string;
  emoji: string;
  kind: BadgeKind;
  borderTone: BadgeBorderTone;
};

export type BadgeShowcaseItem = {
  badgeKey: string;
  title: string;
  explanation: string;
  caption?: string;
  leader: BadgePerson;
  followers: BadgePerson[];
  indicators: BadgeIndicator[];
  kind?: BadgeKind;
  emoji?: string;
  border?: BadgeBorderTone;
  borderTone?: BadgeBorderTone;
  tone?: "hot" | "cold" | "gold";
};

type BadgeShowcaseProps = {
  badges: BadgeShowcaseItem[];
  title?: string;
  eyebrow?: string;
  emptyText?: string;
};

type BadgeChipRackProps = {
  badges?: PlayerBadgeChip[];
  className?: string;
  emptyText?: string;
  size?: "small" | "medium" | "large";
};

const borderClasses: Record<BadgeBorderTone, string> = {
  orange: "border-orange-300 shadow-[4px_4px_0_#fb923c]",
  brown: "border-amber-800 shadow-[4px_4px_0_#78350f]",
  yellow: "border-yellow-300 shadow-[4px_4px_0_#facc15]",
  green: "border-emerald-300 shadow-[4px_4px_0_#10b981]",
  blue: "border-cyan-300 shadow-[4px_4px_0_#38bdf8]",
  red: "border-red-300 shadow-[4px_4px_0_#fb7185]",
  white: "border-slate-100 shadow-[4px_4px_0_#64748b]"
};

const compactBorderClasses: Record<BadgeBorderTone, string> = {
  orange: "border-orange-300",
  brown: "border-amber-700",
  yellow: "border-yellow-300",
  green: "border-emerald-300",
  blue: "border-cyan-300",
  red: "border-red-300",
  white: "border-slate-100"
};

const frameClasses = {
  gold: "border-yellow-300 bg-yellow-300 text-slate-950 shadow-[3px_3px_0_#f43f5e]",
  silver: "border-slate-200 bg-slate-200 text-slate-950 shadow-[2px_2px_0_#38bdf8]",
  bronze: "border-orange-300 bg-orange-300 text-slate-950 shadow-[2px_2px_0_#78350f]",
  white: "border-slate-100 bg-[#101923] text-slate-50 shadow-[2px_2px_0_#64748b]"
};

function badgeKind(badge: BadgeShowcaseItem): BadgeKind {
  return badge.kind === "bet" ? "bet" : "result";
}

function badgeBorderTone(badge: BadgeShowcaseItem | PlayerBadgeChip): BadgeBorderTone {
  const tone = "borderTone" in badge ? badge.borderTone : undefined;
  const border = "border" in badge ? badge.border : undefined;
  return tone ?? border ?? (badgeKind(badge as BadgeShowcaseItem) === "bet" ? "white" : "yellow");
}

function badgeEmoji(badge: BadgeShowcaseItem | PlayerBadgeChip): string {
  return badge.emoji && badge.emoji.trim().length > 0 ? badge.emoji : "🏷️";
}

function chipTitle(badge: PlayerBadgeChip): string {
  return `${badge.title}: ${badge.explanation}`;
}

export function BadgeChip({ badge, size = "small" }: { badge: PlayerBadgeChip; size?: BadgeChipRackProps["size"] }) {
  const tone = badgeBorderTone(badge);
  const sizeClass =
    size === "large"
      ? "h-12 w-12 text-2xl"
      : size === "medium"
        ? "h-9 w-9 text-lg"
        : "h-6 w-6 text-sm";

  return (
    <span
      aria-label={chipTitle(badge)}
      className={`inline-flex shrink-0 items-center justify-center border-2 bg-[#101923] leading-none ${sizeClass} ${compactBorderClasses[tone]}`}
      title={chipTitle(badge)}
    >
      {badgeEmoji(badge)}
    </span>
  );
}

export function BadgeChipRack({
  badges = [],
  className = "",
  emptyText = "",
  size = "small"
}: BadgeChipRackProps) {
  if (badges.length === 0) {
    return emptyText ? (
      <span className={`font-mono text-[0.65rem] font-black uppercase text-slate-500 ${className}`}>
        {emptyText}
      </span>
    ) : null;
  }

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${className}`}>
      {badges.map((badge) => (
        <BadgeChip badge={badge} key={badge.badgeKey} size={size} />
      ))}
    </span>
  );
}

function BadgeEmojiFrame({
  badge,
  frame,
  size = "large"
}: {
  badge: Pick<BadgeShowcaseItem, "emoji" | "title">;
  frame: keyof typeof frameClasses;
  size?: "large" | "small";
}) {
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center border-4 leading-none ${
        size === "large" ? "h-20 w-20 text-4xl" : "h-10 w-10 text-xl"
      } ${frameClasses[frame]}`}
      title={badge.title}
    >
      {badgeEmoji(badge as BadgeShowcaseItem)}
    </div>
  );
}

function FollowerSlot({
  badge,
  follower,
  frame
}: {
  badge: BadgeShowcaseItem;
  follower: BadgePerson;
  frame: "silver" | "bronze";
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-2 border-slate-600 bg-[#101923] px-2 py-2">
      <BadgeEmojiFrame badge={badge} frame={frame} size="small" />
      <span className="min-w-0 truncate font-mono text-xs font-black uppercase text-slate-200">
        {follower.displayName}
      </span>
    </div>
  );
}

function ResultBadgeCard({ badge }: { badge: BadgeShowcaseItem }) {
  const tone = badgeBorderTone(badge);
  const caption = badge.caption ?? badge.explanation;

  return (
    <article
      className={`min-w-0 overflow-hidden border-4 bg-[#172331] p-3 sm:p-4 ${borderClasses[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
            <Crown aria-hidden className="h-4 w-4" />
            Výsledkový odznak
          </p>
          <h3 className="mt-2 break-words text-2xl font-black uppercase leading-none [overflow-wrap:anywhere] sm:text-3xl">
            {badge.title}
          </h3>
        </div>
        <BadgeEmojiFrame badge={badge} frame="gold" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="font-mono text-xs font-black uppercase text-slate-300">
            Aktuálny držiteľ
          </p>
          <p className="mt-1 break-words text-xl font-black uppercase text-white [overflow-wrap:anywhere] sm:text-2xl">
            {badge.leader.displayName}
          </p>
          <p className="mt-3 text-xs font-bold leading-snug text-slate-200 sm:text-sm">
            {caption}
          </p>
        </div>

        <div className="grid content-start gap-2">
          {badge.indicators.slice(0, 2).map((indicator) => (
            <div
              className="border-2 border-slate-600 bg-[#101923] px-3 py-2"
              key={indicator.label}
            >
              <p className="font-mono text-[0.65rem] font-black uppercase text-slate-400">
                {indicator.label}
              </p>
              <p className="break-words text-lg font-black text-cyan-100 [overflow-wrap:anywhere] sm:text-xl">
                {indicator.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {badge.followers.slice(0, 2).map((follower, index) => (
          <FollowerSlot
            badge={badge}
            follower={follower}
            frame={index === 0 ? "silver" : "bronze"}
            key={follower.playerId}
          />
        ))}
      </div>
    </article>
  );
}

function BetBadgeCard({ badge }: { badge: BadgeShowcaseItem }) {
  const indicator = badge.indicators[0];
  const caption = badge.caption ?? badge.explanation;

  return (
    <article className="min-w-0 border-2 border-slate-100 bg-[#172331] p-3 shadow-[3px_3px_0_#64748b]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[0.65rem] font-black uppercase tracking-wider text-slate-200">
            <Award aria-hidden className="h-4 w-4" />
            Tipérsky odznak
          </p>
          <h3 className="mt-2 break-words text-lg font-black uppercase leading-none text-white [overflow-wrap:anywhere] sm:text-xl">
            {badge.title}
          </h3>
          <p className="mt-2 font-mono text-[0.65rem] font-black uppercase tracking-wide text-slate-400">
            Aktuálny držiteľ
          </p>
          <p className="mt-1 break-words text-sm font-black uppercase leading-tight text-cyan-100 [overflow-wrap:anywhere]">
            {badge.leader.displayName}
          </p>
        </div>
        <BadgeEmojiFrame badge={badge} frame="white" size="small" />
      </div>

      <p className="mt-3 text-xs font-bold leading-snug text-slate-200">{caption}</p>

      {indicator ? (
        <div className="mt-3 border-2 border-slate-600 bg-[#101923] px-3 py-2">
          <p className="font-mono text-[0.65rem] font-black uppercase text-slate-400">
            {indicator.label}
          </p>
          <p className="break-words text-lg font-black text-cyan-100 [overflow-wrap:anywhere]">
            {indicator.value}
          </p>
        </div>
      ) : null}
    </article>
  );
}

export function BadgeShowcase({
  badges,
  title = "Odznaky",
  eyebrow = "Prémiové výkony",
  emptyText = "Odznaky sa zobrazia po aspoň dvoch relevantných vstupoch."
}: BadgeShowcaseProps) {
  const resultBadges = badges.filter((badge) => badgeKind(badge) === "result");
  const betBadges = badges.filter((badge) => badgeKind(badge) === "bet");

  return (
    <section className="border-2 border-slate-700 bg-[#111820] text-white sm:border-4">
      <header className="border-b-2 border-slate-700 bg-slate-950 px-3 py-2 sm:border-b-4 sm:px-4 sm:py-3">
        <p className="font-mono text-xs font-black uppercase tracking-wider text-yellow-300">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-black uppercase leading-none sm:text-2xl">{title}</h2>
      </header>

      {badges.length === 0 ? (
        <div className="p-4 font-mono text-sm font-bold uppercase text-slate-300">{emptyText}</div>
      ) : (
        <div className="grid gap-5 p-3 sm:p-4">
          {resultBadges.length > 0 ? (
            <section className="grid gap-3 md:grid-cols-2 md:gap-4">
              {resultBadges.map((badge) => (
                <ResultBadgeCard badge={badge} key={badge.badgeKey} />
              ))}
            </section>
          ) : null}

          {betBadges.length > 0 ? (
            <section className="grid gap-3 border-t-2 border-slate-700 pt-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <p className="flex items-center gap-2 font-mono text-xs font-black uppercase tracking-wider text-slate-200">
                  <Sparkles aria-hidden className="h-4 w-4" />
                  Tipérske odznaky
                </p>
              </div>
              {betBadges.map((badge) => (
                <BetBadgeCard badge={badge} key={badge.badgeKey} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
