from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass


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
    exact_hit: bool = False
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


RecordEntry = dict[str, str]
RecordMap = dict[str, list[RecordEntry]]


RECORD_METADATA = {
    "najvyssia_vyhra_za_den": "Najvyššia výhra za deň",
    "najvacsia_prehra_za_den": "Najväčšia prehra za deň",
    "najlukrativnejsi_zapas": "Najlukratívnejší zápas",
    "najviac_presnych_tipov_za_den": "Najviac presných tipov za deň",
    "najvacsi_denny_skok_v_rebricku": "Najväčší denný skok v rebríčku",
    "najvyrovnanejsi_den": "Najvyrovnanejší deň",
    "najjednotnejsi_zapas": "Najjednotnejší zápas",
    "najrozbitejsi_zapas": "Najrozbitejší zápas",
    "najpresnejsi_den_partie": "Najpresnejší deň partie",
}


def _money(units: int) -> str:
    return f"{units * 0.05:.2f}".replace(".", ",") + " €"


def _score_label(home: int | None, away: int | None) -> str | None:
    if home is None or away is None:
        return None
    return f"{home}:{away}"


def _presne_tipy_label(count: int) -> str:
    if count == 1:
        return "1 presný tip"
    if 2 <= count <= 4:
        return f"{count} presné tipy"
    return f"{count} presných tipov"


def _player_order(player_id: str | None, registration_order: dict[str, int]) -> tuple[int, str]:
    if player_id is None:
        return (999_999, "")
    return (registration_order.get(player_id, 999_999), player_id)


def _top_player_entries(
    rows: list[tuple[float | int, DailyPlayerResult | MatchPlayerResult, str]],
    registration_order: dict[str, int],
    descending: bool = True,
) -> list[RecordEntry]:
    sign = -1 if descending else 1
    ranked = sorted(
        rows,
        key=lambda item: (
            sign * item[0],
            *_player_order(item[1].player_id, registration_order),
            item[1].date,
            item[1].ticket_id,
            getattr(item[1], "match_id", ""),
        ),
    )
    return [
        {
            "player_id": row.player_id,
            "date": row.date,
            "value": value,
            "source_id": source_id,
        }
        for _, row, value, source_id in (
            (score, row, value, row.match_id if isinstance(row, MatchPlayerResult) else row.ticket_id)
            for score, row, value in ranked[:5]
        )
    ]


def _daily_win(daily_results: list[DailyPlayerResult], registration_order: dict[str, int]) -> list[RecordEntry]:
    rows = [(row.units, row, _money(row.units)) for row in daily_results if row.units > 0]
    return _top_player_entries(rows, registration_order)


def _daily_loss(daily_results: list[DailyPlayerResult], registration_order: dict[str, int]) -> list[RecordEntry]:
    rows = [(abs(row.units), row, _money(row.units)) for row in daily_results if row.units < 0]
    return _top_player_entries(rows, registration_order)


def _lucrative_match(
    match_results: list[MatchPlayerResult],
    registration_order: dict[str, int],
) -> list[RecordEntry]:
    rows = [(row.units, row, _money(row.units)) for row in match_results if row.units > 0]
    return _top_player_entries(rows, registration_order)


def _exact_hits(daily_results: list[DailyPlayerResult], registration_order: dict[str, int]) -> list[RecordEntry]:
    rows = [(row.exact_hits, row, str(row.exact_hits)) for row in daily_results if row.exact_hits > 0]
    return _top_player_entries(rows, registration_order)


def _rank_jump(daily_results: list[DailyPlayerResult], registration_order: dict[str, int]) -> list[RecordEntry]:
    rows = []
    for row in daily_results:
        if row.rank_before is None or row.rank_after is None:
            continue
        jump = row.rank_before - row.rank_after
        if jump > 0:
            rows.append((jump, row, str(jump)))
    return _top_player_entries(rows, registration_order)


def _daily_groups(daily_results: list[DailyPlayerResult]) -> dict[tuple[str, str], list[DailyPlayerResult]]:
    grouped: dict[tuple[str, str], list[DailyPlayerResult]] = defaultdict(list)
    for row in daily_results:
        grouped[(row.date, row.ticket_id)].append(row)
    return grouped


def _match_groups(match_results: list[MatchPlayerResult]) -> dict[str, list[MatchPlayerResult]]:
    grouped: dict[str, list[MatchPlayerResult]] = defaultdict(list)
    for row in match_results:
        grouped[row.match_id].append(row)
    return grouped


def _party_entries(
    rows: list[tuple[float | int, str, str, str, dict[str, str]]],
    descending: bool = True,
) -> list[RecordEntry]:
    sign = -1 if descending else 1
    ranked = sorted(rows, key=lambda item: (sign * item[0], item[1], item[3]))
    return [
        {
            "date": date,
            "value": value,
            "source_id": source_id,
            **extra,
        }
        for _, date, value, source_id, extra in ranked[:5]
    ]


def _balanced_day(daily_results: list[DailyPlayerResult]) -> list[RecordEntry]:
    rows = []
    for (date, ticket_id), day_rows in _daily_groups(daily_results).items():
        if len(day_rows) < 2:
            continue
        spread = max(row.units for row in day_rows) - min(row.units for row in day_rows)
        rows.append((spread, date, _money(spread), ticket_id, {}))
    return _party_entries(rows, descending=False)


def _party_precision(match_results: list[MatchPlayerResult]) -> list[RecordEntry]:
    exact_hits_by_ticket: dict[str, int] = defaultdict(int)
    display_date_by_ticket: dict[str, str] = {}
    for row in match_results:
        current_display_date = display_date_by_ticket.get(row.ticket_id)
        if current_display_date is None or row.date < current_display_date:
            display_date_by_ticket[row.ticket_id] = row.date
        if row.exact_hit:
            exact_hits_by_ticket[row.ticket_id] += 1

    rows = []
    for ticket_id, exact_hits in exact_hits_by_ticket.items():
        if exact_hits <= 0:
            continue
        date = display_date_by_ticket[ticket_id]
        rows.append((exact_hits, date, _presne_tipy_label(exact_hits), ticket_id, {}))
    return _party_entries(rows)


def _unified_match(match_results: list[MatchPlayerResult]) -> list[RecordEntry]:
    rows = []
    for match_id, match_rows in _match_groups(match_results).items():
        score_labels = [
            label
            for label in (_score_label(row.bet_home, row.bet_away) for row in match_rows)
            if label is not None
        ]
        if not score_labels:
            continue
        counts = Counter(score_labels)
        top_count = max(counts.values())
        common_score = sorted(label for label, count in counts.items() if count == top_count)[0]
        rows.append(
            (
                top_count,
                match_rows[0].date,
                f"{top_count}x skóre {common_score}",
                match_id,
                {"score_label": common_score},
            )
        )
    return _party_entries(rows)


def _broken_match(match_results: list[MatchPlayerResult]) -> list[RecordEntry]:
    rows = []
    for match_id, match_rows in _match_groups(match_results).items():
        score_labels = {
            label
            for label in (_score_label(row.bet_home, row.bet_away) for row in match_rows)
            if label is not None
        }
        if not score_labels:
            continue
        distinct = len(score_labels)
        suffix = "rôzne skóre" if distinct < 5 else "rôznych skóre"
        rows.append(
            (
                distinct,
                match_rows[0].date,
                f"{distinct} {suffix}",
                match_id,
                {"distinct_score_count": str(distinct)},
            )
        )
    return _party_entries(rows)


def calculate_records(
    daily_results: list[DailyPlayerResult],
    match_results: list[MatchPlayerResult],
    registration_order: dict[str, int],
) -> RecordMap:
    return {
        "najvyssia_vyhra_za_den": _daily_win(daily_results, registration_order),
        "najvacsia_prehra_za_den": _daily_loss(daily_results, registration_order),
        "najlukrativnejsi_zapas": _lucrative_match(match_results, registration_order),
        "najviac_presnych_tipov_za_den": _exact_hits(daily_results, registration_order),
        "najvacsi_denny_skok_v_rebricku": _rank_jump(daily_results, registration_order),
        "najvyrovnanejsi_den": _balanced_day(daily_results),
        "najjednotnejsi_zapas": _unified_match(match_results),
        "najrozbitejsi_zapas": _broken_match(match_results),
        "najpresnejsi_den_partie": _party_precision(match_results),
    }
