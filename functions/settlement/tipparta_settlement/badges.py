from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Callable


@dataclass(frozen=True)
class PlayerStanding:
    player_id: str
    registration_order: int


@dataclass(frozen=True)
class DailyPlayerResult:
    player_id: str
    ticket_id: str
    date: str
    units: int
    exact_hits: int = 0
    rank_before: int | None = None
    rank_after: int | None = None


@dataclass(frozen=True)
class MatchPlayerResult:
    player_id: str
    match_id: str
    ticket_id: str
    date: str
    units: int
    exact_hit: bool
    bet_home: int | None = None
    bet_away: int | None = None
    final_home: int | None = None
    final_away: int | None = None
    bet_outcome: str | None = None
    final_outcome: str | None = None
    kickoff_at_sk: str | None = None
    home_tier: str | None = None
    away_tier: str | None = None
    home_code: str | None = None
    away_code: str | None = None


@dataclass(frozen=True)
class BetPlayerPrediction:
    player_id: str
    match_id: str
    ticket_id: str
    date: str
    bet_home: int
    bet_away: int
    home_tier: str | None = None
    away_tier: str | None = None


BadgeDict = dict[str, object]
Candidate = tuple[str, tuple[float | int, ...], list[dict[str, str]]]
Calculator = Callable[
    [list[PlayerStanding], list[DailyPlayerResult], list[MatchPlayerResult], str],
    BadgeDict | None,
]


RESULT_BADGE_METADATA = {
    "na_ohni": {
        "name": "Na ohni",
        "kind": "result",
        "description": "Najdlhšia séria kladných denných lístkov.",
        "implemented": True,
    },
    "v_bahne": {
        "name": "V bahne",
        "kind": "result",
        "description": "Najdlhšia séria záporných denných lístkov.",
        "implemented": True,
    },
    "golovy_chirurg": {
        "name": "Gólový chirurg",
        "kind": "result",
        "description": "Najnižšia priemerná chyba v presnom skóre.",
        "implemented": True,
    },
    "vstal_z_popola": {
        "name": "Vstal z popola",
        "kind": "result",
        "description": "Najsilnejší návrat z hlbokého mínusu do plusu.",
        "implemented": True,
    },
    "bez_padaka": {
        "name": "Bez padáka",
        "kind": "result",
        "description": "Najväčší pád z vysokého plusu do mínusu.",
        "implemented": True,
    },
    "takticky_genius": {
        "name": "Taktický génius",
        "kind": "result",
        "description": "Najlepší zisk v zápasoch, kde dav minul výsledkový smer.",
        "implemented": True,
    },
    "remizovy_prorok": {
        "name": "Remízový prorok",
        "kind": "result",
        "description": "Najviac úspešných tipov na remízové výsledky.",
        "implemented": True,
    },
    "osamely_strelec": {
        "name": "Osamelý strelec",
        "kind": "result",
        "description": "Najlepší zisk z presných zásahov, ktoré netrafil nikto ďalší.",
        "implemented": True,
    },
    "dedinsky_divak": {
        "name": "Dedinský divák",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov s outsiderom.",
        "implemented": True,
    },
    "expert_pod_reflektormi": {
        "name": "Expert pod reflektormi",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov s favoritom.",
        "implemented": True,
    },
    "pivo_a_sandale": {
        "name": "Pivo a sandále",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov s Českom.",
        "implemented": True,
    },
    "konzervativec": {
        "name": "Konzervatívec",
        "kind": "result",
        "description": "Najlepší zisk z opakovanej zrkadlenej šablóny skóre.",
        "implemented": True,
    },
    "tvrdohlavec": {
        "name": "Tvrdohlavec",
        "kind": "result",
        "description": "Najväčšia strata z opakovanej zrkadlenej šablóny skóre.",
        "implemented": True,
    },
    "nocny_hrdina": {
        "name": "Nočný hrdina",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov po polnoci.",
        "implemented": True,
    },
    "smoliar": {
        "name": "Smoliar",
        "kind": "result",
        "description": "Najviac presných skóre ušlo o jediný gól.",
        "implemented": True,
    },
    "lovec_sokov": {
        "name": "Lovec šokov",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov, kde favorit nevyhral.",
        "implemented": True,
    },
    "strazca_istot": {
        "name": "Strážca istôt",
        "kind": "result",
        "description": "Najlepší zisk zo zápasov, kde favorit vyhral.",
        "implemented": True,
    },
    "rozdielovy_mag": {
        "name": "Rozdielový mág",
        "kind": "result",
        "description": "Najlepší zisk z nepresných tipov so správnym gólovým rozdielom.",
        "implemented": True,
    },
    "zberatel_drobnych": {
        "name": "Zberateľ drobných",
        "kind": "result",
        "description": "Najviac zápasov s kladným ziskom.",
        "implemented": True,
    },
}


BET_BADGE_METADATA = {
    "miluje_prekvapenia": {
        "name": "Miluje prekvapenia",
        "kind": "bet",
        "description": "Najviac odvážnych tipov na outsiderov a zakopnutia favoritov.",
        "implemented": True,
    },
    "neveri_zazrakom": {
        "name": "Neverí zázrakom",
        "kind": "bet",
        "description": "Najviac bezpečných tipov v prospech favoritov.",
        "implemented": True,
    },
    "parkuje_autobus": {
        "name": "Parkuje autobus",
        "kind": "bet",
        "description": "Najnižší priemerný počet tipovaných gólov.",
        "implemented": True,
    },
    "tipuje_hadzanu": {
        "name": "Tipuje hádzanú",
        "kind": "bet",
        "description": "Najvyšší priemerný počet tipovaných gólov.",
        "implemented": True,
    },
    "skenuje_a_kopiruje": {
        "name": "Skenuje a kopíruje",
        "kind": "bet",
        "description": "Najčastejšie trafí najpopulárnejší presný tip partie.",
        "implemented": True,
    },
    "vlastnou_hlavou": {
        "name": "Vlastnou hlavou",
        "kind": "bet",
        "description": "Najčastejšie zvolí presný tip, ktorý nikto iný nedal.",
        "implemented": True,
    },
    "pouziva_sablony": {
        "name": "Používa šablóny",
        "kind": "bet",
        "description": "Najviac opakuje jednu zrkadlenú šablónu skóre.",
        "implemented": True,
    },
    "neriadena_strela": {
        "name": "Neriadená strela",
        "kind": "bet",
        "description": "Používa najpestrejšiu sadu zrkadlených šablón skóre.",
        "implemented": True,
    },
    "zaokruhluje": {
        "name": "Zaokrúhľuje",
        "kind": "bet",
        "description": "Najčastejšie tipuje nulu aspoň na jednej strane.",
        "implemented": True,
    },
    "ide_proti_prudu": {
        "name": "Ide proti prúdu",
        "kind": "bet",
        "description": "Najčastejšie volí výsledkový smer proti väčšine.",
        "implemented": True,
    },
}


RESULT_BADGE_METADATA = {
    "na_ohni": {
        "name": "Na ohni",
        "kind": "result",
        "description": "Najdlhšia séria kladných denných tiketov s najväčším ziskom za toto obdobie.",
        "indicator_labels": ["Dni na ohni", "Vyhral počas obdobia"],
        "emoji": "🔥",
        "border": "orange",
        "implemented": True,
    },
    "v_bahne": {
        "name": "V bahne",
        "kind": "result",
        "description": "Najdlhšia séria záporných denných tiketov s najväčšou stratou za toto obdobie.",
        "indicator_labels": ["Dni v bahne", "Prehral počas obdobia"],
        "emoji": "🟤",
        "border": "brown",
        "implemented": True,
    },
    "remizovy_prorok": {
        "name": "Remízový prorok",
        "kind": "result",
        "description": "Najväčší zisk na zápasoch, ktoré skončili remízou.",
        "indicator_labels": ["Celkový zisk na remízových zápasoch", "Počet výherných remízových zápasov"],
        "emoji": "⚖️",
        "border": "yellow",
        "implemented": True,
    },
    "osamely_strelec": {
        "name": "Osamelý strelec",
        "kind": "result",
        "description": "Najvyšší zisk na zápasoch, v ktorých nikto iný netipoval toho istého víťaza/remízu.",
        "indicator_labels": ["Počet takýchto výherných zápasov", "Celkový zisk na týchto zápasoch"],
        "emoji": "🎯",
        "border": "green",
        "implemented": True,
    },
    "golovy_chirurg": {
        "name": "Gólový chirurg",
        "kind": "result",
        "description": "Najnižší priemerný rozdiel natipovaného skóre od skutočného výsledku.",
        "indicator_labels": ["Priemerná gólová odchýlka za zápas", "Celkový rozdiel v natipovaných góloch"],
        "emoji": "🩺",
        "border": "blue",
        "implemented": True,
    },
    "vstal_z_popola": {
        "name": "Vstal z popola",
        "kind": "result",
        "description": "Vrátil sa z hlbokého mínusu do plusových hodnôt.",
        "indicator_labels": ["Rozdiel medzi súčasnou bilanciou a najhorším stavom", "Najhoršia negatívna bilancia"],
        "emoji": "🌅",
        "border": "green",
        "implemented": True,
    },
    "bez_padaka": {
        "name": "Bez padáka",
        "kind": "result",
        "description": "Spadol z výrazných plusových hodnôt do mínusu.",
        "indicator_labels": ["Rozdiel medzi súčasnou bilanciou a najlepším stavom", "Najlepšia pozitívna bilancia"],
        "emoji": "🪂",
        "border": "red",
        "implemented": True,
    },
    "dedinsky_divak": {
        "name": "Dedinský divák",
        "kind": "result",
        "description": "Celkový zisk zo zápasov, v ktorých hrajú outsideri.",
        "indicator_labels": ["Celkový zisk", "Počet výherných zápasov"],
        "emoji": "🌾",
        "border": "yellow",
        "implemented": True,
    },
    "expert_pod_reflektormi": {
        "name": "Expert pod reflektormi",
        "kind": "result",
        "description": "Celkový zisk zo zápasov, v ktorých hrajú favoriti.",
        "indicator_labels": ["Celkový zisk", "Počet výherných zápasov"],
        "emoji": "💡",
        "border": "blue",
        "implemented": True,
    },
    "pivo_a_sandale": {
        "name": "Pivo a sandále",
        "kind": "result",
        "description": "Celkový zisk zo zápasov Českej republiky.",
        "indicator_labels": ["Celkový zisk", "Počet výherných zápasov"],
        "emoji": "🍺",
        "border": "yellow",
        "implemented": True,
    },
    "konzervativec": {
        "name": "Konzervatívec",
        "kind": "result",
        "description": "Najvyšší zisk z jedného konkrétneho natipovaného skóre.",
        "indicator_labels": ["Osvedčený výsledok", "Celkový zisk z tohto výsledku"],
        "emoji": "🧱",
        "border": "green",
        "implemented": True,
    },
    "tvrdohlavec": {
        "name": "Tvrdohlavec",
        "kind": "result",
        "description": "Najväčšia strata z jedného konkrétneho natipovaného skóre.",
        "indicator_labels": ["Neosvedčený výsledok", "Celková strata z tohto výsledku"],
        "emoji": "🪨",
        "border": "red",
        "implemented": True,
    },
    "nocny_hrdina": {
        "name": "Nočný hrdina",
        "kind": "result",
        "description": "Najvyšší zisk zo zápasov začínajúcich po polnoci slovenského času.",
        "indicator_labels": ["Celkový zisk", "Počet výherných nočných zápasov"],
        "emoji": "🌙",
        "border": "blue",
        "implemented": True,
    },
    "smoliar": {
        "name": "Smoliar",
        "kind": "result",
        "description": "Najviac presných tipov, ktoré ušli len o jediný gól.",
        "indicator_labels": ["Počet takmer-presných tipov", "Celková bilancia z týchto zápasov"],
        "emoji": "🍀",
        "border": "red",
        "implemented": True,
    },
    "takticky_genius": {
        "name": "Taktický génius",
        "kind": "result",
        "description": "Hráč, ktorý najviac získava na zápasoch, ktoré končia inak ako predpokladá väčšina tipérov.",
        "indicator_labels": [
            "Počet výherných zápasov, v ktorých väčšina tipovala iného víťaza/remízu",
            "Celkový zisk na zápasoch, v ktorých väčšina tipovala iného víťaza/remízu",
        ],
        "emoji": "♟️",
        "border": "green",
        "implemented": True,
    },
    "lovec_sokov": {
        "name": "Lovec šokov",
        "kind": "result",
        "description": "Najväčší zisk zo zápasov, kde favorit zaváhal.",
        "indicator_labels": ["Počet takýchto výherných zápasov", "Celkový zisk"],
        "emoji": "⚡",
        "border": "yellow",
        "implemented": True,
    },
    "strazca_istot": {
        "name": "Strážca istôt",
        "kind": "result",
        "description": "Najväčší zisk zo zápasov, kde favorit vyhral tak, ako sa očakávalo.",
        "indicator_labels": ["Počet takýchto výherných zápasov", "Celkový zisk"],
        "emoji": "🛡️",
        "border": "blue",
        "implemented": True,
    },
    "rozdielovy_mag": {
        "name": "Rozdielový mág",
        "kind": "result",
        "description": "Najväčší zisk z nepresných tipov, ale so správne natipovaným gólovým rozdielom.",
        "indicator_labels": ["Počet takýchto výherných zápasov", "Celková výhra"],
        "emoji": "🧮",
        "border": "yellow",
        "implemented": True,
    },
    "zberatel_drobnych": {
        "name": "Zberateľ drobných",
        "kind": "result",
        "description": "Najväčší celkový zisk zo zápasov, kde bola výhra menšia alebo rovná 10 €.",
        "indicator_labels": ["Počet drobných výhier", "Celkový zisk z týchto zápasov"],
        "emoji": "🪙",
        "border": "blue",
        "implemented": True,
    },
    "najcastejsi_vitaz": {
        "name": "Najčastejší víťaz",
        "kind": "result",
        "description": "Najvyšší celkový počet výherných tipov.",
        "indicator_labels": ["Počet výherných tipov", "Počet nevýherných tipov"],
        "emoji": "🏆",
        "border": "green",
        "implemented": True,
    },
}


BET_BADGE_METADATA = {
    "miluje_prekvapenia": {
        "name": "Miluje prekvapenia",
        "kind": "bet",
        "description": "Najčastejšie tipuje zaváhanie favorita alebo výhru outsidera.",
        "indicator_labels": ["Celkový počet takýchto tipov"],
        "emoji": "🎲",
        "border": "white",
        "implemented": True,
    },
    "neveri_zazrakom": {
        "name": "Neverí zázrakom",
        "kind": "bet",
        "description": "Najčastejšie tipuje výhru favorita alebo prehru outsidera.",
        "indicator_labels": ["Celkový počet takýchto tipov"],
        "emoji": "🔒",
        "border": "white",
        "implemented": True,
    },
    "parkuje_autobus": {
        "name": "Parkuje autobus",
        "kind": "bet",
        "description": "Najnižší priemerný počet natipovaných gólov.",
        "indicator_labels": ["Priemer gólov"],
        "emoji": "🚌",
        "border": "white",
        "implemented": True,
    },
    "tipuje_hadzanu": {
        "name": "Tipuje hádzanú",
        "kind": "bet",
        "description": "Najvyšší priemerný počet natipovaných gólov.",
        "indicator_labels": ["Priemer gólov"],
        "emoji": "🤾",
        "border": "white",
        "implemented": True,
    },
    "skenuje_a_kopiruje": {
        "name": "Skenuje a kopíruje",
        "kind": "bet",
        "description": "Najčastejšie natipuje najpopulárnejší tip v zápase.",
        "indicator_labels": ["Počet kópií"],
        "emoji": "🖨️",
        "border": "white",
        "implemented": True,
    },
    "vlastnou_hlavou": {
        "name": "Vlastnou hlavou",
        "kind": "bet",
        "description": "Najčastejšie zvolí tip, ktorý nikto iný nedal.",
        "indicator_labels": ["Počet unikátov"],
        "emoji": "🧠",
        "border": "white",
        "implemented": True,
    },
    "pouziva_sablony": {
        "name": "Používa šablóny",
        "kind": "bet",
        "description": "Najviac opakuje jeden konkrétny tip.",
        "indicator_labels": ["Šablóna"],
        "emoji": "📐",
        "border": "white",
        "implemented": True,
    },
    "neriadena_strela": {
        "name": "Neriadená strela",
        "kind": "bet",
        "description": "Používa najpestrejšiu sadu rôznych tipov skóre.",
        "indicator_labels": ["Počet rôznych tipov"],
        "emoji": "🚀",
        "border": "white",
        "implemented": True,
    },
    "zaokruhluje": {
        "name": "Zaokrúhľuje",
        "kind": "bet",
        "description": "Najčastejšie tipuje nulu aspoň na jednej strane.",
        "indicator_labels": ["Počet tipov s nulou"],
        "emoji": "0️⃣",
        "border": "white",
        "implemented": True,
    },
    "ide_proti_prudu": {
        "name": "Ide proti prúdu",
        "kind": "bet",
        "description": "Najčastejšie zvolí iný výsledkový smer ako väčšina tipérov.",
        "indicator_labels": ["Počet odvážnych tipov"],
        "emoji": "🌊",
        "border": "white",
        "implemented": True,
    },
}


def mirrored_exact_score_shape(home: int, away: int) -> tuple[int, int]:
    return tuple(sorted((home, away)))


def _money(units: int) -> str:
    return f"{units * 0.05:.2f}".replace(".", ",") + " €"


def _money(units: int) -> str:
    return f"{units * 0.05:.2f}".replace(".", ",") + " €"


def _outcome(home: int, away: int) -> str:
    if home > away:
        return "home"
    if away > home:
        return "away"
    return "draw"


def _score_label(home: int, away: int) -> str:
    return f"{home}:{away}"


def _shape_label(shape: tuple[int, int]) -> str:
    return f"{shape[0]}:{shape[1]}"


def _score_shape(home: int | None, away: int | None) -> tuple[int, int] | None:
    if home is None or away is None:
        return None
    return mirrored_exact_score_shape(home, away)


def _tier(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized in {"favorite", "favourite", "favorit", "favourite_team"}:
        return "favorite"
    if normalized in {"outsider", "underdog"}:
        return "outsider"
    return "neutral"


def _has_tier(row: MatchPlayerResult | BetPlayerPrediction, tier: str) -> bool:
    return _tier(row.home_tier) == tier or _tier(row.away_tier) == tier


def _side_with_tier(row: MatchPlayerResult | BetPlayerPrediction, tier: str) -> str | None:
    home_matches = _tier(row.home_tier) == tier
    away_matches = _tier(row.away_tier) == tier
    if home_matches == away_matches:
        return None
    return "home" if home_matches else "away"


def _opposite_side(side: str) -> str:
    return "away" if side == "home" else "home"


def _team_code(value: str | None) -> str:
    return (value or "").strip().lower().replace(" ", "").replace("-", "")


def _has_czechia(row: MatchPlayerResult) -> bool:
    czech_codes = {"cz", "cze", "czechia", "czechrepublic", "cesko", "česko"}
    return _team_code(row.home_code) in czech_codes or _team_code(row.away_code) in czech_codes


def _goal_error(row: MatchPlayerResult) -> int | None:
    if None in (row.bet_home, row.bet_away, row.final_home, row.final_away):
        return None
    return abs(row.bet_home - row.final_home) + abs(row.bet_away - row.final_away)


def _goal_difference(row: MatchPlayerResult) -> tuple[int, int] | None:
    if None in (row.bet_home, row.bet_away, row.final_home, row.final_away):
        return None
    return (row.bet_home - row.bet_away, row.final_home - row.final_away)


def _is_late_night(kickoff_at_sk: str | None) -> bool:
    if not kickoff_at_sk:
        return False
    try:
        parsed = datetime.fromisoformat(kickoff_at_sk.replace("Z", "+00:00"))
    except ValueError:
        return False
    return 0 <= parsed.hour < 5


def _registration_lookup(players: list[PlayerStanding]) -> dict[str, int]:
    return {player.player_id: player.registration_order for player in players}


def _empty_rank(player_id: str, registration_order: dict[str, int]) -> tuple[int, str]:
    return (registration_order.get(player_id, 999_999), player_id)


def _badge_from_candidates(
    badge_key: str,
    candidates: list[Candidate],
    registration_order: dict[str, int],
    changed_at: str,
) -> BadgeDict | None:
    if not candidates:
        return None

    ranked = sorted(
        candidates,
        key=lambda item: (*item[1], *_empty_rank(item[0], registration_order)),
    )
    leader = ranked[0]
    followers = [player_id for player_id, _, _ in ranked[1:3]]
    return {
        "badge_key": badge_key,
        "leader_player_id": leader[0],
        "followers": followers,
        "indicators": leader[2],
        "changed_at": changed_at,
    }


def _daily_by_player(daily_results: list[DailyPlayerResult]) -> dict[str, list[DailyPlayerResult]]:
    grouped: dict[str, list[DailyPlayerResult]] = defaultdict(list)
    for result in daily_results:
        grouped[result.player_id].append(result)
    for rows in grouped.values():
        rows.sort(key=lambda row: (row.date, row.ticket_id))
    return grouped


def _match_groups(match_results: list[MatchPlayerResult]) -> dict[str, list[MatchPlayerResult]]:
    grouped: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        grouped[row.match_id].append(row)
    return grouped


def _net_unit_candidates(
    badge_key: str,
    rows_by_player: dict[str, list[MatchPlayerResult]],
    labels: tuple[str, str],
    minimum_count: int = 2,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, rows in rows_by_player.items():
        if len(rows) < minimum_count:
            continue
        net_units = sum(row.units for row in rows)
        if net_units <= 0:
            continue
        candidates.append(
            (
                player_id,
                (-net_units, -len(rows)),
                [
                    {"label": labels[0], "value": _money(net_units)},
                    {"label": labels[1], "value": str(len(rows))},
                ],
            )
        )
    return candidates


def _net_unit_candidates(
    badge_key: str,
    rows_by_player: dict[str, list[MatchPlayerResult]],
    labels: tuple[str, str],
    minimum_count: int = 2,
    count_positive: bool = False,
    indicator_order: str = "money_count",
) -> list[Candidate]:
    del badge_key
    candidates: list[Candidate] = []
    for player_id, rows in rows_by_player.items():
        winning_count = sum(1 for row in rows if row.units > 0)
        relevant_count = winning_count if count_positive else len(rows)
        if relevant_count < minimum_count:
            continue
        net_units = sum(row.units for row in rows)
        if net_units <= 0:
            continue
        indicators = (
            [
                {"label": labels[0], "value": str(relevant_count)},
                {"label": labels[1], "value": _money(net_units)},
            ]
            if indicator_order == "count_money"
            else [
                {"label": labels[0], "value": _money(net_units)},
                {"label": labels[1], "value": str(relevant_count)},
            ]
        )
        candidates.append((player_id, (-net_units, -relevant_count), indicators))
    return candidates


def _streak_candidates(
    daily_results: list[DailyPlayerResult],
    positive: bool,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, rows in _daily_by_player(daily_results).items():
        best_length = 0
        best_units = 0
        current_length = 0
        current_units = 0

        for row in rows:
            streak_continues = row.units > 0 if positive else row.units < 0
            if streak_continues:
                current_length += 1
                current_units += row.units
            else:
                current_length = 0
                current_units = 0

            current_magnitude = current_units if positive else abs(current_units)
            best_magnitude = best_units if positive else abs(best_units)
            if (current_length, current_magnitude) > (best_length, best_magnitude):
                best_length = current_length
                best_units = current_units

        if best_length >= 2:
            labels = (
                ("Dni na ohni", "Vyhral počas obdobia")
                if positive
                else ("Dni v bahne", "Prehral počas obdobia")
            )
            candidates.append(
                (
                    player_id,
                    (-best_length, -abs(best_units)),
                    [
                        {"label": labels[0], "value": str(best_length)},
                        {"label": labels[1], "value": _money(abs(best_units))},
                    ],
                )
            )
    return candidates


def _calculate_na_ohni(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del match_results
    return _badge_from_candidates(
        "na_ohni",
        _streak_candidates(daily_results, positive=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_v_bahne(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del match_results
    return _badge_from_candidates(
        "v_bahne",
        _streak_candidates(daily_results, positive=False),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_golovy_chirurg(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    errors: dict[str, list[int]] = defaultdict(list)
    for row in match_results:
        if None in (row.bet_home, row.bet_away, row.final_home, row.final_away):
            continue
        error = abs(row.bet_home - row.final_home) + abs(row.bet_away - row.final_away)
        errors[row.player_id].append(error)

    candidates: list[Candidate] = []
    for player_id, player_errors in errors.items():
        if len(player_errors) < 2:
            continue
        total_error = sum(player_errors)
        average_error = total_error / len(player_errors)
        candidates.append(
            (
                player_id,
                (average_error, total_error),
                [
                    {"label": "Priemerná chyba", "value": f"{average_error:.1f}"},
                    {"label": "Celková chyba", "value": str(total_error)},
                ],
            )
        )

    return _badge_from_candidates(
        "golovy_chirurg",
        candidates,
        _registration_lookup(players),
        changed_at,
    )


def _balance_candidates(
    daily_results: list[DailyPlayerResult],
    rebound: bool,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, rows in _daily_by_player(daily_results).items():
        if len(rows) < 2:
            continue

        balance = 0
        low = 0
        peak = 0
        for row in rows:
            balance += row.units
            low = min(low, balance)
            peak = max(peak, balance)

        if rebound:
            if low > -600 or balance <= 0:
                continue
            score = balance - low
            candidates.append(
                (
                    player_id,
                    (-score, -balance),
                    [
                        {"label": "Návrat", "value": _money(score)},
                        {"label": "Aktuálny stav", "value": _money(balance)},
                    ],
                )
            )
        else:
            if peak < 600 or balance >= 0:
                continue
            score = peak - balance
            candidates.append(
                (
                    player_id,
                    (-score, balance),
                    [
                        {"label": "Pád", "value": _money(score)},
                        {"label": "Aktuálny stav", "value": _money(balance)},
                    ],
                )
            )
    return candidates


def _calculate_vstal_z_popola(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del match_results
    return _badge_from_candidates(
        "vstal_z_popola",
        _balance_candidates(daily_results, rebound=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_bez_padaka(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del match_results
    return _badge_from_candidates(
        "bez_padaka",
        _balance_candidates(daily_results, rebound=False),
        _registration_lookup(players),
        changed_at,
    )


def _majority_outcome(rows: list[MatchPlayerResult]) -> str | None:
    counts = Counter(row.bet_outcome for row in rows if row.bet_outcome)
    if not counts:
        return None
    top_count = counts.most_common(1)[0][1]
    top_outcomes = [outcome for outcome, count in counts.items() if count == top_count]
    if len(top_outcomes) != 1:
        return None
    return top_outcomes[0]


def _final_outcome(rows: list[MatchPlayerResult]) -> str | None:
    outcomes = {row.final_outcome for row in rows if row.final_outcome}
    if len(outcomes) == 1:
        return outcomes.pop()
    scored = next(
        (
            row
            for row in rows
            if row.final_home is not None and row.final_away is not None
        ),
        None,
    )
    if scored is None:
        return None
    return _outcome(scored.final_home, scored.final_away)


def _calculate_takticky_genius(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    matches_by_id: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        matches_by_id[row.match_id].append(row)

    player_units: dict[str, int] = defaultdict(int)
    player_counts: dict[str, int] = defaultdict(int)
    for rows in matches_by_id.values():
        majority = _majority_outcome(rows)
        final = _final_outcome(rows)
        if majority is None or final is None or majority == final:
            continue

        for row in rows:
            if row.bet_outcome == final:
                player_units[row.player_id] += row.units
                player_counts[row.player_id] += 1

    candidates: list[Candidate] = []
    for player_id, count in player_counts.items():
        if count < 2:
            continue
        net_units = player_units[player_id]
        if net_units <= 0:
            continue
        candidates.append(
            (
                player_id,
                (-net_units, -count),
                [
                    {"label": "Netto proti davu", "value": _money(net_units)},
                    {"label": "Zápasy", "value": str(count)},
                ],
            )
        )

    return _badge_from_candidates(
        "takticky_genius",
        candidates,
        _registration_lookup(players),
        changed_at,
    )


def _calculate_remizovy_prorok(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        final_outcome = row.final_outcome or (
            _outcome(row.final_home, row.final_away)
            if row.final_home is not None and row.final_away is not None
            else None
        )
        bet_outcome = row.bet_outcome or (
            _outcome(row.bet_home, row.bet_away)
            if row.bet_home is not None and row.bet_away is not None
            else None
        )
        if final_outcome == "draw" and bet_outcome == "draw":
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "remizovy_prorok",
        _net_unit_candidates(
            "remizovy_prorok",
            rows_by_player,
            ("Remízový zisk", "Remízové zásahy"),
        ),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_osamely_strelec(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for rows in _match_groups(match_results).values():
        exact_rows = [row for row in rows if row.exact_hit]
        if len(exact_rows) == 1:
            rows_by_player[exact_rows[0].player_id].append(exact_rows[0])

    return _badge_from_candidates(
        "osamely_strelec",
        _net_unit_candidates(
            "osamely_strelec",
            rows_by_player,
            ("Osamelý zisk", "Osamelé zásahy"),
        ),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_dedinsky_divak(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_tier(row, "outsider"):
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "dedinsky_divak",
        _net_unit_candidates("dedinsky_divak", rows_by_player, ("Zisk outsiderov", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_expert_pod_reflektormi(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_tier(row, "favorite"):
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "expert_pod_reflektormi",
        _net_unit_candidates(
            "expert_pod_reflektormi",
            rows_by_player,
            ("Zisk favoritov", "Zápasy"),
        ),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_pivo_a_sandale(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_czechia(row):
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "pivo_a_sandale",
        _net_unit_candidates("pivo_a_sandale", rows_by_player, ("Český zisk", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _repeated_shape_candidates(
    match_results: list[MatchPlayerResult],
    profitable: bool,
) -> list[Candidate]:
    rows_by_player_shape: dict[tuple[str, tuple[int, int]], list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        shape = _score_shape(row.bet_home, row.bet_away)
        if shape is not None:
            rows_by_player_shape[(row.player_id, shape)].append(row)

    best_by_player: dict[str, Candidate] = {}
    for (player_id, shape), rows in rows_by_player_shape.items():
        if len(rows) < 3:
            continue
        net_units = sum(row.units for row in rows)
        if profitable and net_units <= 0:
            continue
        if not profitable and net_units >= 0:
            continue
        magnitude = net_units if profitable else abs(net_units)
        candidate = (
            player_id,
            (-magnitude, -len(rows)),
            [
                {"label": "Šablóna", "value": _shape_label(shape)},
                {
                    "label": "Zisk" if profitable else "Strata",
                    "value": _money(net_units if profitable else abs(net_units)),
                },
            ],
        )
        current = best_by_player.get(player_id)
        if current is None or candidate[1] < current[1]:
            best_by_player[player_id] = candidate

    return list(best_by_player.values())


def _calculate_konzervativec(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    return _badge_from_candidates(
        "konzervativec",
        _repeated_shape_candidates(match_results, profitable=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_tvrdohlavec(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    return _badge_from_candidates(
        "tvrdohlavec",
        _repeated_shape_candidates(match_results, profitable=False),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_nocny_hrdina(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _is_late_night(row.kickoff_at_sk):
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "nocny_hrdina",
        _net_unit_candidates("nocny_hrdina", rows_by_player, ("Nočný zisk", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_smoliar(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    near_misses: dict[str, int] = defaultdict(int)
    for row in match_results:
        if not row.exact_hit and _goal_error(row) == 1:
            near_misses[row.player_id] += 1

    candidates = [
        (
            player_id,
            (-count,),
            [{"label": "Tesné omyly", "value": str(count)}],
        )
        for player_id, count in near_misses.items()
        if count >= 2
    ]
    return _badge_from_candidates(
        "smoliar",
        candidates,
        _registration_lookup(players),
        changed_at,
    )


def _favorite_result_side(row: MatchPlayerResult) -> str | None:
    favorite_side = _side_with_tier(row, "favorite")
    if favorite_side is None:
        return None
    return row.final_outcome or (
        _outcome(row.final_home, row.final_away)
        if row.final_home is not None and row.final_away is not None
        else None
    )


def _calculate_lovec_sokov(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        favorite_side = _side_with_tier(row, "favorite")
        final_side = _favorite_result_side(row)
        if favorite_side is not None and final_side is not None and final_side != favorite_side:
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "lovec_sokov",
        _net_unit_candidates("lovec_sokov", rows_by_player, ("Zisk zo šokov", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_strazca_istot(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        favorite_side = _side_with_tier(row, "favorite")
        final_side = _favorite_result_side(row)
        if favorite_side is not None and final_side == favorite_side:
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "strazca_istot",
        _net_unit_candidates("strazca_istot", rows_by_player, ("Zisk z istôt", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_rozdielovy_mag(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        differences = _goal_difference(row)
        if differences is None:
            continue
        if not row.exact_hit and differences[0] == differences[1]:
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "rozdielovy_mag",
        _net_unit_candidates("rozdielovy_mag", rows_by_player, ("Zisk z rozdielu", "Zápasy")),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_zberatel_drobnych(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    positive_counts: dict[str, int] = defaultdict(int)
    positive_units: dict[str, int] = defaultdict(int)
    for row in match_results:
        if row.units > 0:
            positive_counts[row.player_id] += 1
            positive_units[row.player_id] += row.units

    candidates = [
        (
            player_id,
            (-count, -positive_units[player_id]),
            [
                {"label": "Kladné zápasy", "value": str(count)},
                {"label": "Drobný zisk", "value": _money(positive_units[player_id])},
            ],
        )
        for player_id, count in positive_counts.items()
        if count >= 2
    ]
    return _badge_from_candidates(
        "zberatel_drobnych",
        candidates,
        _registration_lookup(players),
        changed_at,
    )


def _has_czechia(row: MatchPlayerResult) -> bool:
    czech_codes = {"cz", "cze", "czechia", "czechrepublic", "cesko", "česko"}
    return _team_code(row.home_code) in czech_codes or _team_code(row.away_code) in czech_codes


def _calculate_golovy_chirurg(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    errors: dict[str, list[int]] = defaultdict(list)
    for row in match_results:
        error = _goal_error(row)
        if error is not None:
            errors[row.player_id].append(error)

    candidates: list[Candidate] = []
    for player_id, player_errors in errors.items():
        if len(player_errors) < 2:
            continue
        total_error = sum(player_errors)
        average_error = total_error / len(player_errors)
        candidates.append(
            (
                player_id,
                (average_error, total_error),
                [
                    {"label": "Priemerná gólová odchýlka za zápas", "value": f"{average_error:.1f}"},
                    {"label": "Celkový rozdiel v natipovaných góloch", "value": str(total_error)},
                ],
            )
        )

    return _badge_from_candidates("golovy_chirurg", candidates, _registration_lookup(players), changed_at)


def _balance_candidates(
    daily_results: list[DailyPlayerResult],
    rebound: bool,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, rows in _daily_by_player(daily_results).items():
        if len(rows) < 2:
            continue

        balance = 0
        low = 0
        peak = 0
        for row in rows:
            balance += row.units
            low = min(low, balance)
            peak = max(peak, balance)

        if rebound:
            if low > -600 or balance <= 0:
                continue
            score = balance - low
            candidates.append(
                (
                    player_id,
                    (-score, -balance),
                    [
                        {"label": "Rozdiel medzi súčasnou bilanciou a najhorším stavom", "value": _money(score)},
                        {"label": "Najhoršia negatívna bilancia", "value": _money(low)},
                    ],
                )
            )
        else:
            if peak < 600 or balance >= 0:
                continue
            score = peak - balance
            candidates.append(
                (
                    player_id,
                    (-score, balance),
                    [
                        {"label": "Rozdiel medzi súčasnou bilanciou a najlepším stavom", "value": _money(score)},
                        {"label": "Najlepšia pozitívna bilancia", "value": _money(peak)},
                    ],
                )
            )
    return candidates


def _calculate_takticky_genius(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    player_units: dict[str, int] = defaultdict(int)
    player_counts: dict[str, int] = defaultdict(int)
    for rows in _match_groups(match_results).values():
        majority = _majority_outcome(rows)
        final = _final_outcome(rows)
        if majority is None or final is None or majority == final:
            continue
        for row in rows:
            if row.bet_outcome == final and row.units > 0:
                player_units[row.player_id] += row.units
                player_counts[row.player_id] += 1

    candidates: list[Candidate] = []
    for player_id, count in player_counts.items():
        if count < 2:
            continue
        net_units = player_units[player_id]
        candidates.append(
            (
                player_id,
                (-net_units, -count),
                [
                    {"label": "Počet výherných zápasov, v ktorých väčšina tipovala iného víťaza/remízu", "value": str(count)},
                    {"label": "Celkový zisk na zápasoch, v ktorých väčšina tipovala iného víťaza/remízu", "value": _money(net_units)},
                ],
            )
        )

    return _badge_from_candidates("takticky_genius", candidates, _registration_lookup(players), changed_at)


def _calculate_remizovy_prorok(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        final_outcome = row.final_outcome or (
            _outcome(row.final_home, row.final_away)
            if row.final_home is not None and row.final_away is not None
            else None
        )
        bet_outcome = row.bet_outcome or (
            _outcome(row.bet_home, row.bet_away)
            if row.bet_home is not None and row.bet_away is not None
            else None
        )
        if final_outcome == "draw" and bet_outcome == "draw":
            rows_by_player[row.player_id].append(row)

    return _badge_from_candidates(
        "remizovy_prorok",
        _net_unit_candidates(
            "remizovy_prorok",
            rows_by_player,
            ("Celkový zisk na remízových zápasoch", "Počet výherných remízových zápasov"),
            count_positive=True,
        ),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_osamely_strelec(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for rows in _match_groups(match_results).values():
        final = _final_outcome(rows)
        if final is None:
            continue
        outcome_counts = Counter(row.bet_outcome for row in rows if row.bet_outcome)
        if outcome_counts.get(final, 0) != 1:
            continue
        for row in rows:
            if row.bet_outcome == final and row.units > 0:
                rows_by_player[row.player_id].append(row)

    candidates: list[Candidate] = []
    for player_id, rows in rows_by_player.items():
        if len(rows) < 2:
            continue
        total_units = sum(row.units for row in rows)
        candidates.append(
            (
                player_id,
                (-total_units, -len(rows)),
                [
                    {"label": "Počet takýchto výherných zápasov", "value": str(len(rows))},
                    {"label": "Celkový zisk na týchto zápasoch", "value": _money(total_units)},
                ],
            )
        )
    return _badge_from_candidates("osamely_strelec", candidates, _registration_lookup(players), changed_at)


def _calculate_dedinsky_divak(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_tier(row, "outsider"):
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "dedinsky_divak",
        _net_unit_candidates("dedinsky_divak", rows_by_player, ("Celkový zisk", "Počet výherných zápasov"), count_positive=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_expert_pod_reflektormi(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_tier(row, "favorite"):
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "expert_pod_reflektormi",
        _net_unit_candidates("expert_pod_reflektormi", rows_by_player, ("Celkový zisk", "Počet výherných zápasov"), count_positive=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_pivo_a_sandale(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _has_czechia(row):
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "pivo_a_sandale",
        _net_unit_candidates("pivo_a_sandale", rows_by_player, ("Celkový zisk", "Počet výherných zápasov"), count_positive=True),
        _registration_lookup(players),
        changed_at,
    )


def _repeated_shape_candidates(
    match_results: list[MatchPlayerResult],
    profitable: bool,
) -> list[Candidate]:
    rows_by_player_shape: dict[tuple[str, tuple[int, int]], list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        shape = _score_shape(row.bet_home, row.bet_away)
        if shape is not None:
            rows_by_player_shape[(row.player_id, shape)].append(row)

    best_by_player: dict[str, Candidate] = {}
    for (player_id, shape), rows in rows_by_player_shape.items():
        if len(rows) < 3:
            continue
        net_units = sum(row.units for row in rows)
        if profitable and net_units <= 0:
            continue
        if not profitable and net_units >= 0:
            continue
        magnitude = net_units if profitable else abs(net_units)
        candidate = (
            player_id,
            (-magnitude, -len(rows)),
            [
                {"label": "Osvedčený výsledok" if profitable else "Neosvedčený výsledok", "value": _shape_label(shape)},
                {
                    "label": "Celkový zisk z tohto výsledku" if profitable else "Celková strata z tohto výsledku",
                    "value": _money(net_units if profitable else abs(net_units)),
                },
            ],
        )
        current = best_by_player.get(player_id)
        if current is None or candidate[1] < current[1]:
            best_by_player[player_id] = candidate

    return list(best_by_player.values())


def _calculate_nocny_hrdina(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if _is_late_night(row.kickoff_at_sk):
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "nocny_hrdina",
        _net_unit_candidates("nocny_hrdina", rows_by_player, ("Celkový zisk", "Počet výherných nočných zápasov"), count_positive=True),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_smoliar(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if not row.exact_hit and _goal_error(row) == 1:
            rows_by_player[row.player_id].append(row)

    candidates: list[Candidate] = []
    for player_id, rows in rows_by_player.items():
        if len(rows) < 2:
            continue
        total_units = sum(row.units for row in rows)
        candidates.append(
            (
                player_id,
                (-len(rows), total_units),
                [
                    {"label": "Počet takmer-presných tipov", "value": str(len(rows))},
                    {"label": "Celková bilancia z týchto zápasov", "value": _money(total_units)},
                ],
            )
        )
    return _badge_from_candidates("smoliar", candidates, _registration_lookup(players), changed_at)


def _calculate_lovec_sokov(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        favorite_side = _side_with_tier(row, "favorite")
        final_side = _favorite_result_side(row)
        if favorite_side is not None and final_side is not None and final_side != favorite_side:
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "lovec_sokov",
        _net_unit_candidates("lovec_sokov", rows_by_player, ("Počet takýchto výherných zápasov", "Celkový zisk"), count_positive=True, indicator_order="count_money"),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_strazca_istot(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        favorite_side = _side_with_tier(row, "favorite")
        final_side = _favorite_result_side(row)
        if favorite_side is not None and final_side == favorite_side:
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "strazca_istot",
        _net_unit_candidates("strazca_istot", rows_by_player, ("Počet takýchto výherných zápasov", "Celkový zisk"), count_positive=True, indicator_order="count_money"),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_rozdielovy_mag(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    rows_by_player: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        differences = _goal_difference(row)
        if differences is not None and not row.exact_hit and differences[0] == differences[1]:
            rows_by_player[row.player_id].append(row)
    return _badge_from_candidates(
        "rozdielovy_mag",
        _net_unit_candidates("rozdielovy_mag", rows_by_player, ("Počet takýchto výherných zápasov", "Celková výhra"), count_positive=True, indicator_order="count_money"),
        _registration_lookup(players),
        changed_at,
    )


def _calculate_zberatel_drobnych(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    small_wins: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        if 0 < row.units <= 200:
            small_wins[row.player_id].append(row)

    candidates: list[Candidate] = []
    for player_id, rows in small_wins.items():
        if len(rows) < 2:
            continue
        total_units = sum(row.units for row in rows)
        candidates.append(
            (
                player_id,
                (-total_units, -len(rows)),
                [
                    {"label": "Počet drobných výhier", "value": str(len(rows))},
                    {"label": "Celkový zisk z týchto zápasov", "value": _money(total_units)},
                ],
            )
        )
    return _badge_from_candidates("zberatel_drobnych", candidates, _registration_lookup(players), changed_at)


def _calculate_najcastejsi_vitaz(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> BadgeDict | None:
    del daily_results
    wins_by_player: dict[str, int] = defaultdict(int)
    nonwins_by_player: dict[str, int] = defaultdict(int)
    for row in match_results:
        if row.units > 0:
            wins_by_player[row.player_id] += 1
        else:
            nonwins_by_player[row.player_id] += 1

    candidates = [
        (
            player_id,
            (-wins, nonwins_by_player[player_id]),
            [
                {"label": "Počet výherných tipov", "value": str(wins)},
                {"label": "Počet nevýherných tipov", "value": str(nonwins_by_player[player_id])},
            ],
        )
        for player_id, wins in wins_by_player.items()
        if wins >= 2
    ]
    return _badge_from_candidates("najcastejsi_vitaz", candidates, _registration_lookup(players), changed_at)


BADGE_CALCULATORS: dict[str, Calculator] = {
    "na_ohni": _calculate_na_ohni,
    "v_bahne": _calculate_v_bahne,
    "golovy_chirurg": _calculate_golovy_chirurg,
    "vstal_z_popola": _calculate_vstal_z_popola,
    "bez_padaka": _calculate_bez_padaka,
    "takticky_genius": _calculate_takticky_genius,
    "remizovy_prorok": _calculate_remizovy_prorok,
    "osamely_strelec": _calculate_osamely_strelec,
    "dedinsky_divak": _calculate_dedinsky_divak,
    "expert_pod_reflektormi": _calculate_expert_pod_reflektormi,
    "pivo_a_sandale": _calculate_pivo_a_sandale,
    "konzervativec": _calculate_konzervativec,
    "tvrdohlavec": _calculate_tvrdohlavec,
    "nocny_hrdina": _calculate_nocny_hrdina,
    "smoliar": _calculate_smoliar,
    "lovec_sokov": _calculate_lovec_sokov,
    "strazca_istot": _calculate_strazca_istot,
    "rozdielovy_mag": _calculate_rozdielovy_mag,
    "zberatel_drobnych": _calculate_zberatel_drobnych,
    "najcastejsi_vitaz": _calculate_najcastejsi_vitaz,
}


def calculate_badges(
    players: list[PlayerStanding],
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    changed_at: str,
) -> list[BadgeDict]:
    badges: list[BadgeDict] = []
    for badge_key, calculator in BADGE_CALCULATORS.items():
        badge = calculator(players, daily_results, match_results, changed_at)
        if badge is not None:
            badges.append(badge)
    return badges


def _bet_groups_by_player(bets: list[BetPlayerPrediction]) -> dict[str, list[BetPlayerPrediction]]:
    grouped: dict[str, list[BetPlayerPrediction]] = defaultdict(list)
    for bet in bets:
        grouped[bet.player_id].append(bet)
    return grouped


def _bet_groups_by_match(bets: list[BetPlayerPrediction]) -> dict[str, list[BetPlayerPrediction]]:
    grouped: dict[str, list[BetPlayerPrediction]] = defaultdict(list)
    for bet in bets:
        grouped[bet.match_id].append(bet)
    return grouped


def _bet_badge_from_candidates(
    badge_key: str,
    candidates: list[Candidate],
    registration_order: dict[str, int],
    changed_at: str,
) -> BadgeDict | None:
    badge = _badge_from_candidates(badge_key, candidates, registration_order, changed_at)
    if badge is not None:
        badge["kind"] = "bet"
    return badge


def _upset_points(bet: BetPlayerPrediction) -> int:
    prediction = _outcome(bet.bet_home, bet.bet_away)
    favorite_side = _side_with_tier(bet, "favorite")
    outsider_side = _side_with_tier(bet, "outsider")

    if favorite_side is not None and outsider_side is not None:
        if prediction == outsider_side:
            return 3
        if prediction == "draw":
            return 1
        return 0

    if favorite_side is not None:
        return 1 if prediction == _opposite_side(favorite_side) else 0

    if outsider_side is not None:
        return 1 if prediction == outsider_side else 0

    return 0


def _safe_favorite_points(bet: BetPlayerPrediction) -> int:
    prediction = _outcome(bet.bet_home, bet.bet_away)
    favorite_side = _side_with_tier(bet, "favorite")
    outsider_side = _side_with_tier(bet, "outsider")

    if favorite_side is not None and outsider_side is not None:
        return 3 if prediction == favorite_side else 0

    if favorite_side is not None:
        return 1 if prediction == favorite_side else 0

    if outsider_side is not None:
        return 1 if prediction == _opposite_side(outsider_side) else 0

    return 0


def _point_candidates(
    bets: list[BetPlayerPrediction],
    point_fn: Callable[[BetPlayerPrediction], int],
    labels: tuple[str, str],
) -> list[Candidate]:
    points_by_player: dict[str, int] = defaultdict(int)
    counts_by_player: dict[str, int] = defaultdict(int)
    for bet in bets:
        points = point_fn(bet)
        if points <= 0:
            continue
        points_by_player[bet.player_id] += points
        counts_by_player[bet.player_id] += 1

    return [
        (
            player_id,
            (-points, -counts_by_player[player_id]),
            [
                {"label": labels[0], "value": str(points)},
                {"label": labels[1], "value": str(counts_by_player[player_id])},
            ],
        )
        for player_id, points in points_by_player.items()
        if counts_by_player[player_id] >= 2
    ]


def _calculate_miluje_prekvapenia_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _point_candidates(bets, _upset_points, ("Body prekvapení", "Odvážne tipy"))


def _calculate_neveri_zazrakom_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _point_candidates(bets, _safe_favorite_points, ("Body istoty", "Bezpečné tipy"))


def _average_goal_candidates(
    bets: list[BetPlayerPrediction],
    defensive: bool,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        if len(player_bets) < 2:
            continue
        total_goals = sum(bet.bet_home + bet.bet_away for bet in player_bets)
        average = total_goals / len(player_bets)
        rank = (average, total_goals) if defensive else (-average, -total_goals)
        candidates.append(
            (
                player_id,
                rank,
                [
                    {"label": "Priemer gólov", "value": f"{average:.1f}"},
                    {"label": "Tipy", "value": str(len(player_bets))},
                ],
            )
        )
    return candidates


def _calculate_parkuje_autobus_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _average_goal_candidates(bets, defensive=True)


def _calculate_tipuje_hadzanu_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _average_goal_candidates(bets, defensive=False)


def _calculate_skenuje_a_kopiruje_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    copy_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        score_counts = Counter(_score_label(bet.bet_home, bet.bet_away) for bet in match_bets)
        if not score_counts:
            continue
        top_count = score_counts.most_common(1)[0][1]
        common_scores = {score for score, count in score_counts.items() if count == top_count}
        if len(common_scores) != 1 or top_count < 2:
            continue
        common_score = next(iter(common_scores))
        for bet in match_bets:
            if _score_label(bet.bet_home, bet.bet_away) == common_score:
                copy_counts[bet.player_id] += 1

    return [
        (
            player_id,
            (-count,),
            [{"label": "Kópie davu", "value": str(count)}],
        )
        for player_id, count in copy_counts.items()
        if count >= 2
    ]


def _calculate_vlastnou_hlavou_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    unique_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        score_counts = Counter(_score_label(bet.bet_home, bet.bet_away) for bet in match_bets)
        for bet in match_bets:
            if score_counts[_score_label(bet.bet_home, bet.bet_away)] == 1:
                unique_counts[bet.player_id] += 1

    return [
        (
            player_id,
            (-count,),
            [{"label": "Vlastné tipy", "value": str(count)}],
        )
        for player_id, count in unique_counts.items()
        if count >= 2
    ]


def _calculate_pouziva_sablony_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        shape_counts = Counter(mirrored_exact_score_shape(bet.bet_home, bet.bet_away) for bet in player_bets)
        if not shape_counts:
            continue
        most_used_count = max(shape_counts.values())
        if most_used_count < 2:
            continue
        best_shapes = sorted(shape for shape, count in shape_counts.items() if count == most_used_count)
        shape = best_shapes[0]
        candidates.append(
            (
                player_id,
                (-most_used_count, -len(player_bets)),
                [
                    {"label": "Šablóna", "value": _shape_label(shape)},
                    {"label": "Použitia", "value": str(most_used_count)},
                ],
            )
        )
    return candidates


def _calculate_neriadena_strela_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        if len(player_bets) < 2:
            continue
        shape_counts = Counter(mirrored_exact_score_shape(bet.bet_home, bet.bet_away) for bet in player_bets)
        distinct_shapes = len(shape_counts)
        if distinct_shapes < 2:
            continue
        most_used_count = max(shape_counts.values())
        candidates.append(
            (
                player_id,
                (-distinct_shapes, most_used_count),
                [
                    {"label": "Rôzne šablóny", "value": str(distinct_shapes)},
                    {"label": "Najčastejšia", "value": str(most_used_count)},
                ],
            )
        )
    return candidates


def _calculate_zaokruhluje_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    zero_counts: dict[str, int] = defaultdict(int)
    for bet in bets:
        if bet.bet_home == 0 or bet.bet_away == 0:
            zero_counts[bet.player_id] += 1

    return [
        (
            player_id,
            (-count,),
            [{"label": "Tipy s nulou", "value": str(count)}],
        )
        for player_id, count in zero_counts.items()
        if count >= 2
    ]


def _calculate_ide_proti_prudu_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    contrarian_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        outcome_counts = Counter(_outcome(bet.bet_home, bet.bet_away) for bet in match_bets)
        top_count = outcome_counts.most_common(1)[0][1]
        common_outcomes = {outcome for outcome, count in outcome_counts.items() if count == top_count}
        if len(common_outcomes) != 1:
            continue
        majority = next(iter(common_outcomes))
        for bet in match_bets:
            if _outcome(bet.bet_home, bet.bet_away) != majority:
                contrarian_counts[bet.player_id] += 1

    return [
        (
            player_id,
            (-count,),
            [{"label": "Proti prúdu", "value": str(count)}],
        )
        for player_id, count in contrarian_counts.items()
        if count >= 2
    ]


def _bet_badge_from_candidates(
    badge_key: str,
    candidates: list[Candidate],
    registration_order: dict[str, int],
    changed_at: str,
) -> BadgeDict | None:
    badge = _badge_from_candidates(badge_key, candidates, registration_order, changed_at)
    if badge is not None:
        badge["kind"] = "bet"
        badge["followers"] = []
        badge["indicators"] = list(badge.get("indicators", []))[:1]
    return badge


def _point_candidates(
    bets: list[BetPlayerPrediction],
    point_fn: Callable[[BetPlayerPrediction], int],
    label: str,
) -> list[Candidate]:
    points_by_player: dict[str, int] = defaultdict(int)
    counts_by_player: dict[str, int] = defaultdict(int)
    for bet in bets:
        points = point_fn(bet)
        if points <= 0:
            continue
        points_by_player[bet.player_id] += points
        counts_by_player[bet.player_id] += 1

    return [
        (
            player_id,
            (-points, -counts_by_player[player_id]),
            [{"label": label, "value": str(counts_by_player[player_id])}],
        )
        for player_id, points in points_by_player.items()
        if counts_by_player[player_id] >= 2
    ]


def _calculate_miluje_prekvapenia_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _point_candidates(bets, _upset_points, "Celkový počet takýchto tipov")


def _calculate_neveri_zazrakom_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    return _point_candidates(bets, _safe_favorite_points, "Celkový počet takýchto tipov")


def _average_goal_candidates(
    bets: list[BetPlayerPrediction],
    defensive: bool,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        if len(player_bets) < 2:
            continue
        total_goals = sum(bet.bet_home + bet.bet_away for bet in player_bets)
        average = total_goals / len(player_bets)
        rank = (average, total_goals) if defensive else (-average, -total_goals)
        candidates.append(
            (
                player_id,
                rank,
                [{"label": "Priemer gólov", "value": f"{average:.1f}"}],
            )
        )
    return candidates


def _calculate_skenuje_a_kopiruje_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    copy_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        score_counts = Counter(_score_label(bet.bet_home, bet.bet_away) for bet in match_bets)
        if not score_counts:
            continue
        top_count = score_counts.most_common(1)[0][1]
        common_scores = {score for score, count in score_counts.items() if count == top_count}
        if len(common_scores) != 1 or top_count < 2:
            continue
        common_score = next(iter(common_scores))
        for bet in match_bets:
            if _score_label(bet.bet_home, bet.bet_away) == common_score:
                copy_counts[bet.player_id] += 1

    return [
        (player_id, (-count,), [{"label": "Počet kópií", "value": str(count)}])
        for player_id, count in copy_counts.items()
        if count >= 2
    ]


def _calculate_vlastnou_hlavou_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    unique_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        score_counts = Counter(_score_label(bet.bet_home, bet.bet_away) for bet in match_bets)
        for bet in match_bets:
            if score_counts[_score_label(bet.bet_home, bet.bet_away)] == 1:
                unique_counts[bet.player_id] += 1

    return [
        (player_id, (-count,), [{"label": "Počet unikátov", "value": str(count)}])
        for player_id, count in unique_counts.items()
        if count >= 2
    ]


def _calculate_pouziva_sablony_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        shape_counts = Counter(mirrored_exact_score_shape(bet.bet_home, bet.bet_away) for bet in player_bets)
        if not shape_counts:
            continue
        most_used_count = max(shape_counts.values())
        if most_used_count < 2:
            continue
        shape = sorted(shape for shape, count in shape_counts.items() if count == most_used_count)[0]
        candidates.append(
            (
                player_id,
                (-most_used_count, -len(player_bets)),
                [{"label": "Šablóna", "value": _shape_label(shape)}],
            )
        )
    return candidates


def _calculate_neriadena_strela_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for player_id, player_bets in _bet_groups_by_player(bets).items():
        if len(player_bets) < 2:
            continue
        shape_counts = Counter(mirrored_exact_score_shape(bet.bet_home, bet.bet_away) for bet in player_bets)
        distinct_shapes = len(shape_counts)
        if distinct_shapes < 2:
            continue
        most_used_count = max(shape_counts.values())
        candidates.append(
            (
                player_id,
                (-distinct_shapes, most_used_count),
                [{"label": "Počet rôznych tipov", "value": str(distinct_shapes)}],
            )
        )
    return candidates


def _calculate_zaokruhluje_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    zero_counts: dict[str, int] = defaultdict(int)
    for bet in bets:
        if bet.bet_home == 0 or bet.bet_away == 0:
            zero_counts[bet.player_id] += 1
    return [
        (player_id, (-count,), [{"label": "Počet tipov s nulou", "value": str(count)}])
        for player_id, count in zero_counts.items()
        if count >= 2
    ]


def _calculate_ide_proti_prudu_bet(bets: list[BetPlayerPrediction]) -> list[Candidate]:
    contrarian_counts: dict[str, int] = defaultdict(int)
    for match_bets in _bet_groups_by_match(bets).values():
        outcome_counts = Counter(_outcome(bet.bet_home, bet.bet_away) for bet in match_bets)
        top_count = outcome_counts.most_common(1)[0][1]
        common_outcomes = {outcome for outcome, count in outcome_counts.items() if count == top_count}
        if len(common_outcomes) != 1:
            continue
        majority = next(iter(common_outcomes))
        for bet in match_bets:
            if _outcome(bet.bet_home, bet.bet_away) != majority:
                contrarian_counts[bet.player_id] += 1
    return [
        (player_id, (-count,), [{"label": "Počet odvážnych tipov", "value": str(count)}])
        for player_id, count in contrarian_counts.items()
        if count >= 2
    ]


BET_BADGE_CALCULATORS: dict[str, Callable[[list[BetPlayerPrediction]], list[Candidate]]] = {
    "miluje_prekvapenia": _calculate_miluje_prekvapenia_bet,
    "neveri_zazrakom": _calculate_neveri_zazrakom_bet,
    "parkuje_autobus": _calculate_parkuje_autobus_bet,
    "tipuje_hadzanu": _calculate_tipuje_hadzanu_bet,
    "skenuje_a_kopiruje": _calculate_skenuje_a_kopiruje_bet,
    "vlastnou_hlavou": _calculate_vlastnou_hlavou_bet,
    "pouziva_sablony": _calculate_pouziva_sablony_bet,
    "neriadena_strela": _calculate_neriadena_strela_bet,
    "zaokruhluje": _calculate_zaokruhluje_bet,
    "ide_proti_prudu": _calculate_ide_proti_prudu_bet,
}


def calculate_bet_badges(
    players: list[PlayerStanding],
    bets: list[BetPlayerPrediction],
    changed_at: str,
) -> list[BadgeDict]:
    registration_order = _registration_lookup(players)
    badges: list[BadgeDict] = []
    for badge_key, calculator in BET_BADGE_CALCULATORS.items():
        badge = _bet_badge_from_candidates(
            badge_key,
            calculator(bets),
            registration_order,
            changed_at,
        )
        if badge is not None:
            badges.append(badge)
    return badges
