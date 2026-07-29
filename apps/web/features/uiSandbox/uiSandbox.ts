"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TOURNAMENT_KEY, LONG_TERM_PREDICTION_SLOTS, resolveTournamentTeamDisplay } from "@tipparta/shared";
import type { BadgeShowcaseItem, PlayerBadgeChip } from "@/features/badges/BadgeShowcase";
import type { PlayerDocument } from "@/features/players/playerRepository";
import type {
  MatchDocument,
  TicketDocument,
  TicketFeedPlayer,
  TicketFeedState,
  TicketSnapshotDocument
} from "@/features/tickets/ticketRepository";
import type { ResultsPageData, ResultsRecord } from "@/features/results/resultsRepository";

const STORAGE_KEY = "tipparta.uiSandbox.enabled";
const CHANGE_EVENT = "tipparta-ui-sandbox-change";
const TOURNAMENT_ID = DEFAULT_TOURNAMENT_KEY;

type DemoPlayerSeed = {
  id: string;
  displayName: string;
  registrationOrder: number;
  avatarLabel: string;
};

type DemoMatchSeed = {
  id: string;
  home: string;
  away: string;
  time: string;
  status: MatchDocument["status"];
  final?: { home: number; away: number };
  current?: { home: number; away: number };
};

const DEMO_PLAYERS: DemoPlayerSeed[] = [
  { id: "ui-marek", displayName: "Marek Turbo", registrationOrder: 2, avatarLabel: "MT" },
  { id: "ui-lucia", displayName: "Lucia VAR", registrationOrder: 3, avatarLabel: "LV" },
  { id: "ui-robo", displayName: "Robo Replay", registrationOrder: 4, avatarLabel: "RR" },
  { id: "ui-palo", displayName: "Palo Kridlo", registrationOrder: 5, avatarLabel: "PK" },
  { id: "ui-nina", displayName: "Nina Pressing", registrationOrder: 6, avatarLabel: "NP" },
  { id: "ui-david", displayName: "David Aut", registrationOrder: 7, avatarLabel: "DA" },
  { id: "ui-juraj", displayName: "Juraj Chripko", registrationOrder: 8, avatarLabel: "JC" },
  { id: "ui-ivan", displayName: "Ivan Beton", registrationOrder: 9, avatarLabel: "IB" },
  { id: "ui-zuzana", displayName: "Zuzana Replayova", registrationOrder: 10, avatarLabel: "ZR" },
  { id: "ui-tomas", displayName: "Tomas Kanon", registrationOrder: 11, avatarLabel: "TK" },
  { id: "ui-peter", displayName: "Peter Antena", registrationOrder: 12, avatarLabel: "PA" }
];

const LOCKED_MATCHES: DemoMatchSeed[] = [
  { id: "ui-m01", home: "POR", away: "CZE", time: "2026-06-08T15:00:00.000Z", status: "live", current: { home: 1, away: 0 } },
  { id: "ui-m02", home: "USA", away: "GER", time: "2026-06-08T15:30:00.000Z", status: "live", current: { home: 0, away: 0 } },
  { id: "ui-m03", home: "BRA", away: "EGY", time: "2026-06-08T16:00:00.000Z", status: "finished", final: { home: 2, away: 1 } },
  { id: "ui-m04", home: "ARG", away: "HON", time: "2026-06-08T16:30:00.000Z", status: "scheduled" },
  { id: "ui-m05", home: "MAR", away: "NOR", time: "2026-06-08T17:00:00.000Z", status: "scheduled" },
  { id: "ui-m06", home: "ECU", away: "GUA", time: "2026-06-08T18:00:00.000Z", status: "scheduled" },
  { id: "ui-m07", home: "COL", away: "JOR", time: "2026-06-08T19:00:00.000Z", status: "scheduled" },
  { id: "ui-m08", home: "VEN", away: "TUR", time: "2026-06-08T20:00:00.000Z", status: "scheduled" },
  { id: "ui-m09", home: "CUW", away: "ARU", time: "2026-06-08T21:00:00.000Z", status: "scheduled" },
  { id: "ui-m10", home: "CRO", away: "SVN", time: "2026-06-08T22:00:00.000Z", status: "scheduled" },
  { id: "ui-m11", home: "DEN", away: "UKR", time: "2026-06-08T23:30:00.000Z", status: "scheduled" },
  { id: "ui-m12", home: "KOS", away: "AND", time: "2026-06-09T00:00:00.000Z", status: "scheduled" },
  { id: "ui-m13", home: "OMA", away: "MOZ", time: "2026-06-09T01:00:00.000Z", status: "scheduled" },
  { id: "ui-m14", home: "ENG", away: "NZL", time: "2026-06-09T01:30:00.000Z", status: "scheduled" },
  { id: "ui-m15", home: "PAN", away: "BIH", time: "2026-06-09T02:00:00.000Z", status: "scheduled" },
  { id: "ui-m16", home: "QAT", away: "SLV", time: "2026-06-09T02:30:00.000Z", status: "scheduled" },
  { id: "ui-m17", home: "CPV", away: "BMU", time: "2026-06-09T03:00:00.000Z", status: "scheduled" },
  { id: "ui-m18", home: "SUI", away: "AUS", time: "2026-06-09T03:30:00.000Z", status: "scheduled" }
];

const OPEN_MATCHES: DemoMatchSeed[] = [
  { id: "ui-o01", home: "FRA", away: "BEL", time: "2026-06-10T16:00:00.000Z", status: "scheduled" },
  { id: "ui-o02", home: "ESP", away: "NED", time: "2026-06-10T17:00:00.000Z", status: "scheduled" },
  { id: "ui-o03", home: "CZE", away: "SWE", time: "2026-06-10T18:00:00.000Z", status: "scheduled" },
  { id: "ui-o04", home: "MEX", away: "CAN", time: "2026-06-10T19:00:00.000Z", status: "scheduled" },
  { id: "ui-o05", home: "URU", away: "JPN", time: "2026-06-10T20:00:00.000Z", status: "scheduled" },
  { id: "ui-o06", home: "IRN", away: "KOR", time: "2026-06-10T21:00:00.000Z", status: "scheduled" }
];

function notifySandboxChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function enableUiSandbox() {
  window.localStorage.setItem(STORAGE_KEY, "1");
  notifySandboxChange();
}

export function clearUiSandbox() {
  window.localStorage.removeItem(STORAGE_KEY);
  notifySandboxChange();
}

function hasUiSandboxQuery(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("uiTest") === "1" || params.get("ui_test") === "1";
}

export function isUiSandboxEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (hasUiSandboxQuery() || window.localStorage.getItem(STORAGE_KEY) === "1")
  );
}

export function subscribeUiSandboxChange(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useUiSandboxEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (hasUiSandboxQuery()) {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }

    const update = () => setEnabled(isUiSandboxEnabled());
    update();
    return subscribeUiSandboxChange(update);
  }, []);

  return enabled;
}

function playerToFeedPlayer(player: PlayerDocument): TicketFeedPlayer {
  return {
    ...player,
    avatarLabel: player.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
  } as TicketFeedPlayer;
}

function buildPlayers(currentPlayer?: PlayerDocument): TicketFeedPlayer[] {
  const current = currentPlayer
    ? playerToFeedPlayer({
        ...currentPlayer,
        isPlayer: true,
        registrationOrder: currentPlayer.registrationOrder || 1
      })
    : null;

  const players: TicketFeedPlayer[] = [];
  if (current) {
    players.push(current);
  }

  for (const seed of DEMO_PLAYERS) {
    if (seed.id === current?.id) {
      continue;
    }
    players.push({
      id: seed.id,
      email: `${seed.id}@tipparta.test`,
      displayName: seed.displayName,
      role: "player",
      isPlayer: true,
      status: "active",
      blocked: false,
      paymentStatus: "paid",
      registrationOrder: seed.registrationOrder,
      createdAt: "2026-06-08T10:00:00.000Z",
      updatedAt: "2026-06-08T10:00:00.000Z",
      avatarLabel: seed.avatarLabel
    } as TicketFeedPlayer);
  }

  return players;
}

function matchFromSeed(seed: DemoMatchSeed, ticketId: string): MatchDocument {
  return {
    id: seed.id,
    tournamentId: TOURNAMENT_ID,
    ticketId,
    homeTeamCode: seed.home,
    awayTeamCode: seed.away,
    kickoffAtUtc: seed.time,
    kickoffAtSk: seed.time,
    officialMatchdayKey: ticketId.includes("locked") ? "2026-06-08" : "2026-06-10",
    status: seed.status,
    ...(seed.final ? { finalScore: seed.final } : {}),
    ...(seed.current ? { currentScore: seed.current } : {}),
    providerStatus: null,
    settlementTriggerStatus: null
  };
}

function scoreFor(playerIndex: number, matchIndex: number): { home: number; away: number } {
  const home = (playerIndex * 2 + matchIndex + 1) % 4;
  const away = (playerIndex + matchIndex * 2) % 4;

  if ((playerIndex + matchIndex) % 7 === 0) {
    return { home: 1, away: 1 };
  }

  if ((playerIndex + matchIndex) % 5 === 0) {
    return { home: 2, away: 0 };
  }

  return { home, away };
}

function moneyLabel(units: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(units * 0.05);
}

function badgePerson(player: TicketFeedPlayer) {
  return {
    playerId: player.id,
    displayName: player.displayName,
    ...("avatarLabel" in player && typeof player.avatarLabel === "string"
      ? { avatarLabel: player.avatarLabel }
      : {})
  };
}

function badgeChipFromShowcase(badge: BadgeShowcaseItem): PlayerBadgeChip {
  return {
    badgeKey: badge.badgeKey,
    title: badge.title,
    explanation: badge.caption ?? badge.explanation,
    emoji: badge.emoji ?? "🏷️",
    kind: badge.kind === "bet" ? "bet" : "result",
    borderTone: badge.borderTone ?? badge.border ?? (badge.kind === "bet" ? "white" : "yellow")
  };
}

function badgeChipsByPlayerId(badges: BadgeShowcaseItem[]): Map<string, PlayerBadgeChip[]> {
  const byPlayer = new Map<string, PlayerBadgeChip[]>();
  for (const badge of badges) {
    const current = byPlayer.get(badge.leader.playerId) ?? [];
    current.push(badgeChipFromShowcase(badge));
    byPlayer.set(badge.leader.playerId, current);
  }
  return byPlayer;
}

function assignBadgesToPlayers(
  players: TicketFeedPlayer[],
  badges: BadgeShowcaseItem[]
): TicketFeedPlayer[] {
  const chipsByPlayer = badgeChipsByPlayerId(badges);
  return players.map((player) => ({
    ...player,
    badges: chipsByPlayer.get(player.id) ?? []
  }));
}

function buildDemoBadges(players: TicketFeedPlayer[]): BadgeShowcaseItem[] {
  const pick = (index: number) => players[index % players.length] ?? players[0]!;

  const resultBadges: Array<{
    badgeKey: string;
    title: string;
    caption: string;
    emoji: string;
    borderTone: BadgeShowcaseItem["borderTone"];
    indicators: BadgeShowcaseItem["indicators"];
  }> = [
    {
      badgeKey: "na_ohni",
      title: "Na ohni",
      caption: "Najdlhšia séria kladných denných tiketov s najväčším ziskom za toto obdobie.",
      emoji: "🔥",
      borderTone: "orange",
      indicators: [
        { label: "Dni na ohni", value: "3" },
        { label: "Vyhral počas obdobia", value: moneyLabel(410) }
      ]
    },
    {
      badgeKey: "v_bahne",
      title: "V bahne",
      caption: "Najdlhšia séria záporných denných tiketov s najväčšou stratou za toto obdobie.",
      emoji: "🟤",
      borderTone: "brown",
      indicators: [
        { label: "Dni v bahne", value: "2" },
        { label: "Prehral počas obdobia", value: moneyLabel(260) }
      ]
    },
    {
      badgeKey: "remizovy_prorok",
      title: "Remízový prorok",
      caption: "Najväčší zisk na zápasoch, ktoré skončili remízou.",
      emoji: "⚖️",
      borderTone: "yellow",
      indicators: [
        { label: "Celkový zisk na remízových zápasoch", value: moneyLabel(1120) },
        { label: "Počet výherných remízových zápasov", value: "5" }
      ]
    },
    {
      badgeKey: "osamely_strelec",
      title: "Osamelý strelec",
      caption: "Najvyšší zisk na zápasoch, v ktorých nikto iný netipoval toho istého víťaza/remízu.",
      emoji: "🎯",
      borderTone: "green",
      indicators: [
        { label: "Počet takýchto výherných zápasov", value: "4" },
        { label: "Celkový zisk na týchto zápasoch", value: moneyLabel(780) }
      ]
    },
    {
      badgeKey: "golovy_chirurg",
      title: "Gólový chirurg",
      caption: "Najnižší priemerný rozdiel natipovaného skóre od skutočného výsledku.",
      emoji: "🩺",
      borderTone: "blue",
      indicators: [
        { label: "Priemerná gólová odchýlka za zápas", value: "0.8" },
        { label: "Celkový rozdiel v natipovaných góloch", value: "7" }
      ]
    },
    {
      badgeKey: "vstal_z_popola",
      title: "Vstal z popola",
      caption: "Vrátil sa z hlbokého mínusu do plusových hodnôt.",
      emoji: "🌅",
      borderTone: "green",
      indicators: [
        { label: "Rozdiel medzi súčasnou bilanciou a najhorším stavom", value: moneyLabel(940) },
        { label: "Najhoršia negatívna bilancia", value: moneyLabel(-720) }
      ]
    },
    {
      badgeKey: "bez_padaka",
      title: "Bez padáka",
      caption: "Spadol z výrazných plusových hodnôt do mínusu.",
      emoji: "🪂",
      borderTone: "red",
      indicators: [
        { label: "Rozdiel medzi súčasnou bilanciou a najlepším stavom", value: moneyLabel(860) },
        { label: "Najlepšia pozitívna bilancia", value: moneyLabel(650) }
      ]
    },
    {
      badgeKey: "dedinsky_divak",
      title: "Dedinský divák",
      caption: "Celkový zisk zo zápasov, v ktorom hrajú outsideri.",
      emoji: "📺",
      borderTone: "yellow",
      indicators: [
        { label: "Celkový zisk", value: moneyLabel(830) },
        { label: "Počet výherných zápasov", value: "7" }
      ]
    },
    {
      badgeKey: "expert_pod_reflektormi",
      title: "Expert pod reflektormi",
      caption: "Celkový zisk zo zápasov, v ktorom hrajú favoriti.",
      emoji: "🔦",
      borderTone: "blue",
      indicators: [
        { label: "Celkový zisk", value: moneyLabel(760) },
        { label: "Počet výherných zápasov", value: "6" }
      ]
    },
    {
      badgeKey: "pivo_a_sandale",
      title: "Pivo a sandále",
      caption: "Celkový zisk zo zápasov Českej Republiky.",
      emoji: "🍺",
      borderTone: "yellow",
      indicators: [
        { label: "Celkový zisk", value: moneyLabel(520) },
        { label: "Počet výherných zápasov", value: "3" }
      ]
    },
    {
      badgeKey: "konzervativec",
      title: "Konzervatívec",
      caption: "Najvyšší zisk z jedného konkrétneho natipovaného skóre.",
      emoji: "🧱",
      borderTone: "green",
      indicators: [
        { label: "Osvedčený výsledok", value: "1:0" },
        { label: "Celkový zisk z tohto výsledku", value: moneyLabel(576) }
      ]
    },
    {
      badgeKey: "tvrdohlavec",
      title: "Tvrdohlavec",
      caption: "Najväčšia strata z jedného konkrétneho natipovaného skóre.",
      emoji: "🪨",
      borderTone: "red",
      indicators: [
        { label: "Neosvedčený výsledok", value: "0:1" },
        { label: "Celková strata z tohto výsledku", value: moneyLabel(770) }
      ]
    },
    {
      badgeKey: "nocny_hrdina",
      title: "Nočný hrdina",
      caption: "Najvyšší zisk zo zápasov začínajúcich po polnoci slovenského času.",
      emoji: "🌙",
      borderTone: "blue",
      indicators: [
        { label: "Celkový zisk", value: moneyLabel(533) },
        { label: "Počet výherných nočných zápasov", value: "5" }
      ]
    },
    {
      badgeKey: "smoliar",
      title: "Smoliar",
      caption: "Najviac presných tipov, ktoré ušli len o jediný gól.",
      emoji: "🍀",
      borderTone: "red",
      indicators: [
        { label: "Počet takmer-presných tipov", value: "12" },
        { label: "Celková bilancia z týchto zápasov", value: moneyLabel(-120) }
      ]
    },
    {
      badgeKey: "takticky_genius",
      title: "Taktický génius",
      caption: "Hráč, ktorý najviac získava na zápasoch, ktoré končia inak ako predpokladá väčšina tipérov.",
      emoji: "♟️",
      borderTone: "green",
      indicators: [
        { label: "Počet výherných zápasov, v ktorých väčšina tipovala iného víťaza/remízu", value: "3" },
        { label: "Celkový zisk na zápasoch, v ktorých väčšina tipovala iného víťaza/remízu", value: moneyLabel(790) }
      ]
    },
    {
      badgeKey: "lovec_sokov",
      title: "Lovec šokov",
      caption: "Najväčší zisk zo zápasov, kde favorit zaváhal.",
      emoji: "⚡",
      borderTone: "yellow",
      indicators: [
        { label: "Počet takýchto výherných zápasov", value: "4" },
        { label: "Celkový zisk", value: moneyLabel(690) }
      ]
    },
    {
      badgeKey: "strazca_istot",
      title: "Strážca istôt",
      caption: "Najväčší zisk zo zápasov, kde favorit vyhral ako sa očakávalo.",
      emoji: "🛡️",
      borderTone: "blue",
      indicators: [
        { label: "Počet takýchto výherných zápasov", value: "8" },
        { label: "Celkový zisk", value: moneyLabel(710) }
      ]
    },
    {
      badgeKey: "rozdielovy_mag",
      title: "Rozdielový mág",
      caption: "Najväčší zisk z nepresných tipov, ale so správne natipovaným gólovým rozdielom.",
      emoji: "🪄",
      borderTone: "yellow",
      indicators: [
        { label: "Počet takýchto výherných zápasov", value: "5" },
        { label: "Celková výhra", value: moneyLabel(620) }
      ]
    },
    {
      badgeKey: "zberatel_drobnych",
      title: "Zberateľ drobných",
      caption: "Najväčší celkový zisk zo zápasov, kde bola výhra menšia ako 10€.",
      emoji: "🪙",
      borderTone: "blue",
      indicators: [
        { label: "Počet drobných výhier", value: "11" },
        { label: "Celkový zisk z týchto zápasov", value: moneyLabel(1249) }
      ]
    },
    {
      badgeKey: "najcastejsi_vitaz",
      title: "Najčastejší víťaz",
      caption: "Najvyšší celkový počet výherných tipov.",
      emoji: "🏆",
      borderTone: "green",
      indicators: [
        { label: "Počet výherných tipov", value: "16" },
        { label: "Počet nevýherných tipov", value: "8" }
      ]
    }
  ];

  const betBadges: Array<{
    badgeKey: string;
    title: string;
    caption: string;
    emoji: string;
    indicators: BadgeShowcaseItem["indicators"];
  }> = [
    {
      badgeKey: "miluje_prekvapenia",
      title: "Miluje prekvapenia",
      caption: "Najčastejšie tipuje zaváhanie favorita alebo výhru outsidera.",
      emoji: "🎲",
      indicators: [{ label: "Celkový počet takýchto tipov", value: "7" }]
    },
    {
      badgeKey: "neveri_zazrakom",
      title: "Neverí zázrakom",
      caption: "Najčastejšie tipuje výhru favorita alebo prehru outsidera.",
      emoji: "🔒",
      indicators: [{ label: "Celkový počet takýchto tipov", value: "10" }]
    },
    {
      badgeKey: "parkuje_autobus",
      title: "Parkuje autobus",
      caption: "Najnižší priemerný počet natipovaných gólov.",
      emoji: "🚌",
      indicators: [{ label: "Priemer gólov", value: "1.7" }]
    },
    {
      badgeKey: "tipuje_hadzanu",
      title: "Tipuje hádzanú",
      caption: "Najvyšší priemerný počet natipovaných gólov.",
      emoji: "🤾",
      indicators: [{ label: "Priemer gólov", value: "4.8" }]
    },
    {
      badgeKey: "skenuje_a_kopiruje",
      title: "Skenuje a kopíruje",
      caption: "Najčastejšie natipuje najpopulárnejší tip v zápase.",
      emoji: "📋",
      indicators: [{ label: "Počet kópií", value: "13" }]
    },
    {
      badgeKey: "vlastnou_hlavou",
      title: "Vlastnou hlavou",
      caption: "Najčastejšie zvolí tip, ktorý nikto iný nedal.",
      emoji: "🧠",
      indicators: [{ label: "Počet unikátov", value: "9" }]
    },
    {
      badgeKey: "pouziva_sablony",
      title: "Používa šablóny",
      caption: "Najviac opakuje jeden konkrétny tip.",
      emoji: "📐",
      indicators: [{ label: "Šablóna", value: "1:0" }]
    },
    {
      badgeKey: "neriadena_strela",
      title: "Neriadená strela",
      caption: "Používa najpestrejšiu sadu rôznych tipov skóre.",
      emoji: "🚀",
      indicators: [{ label: "Počet rôznych tipov", value: "14" }]
    },
    {
      badgeKey: "zaokruhluje",
      title: "Zaokrúhľuje",
      caption: "Najčastejšie tipuje nulu aspoň na jednej strane.",
      emoji: "⭕",
      indicators: [{ label: "Počet tipov s nulou", value: "16" }]
    },
    {
      badgeKey: "ide_proti_prudu",
      title: "Ide proti prúdu",
      caption: "Najčastejšie zvolí iný výsledkový smer ako väčšina tipérov.",
      emoji: "🧭",
      indicators: [{ label: "Počet odvážnych tipov", value: "6" }]
    }
  ];

  return [
    ...resultBadges.map((badge, index): BadgeShowcaseItem => ({
      ...badge,
      explanation: badge.caption,
      kind: "result",
      leader: badgePerson(pick(index)),
      followers: [pick(index + 1), pick(index + 2)].map(badgePerson)
    })),
    ...betBadges.map((badge, index): BadgeShowcaseItem => ({
      ...badge,
      explanation: badge.caption,
      kind: "bet",
      borderTone: "white",
      leader: badgePerson(pick(index + 3)),
      followers: []
    }))
  ];
}

export function buildUiSandboxTicketFeedState(currentPlayer?: PlayerDocument): TicketFeedState {
  const rawPlayers = buildPlayers(currentPlayer);
  const demoBadges = buildDemoBadges(rawPlayers);
  const players = assignBadgesToPlayers(rawPlayers, demoBadges);
  const playersById = Object.fromEntries(players.map((player) => [player.id, player]));
  const lockedTicketId = "ui-locked-prehlad";
  const openTicketId = "ui-open-ticket";
  const lockedMatches = LOCKED_MATCHES.map((seed) => matchFromSeed(seed, lockedTicketId));
  const openMatches = OPEN_MATCHES.map((seed) => matchFromSeed(seed, openTicketId));

  const tickets: TicketDocument[] = [
    {
      id: lockedTicketId,
      tournamentId: TOURNAMENT_ID,
      label: "UI test prehladu",
      officialMatchdayKey: "2026-06-08",
      lockAt: "2026-06-08T15:00:00.000Z",
      lockAtUtc: "2026-06-08T15:00:00.000Z",
      lockAtSk: "17:00",
      status: "locked",
      matchIds: lockedMatches.map((match) => match.id),
      lockedAt: "2026-06-08T15:00:00.000Z",
      lockedAtUtc: "2026-06-08T15:00:00.000Z"
    },
    {
      id: openTicketId,
      tournamentId: TOURNAMENT_ID,
      label: "UI test otvoreny listok",
      officialMatchdayKey: "2026-06-10",
      lockAt: "2026-06-10T15:00:00.000Z",
      lockAtUtc: "2026-06-10T15:00:00.000Z",
      lockAtSk: "17:00",
      status: "open",
      matchIds: openMatches.map((match) => match.id)
    }
  ];

  const bets = players.flatMap((player, playerIndex) =>
    lockedMatches.map((match, matchIndex) => ({
      playerId: player.id,
      matchId: match.id,
      registrationOrder: player.registrationOrder,
      score: scoreFor(playerIndex, matchIndex)
    }))
  );

  const snapshot: TicketSnapshotDocument = {
    ticketId: lockedTicketId,
    lockedAt: "2026-06-08T15:00:00.000Z",
    matchIds: lockedMatches.map((match) => match.id),
    playerIds: players.map((player) => player.id),
    bets
  };

  const currentPlayerId = currentPlayer?.id ?? players[0]?.id ?? "ui-marek";
  const ownBetsByMatchId = Object.fromEntries(
    openMatches.slice(0, 3).map((match, index) => [
      match.id,
      {
        id: `${currentPlayerId}_${match.id}`,
        playerId: currentPlayerId,
        ticketId: openTicketId,
        matchId: match.id,
        score: scoreFor(0, index),
        submittedAt: "2026-06-08T12:00:00.000Z",
        updatedAt: "2026-06-08T12:00:00.000Z"
      }
    ])
  );

  return {
    tickets,
    matchesByTicketId: {
      [lockedTicketId]: lockedMatches,
      [openTicketId]: openMatches
    },
    ownBetsByMatchId,
    snapshotsByTicketId: {
      [lockedTicketId]: snapshot
    },
    ownLongTermPicksByTicketId: {},
    longTermSnapshotsByTicketId: {},
    players,
    playersById
  };
}

function resultMatches() {
  return LOCKED_MATCHES.slice(0, 12).map((match, index) => ({
    matchId: match.id,
    label: `${match.home} - ${match.away}`,
    finalScoreLabel: `${(index + 1) % 4}:${(index * 2) % 3}`
  }));
}

export function buildUiSandboxResultsPageData(currentPlayer?: PlayerDocument): ResultsPageData {
  const rawPlayers = buildPlayers(currentPlayer);
  const demoBadges = buildDemoBadges(rawPlayers);
  const players = assignBadgesToPlayers(rawPlayers, demoBadges);
  const matches = resultMatches();
  const rows = players.slice(0, 9).map((player, playerIndex) => {
    const dailyUnits = 140 - playerIndex * 35 + (playerIndex % 2 === 0 ? 20 : -15);
    return {
      playerId: player.id,
      playerName: player.displayName,
      cells: matches.map((match, matchIndex) => {
        const units = ((playerIndex + matchIndex) % 5) * 20 - 40;
        const exactHit = (playerIndex + matchIndex) % 9 === 0;
        return {
          matchId: match.matchId,
          betLabel: `${(playerIndex + matchIndex + 1) % 4}:${(playerIndex * 2 + matchIndex) % 4}`,
          units,
          moneyLabel: moneyLabel(units),
          ...(exactHit ? { exactHit: true } : {})
        };
      }),
      dailyTotalLabel: moneyLabel(dailyUnits),
      totalLabel: moneyLabel(240 - playerIndex * 42),
      bonus: String(Math.max(0, 8 - playerIndex))
    };
  });

  const leaderboard = players.slice(0, 9).map((player, index) => ({
    playerId: player.id,
    displayName: player.displayName,
    registrationOrder: player.registrationOrder,
    avatarLabel: "avatarLabel" in player ? String(player.avatarLabel) : undefined,
    badges: player.badges ?? [],
    units: 860 - index * 90,
    exactHits: Math.max(0, 11 - index)
  }));

  const recordRowsFromPlayers = (source: string, value: (index: number) => string) =>
    players.slice(0, 5).map((player, index) => ({
      label: player.displayName,
      sourceId: `${source}-${index}`,
      sourceLabel: `${8 + index}. jún`,
      value: value(index),
      detail: "UI test"
    }));

  const recordRowsFromMatches = (source: string, value: (index: number) => string) =>
    matches.slice(0, 5).map((match, index) => ({
      label: match.label,
      sourceId: `${source}-${match.matchId}`,
      sourceLabel: match.finalScoreLabel,
      value: value(index),
      detail: "UI test"
    }));

  const records: ResultsRecord[] = [
    {
      recordKey: "najvyssia_vyhra_za_den",
      title: "Najvyššia výhra za deň",
      rows: recordRowsFromPlayers("record-win", (index) => moneyLabel(920 - index * 110))
    },
    {
      recordKey: "najvacsia_prehra_za_den",
      title: "Najväčšia prehra za deň",
      rows: recordRowsFromPlayers("record-loss", (index) => moneyLabel(-760 + index * 95))
    },
    {
      recordKey: "najlukrativnejsi_zapas",
      title: "Najlukratívnejší zápas",
      rows: recordRowsFromMatches("record-match-win", (index) => moneyLabel(340 - index * 25))
    },
    {
      recordKey: "najviac_presnych_tipov_za_den",
      title: "Najviac presných tipov za deň",
      rows: recordRowsFromPlayers("record-exact-day", (index) => `${8 - index} presných zásahov`)
    },
    {
      recordKey: "najvacsi_denny_skok_v_rebricku",
      title: "Najväčší denný skok v rebríčku",
      rows: recordRowsFromPlayers("record-jump", (index) => `+${7 - index} miest`)
    },
    {
      recordKey: "najvyrovnanejsi_den",
      title: "Najvyrovnanejší deň",
      rows: [0, 1, 2, 3, 4].map((index) => ({
        date: `${8 + index}. jún`,
        label: "Partia",
        sourceId: `record-balanced-${index}`,
        sourceLabel: `${8 + index}. jún`,
        value: moneyLabel(140 + index * 25),
        detail: "rozpätie dňa"
      }))
    },
    {
      recordKey: "najjednotnejsi_zapas",
      title: "Najjednotnejší zápas",
      rows: recordRowsFromMatches("record-unified", (index) => `${9 - index}x rovnaký tip`)
    },
    {
      recordKey: "najrozbitejsi_zapas",
      title: "Najrozbitejší zápas",
      rows: recordRowsFromMatches("record-chaos", (index) => `${10 - index} rôznych tipov`)
    },
    {
      recordKey: "najpresnejsi_den_partie",
      title: "Najpresnejší deň partie",
      rows: [0, 1, 2, 3, 4].map((index) => ({
        date: `${8 + index}. jún`,
        label: "Partia",
        sourceId: `record-party-exact-${index}`,
        sourceLabel: `${8 + index}. jún`,
        value: `${12 - index} presných tipov`,
        detail: "porovnanie dní"
      }))
    }
  ];

  return {
    leaderboards: {
      total: leaderboard,
      daily: leaderboard.slice().reverse(),
      exact: leaderboard
    },
    badges: demoBadges,
    records,
    previousDayTicket: {
      ticketId: "ui-previous-day",
      label: "UI test vyhodnotenia",
      settledAt: "2026-06-08T23:00:00.000Z",
      tournamentId: TOURNAMENT_ID
    },
    previousDayTable: {
      ticketId: "ui-previous-day",
      label: "UI test vyhodnotenia",
      matches,
      rows
    },
    longTermOverview: {
      ticketId: "ui-long-term",
      label: "Dlhodobé tipy",
      lockedAt: "2026-06-28T16:00:00.000Z",
      slots: LONG_TERM_PREDICTION_SLOTS.map((slot) => ({ ...slot })),
      rows: rawPlayers.map((player, index) => {
        const picks = [
          ["ARG", "BRA", "FRA", "GER"],
          ["BRA", "ARG", "ESP", "ENG"],
          ["FRA", "GER", "ARG", "POR"],
          ["ENG", "FRA", "BRA", "NED"]
        ][index % 4];

        return {
          playerId: player.id,
          playerName: player.displayName,
          picks: {
            champion: resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, picks[0]),
            second: resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, picks[1]),
            third: resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, picks[2]),
            fourth: resolveTournamentTeamDisplay(DEFAULT_TOURNAMENT_KEY, picks[3])
          }
        };
      })
    }
  };
}

export function useUiSandboxTicketFeedState(player: PlayerDocument | null): TicketFeedState | null {
  const enabled = useUiSandboxEnabled();

  return useMemo(() => {
    if (!enabled || !player) {
      return null;
    }
    return buildUiSandboxTicketFeedState(player);
  }, [enabled, player]);
}

export function useUiSandboxResultsPageData(): ResultsPageData | null {
  const enabled = useUiSandboxEnabled();

  return useMemo(() => {
    return enabled ? buildUiSandboxResultsPageData() : null;
  }, [enabled]);
}
