import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from tipparta_settlement import Bet, Score, settle_match
from tipparta_settlement.badges import (
    BET_BADGE_METADATA,
    RESULT_BADGE_METADATA,
    BetPlayerPrediction,
    DailyPlayerResult as BadgeDailyPlayerResult,
    MatchPlayerResult as BadgeMatchPlayerResult,
    PlayerStanding,
    calculate_badges,
    calculate_bet_badges,
)
from tipparta_settlement.records import (
    RECORD_METADATA,
    DailyPlayerResult as RecordDailyPlayerResult,
    MatchPlayerResult as RecordMatchPlayerResult,
    calculate_records,
)

PUBLIC_RESULT_BADGE_METADATA = {
    "na_ohni": {
        "title": "Na ohni",
        "explanation": "Najdlh\u0161ia s\u00e9ria kladn\u00fdch denn\u00fdch l\u00edstkov.",
        "indicator_labels": ["Dni na ohni", "Vyhral po\u010das obdobia"],
    },
    "v_bahne": {
        "title": "V bahne",
        "explanation": "Najdlh\u0161ia s\u00e9ria z\u00e1porn\u00fdch denn\u00fdch l\u00edstkov.",
        "indicator_labels": ["Dni v bahne", "Prehral po\u010das obdobia"],
    },
    "golovy_chirurg": {
        "title": "G\u00f3lov\u00fd chirurg",
        "explanation": "Najni\u017e\u0161ia priemern\u00e1 chyba v presnom sk\u00f3re.",
        "indicator_labels": ["Priemern\u00e1 chyba", "Celkov\u00e1 chyba"],
    },
    "vstal_z_popola": {
        "title": "Vstal z popola",
        "explanation": "Najsilnej\u0161\u00ed n\u00e1vrat z hlbok\u00e9ho m\u00ednusu do plusu.",
        "indicator_labels": ["N\u00e1vrat", "Aktu\u00e1lny stav"],
    },
    "bez_padaka": {
        "title": "Bez pad\u00e1ka",
        "explanation": "Najv\u00e4\u010d\u0161\u00ed p\u00e1d z vysok\u00e9ho plusu do m\u00ednusu.",
        "indicator_labels": ["P\u00e1d", "Aktu\u00e1lny stav"],
    },
    "takticky_genius": {
        "title": "Taktick\u00fd g\u00e9nius",
        "explanation": "Najlep\u0161\u00ed zisk v z\u00e1pasoch, kde dav minul v\u00fdsledkov\u00fd smer.",
        "indicator_labels": ["Netto proti davu", "Z\u00e1pasy"],
    },
}


def _json_response(payload: dict[str, Any], status: int = 200):
    return json.dumps(payload), status, {"Content-Type": "application/json"}


def _request_json(request: Any) -> dict[str, Any]:
    get_json = getattr(request, "get_json", None)
    if callable(get_json):
        data = get_json(silent=True)
        return data if isinstance(data, dict) else {}

    data = getattr(request, "json", None)
    return data if isinstance(data, dict) else {}


def _header(request: Any, name: str) -> str | None:
    headers = getattr(request, "headers", {}) or {}
    value = headers.get(name)
    if value is not None:
        return value
    return headers.get(name.lower())


def _request_token(request: Any, body: dict[str, Any]) -> str | None:
    authorization = _header(request, "Authorization")
    if authorization and authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip()

    header_token = _header(request, "X-Settlement-Worker-Token")
    if header_token:
        return header_token.strip()

    body_token = body.get("token")
    return body_token.strip() if isinstance(body_token, str) else None


def _verify_worker_token(request: Any, body: dict[str, Any]) -> None:
    expected = os.environ.get("SETTLEMENT_WORKER_TOKEN")
    provided = _request_token(request, body)

    if not expected or provided != expected:
        raise PermissionError("Invalid settlement worker token.")


def _firestore_client():
    import firebase_admin
    from firebase_admin import firestore

    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app()

    return firestore.client()


def _score_from_data(data: Any) -> Score:
    if not isinstance(data, dict):
        raise ValueError("Score must be an object with home and away fields.")

    return Score(home=data["home"], away=data["away"])


def _ticket_id_from_match_data(match_data: dict[str, Any]) -> str | None:
    ticket_id = match_data.get("ticketId") or match_data.get("ticket_id")
    return ticket_id if isinstance(ticket_id, str) and ticket_id else None


def _int_or_default(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _snapshot_bets_for_match(
    db: Any,
    ticket_id: str | None,
    match_id: str,
    transaction: Any | None = None,
) -> list[Bet] | None:
    if not ticket_id:
        return None

    snapshot = _document_get(db.collection("ticketSnapshots").document(ticket_id), transaction)
    if not snapshot.exists:
        return None

    snapshot_data = snapshot.to_dict() or {}
    player_ids = [
        player_id
        for player_id in snapshot_data.get("playerIds", [])
        if isinstance(player_id, str) and player_id
    ]
    rows = [
        row
        for row in snapshot_data.get("bets", [])
        if isinstance(row, dict)
        and row.get("matchId") == match_id
        and isinstance(row.get("playerId"), str)
    ]
    rows_by_player = {str(row["playerId"]): row for row in rows}

    if not player_ids:
        player_ids = [
            str(row["playerId"])
            for row in sorted(
                rows,
                key=lambda row: (
                    _int_or_default(row.get("registrationOrder"), 999_999),
                    str(row.get("playerId", "")),
                ),
            )
        ]

    settlement_bets: list[Bet] = []
    for index, player_id in enumerate(player_ids):
        row = rows_by_player.get(player_id, {})
        raw_score = row.get("score")
        score = _score_from_data(raw_score) if raw_score is not None else None
        settlement_bets.append(
            Bet(
                player_id=player_id,
                score=score,
                registration_order=_int_or_default(row.get("registrationOrder"), index + 1),
            )
        )

    return sorted(
        settlement_bets,
        key=lambda bet: (bet.registration_order, bet.player_id),
    )


def _query_stream(query: Any, transaction: Any | None = None):
    if transaction is None:
        return query.stream()
    return query.stream(transaction=transaction)


def _document_get(document: Any, transaction: Any | None = None):
    if transaction is None:
        return document.get()
    return document.get(transaction=transaction)


def _load_match_bets(
    db: Any,
    match_id: str,
    transaction: Any | None = None,
) -> tuple[Score, list[Bet], str | None]:
    match_snapshot = _document_get(db.collection("matches").document(match_id), transaction)
    if not match_snapshot.exists:
        raise ValueError(f"Match {match_id} does not exist.")

    match_data = match_snapshot.to_dict() or {}
    final_score = _score_from_data(match_data.get("finalScore"))
    ticket_id = _ticket_id_from_match_data(match_data)
    snapshot_bets = _snapshot_bets_for_match(db, ticket_id, match_id, transaction=transaction)

    if snapshot_bets is not None:
        return final_score, snapshot_bets, ticket_id

    players = []
    player_query = (
        db.collection("players")
        .where("isPlayer", "==", True)
        .where("status", "==", "active")
    )
    for player_snapshot in _query_stream(player_query, transaction):
        player_data = player_snapshot.to_dict() or {}
        players.append(
            {
                "player_id": player_data.get("id") or player_snapshot.id,
                "registration_order": int(player_data.get("registrationOrder", 0)),
            }
        )

    bets_by_player: dict[str, dict[str, Any]] = {}
    bet_query = db.collection("bets").where("matchId", "==", match_id)
    for bet_snapshot in _query_stream(bet_query, transaction):
        bet_data = bet_snapshot.to_dict() or {}
        player_id = bet_data.get("playerId")
        if isinstance(player_id, str):
            bets_by_player[player_id] = bet_data

    settlement_bets: list[Bet] = []
    for player in sorted(players, key=lambda item: (item["registration_order"], item["player_id"])):
        player_id = player["player_id"]
        bet_data = bets_by_player.get(player_id, {})
        raw_score = bet_data.get("score")
        score = _score_from_data(raw_score) if raw_score is not None else None
        settlement_bets.append(
            Bet(
                player_id=player_id,
                score=score,
                registration_order=player["registration_order"],
            )
        )

    return final_score, settlement_bets, ticket_id


def _dump_model(model: Any) -> dict[str, Any]:
    model_dump = getattr(model, "model_dump", None)
    if callable(model_dump):
        return model_dump()
    return model.dict()


def _settlement_doc_payload(settlement: Any) -> dict[str, Any]:
    return {
        "matchId": settlement.match_id,
        "checksumUnits": settlement.checksum_units,
        "unallocatedUnits": getattr(settlement, "unallocated_units", 0),
        "settlements": [
            {
                "playerId": line.player_id,
                "units": line.units,
                "label": line.label,
                "exactHit": line.exact_hit,
            }
            for line in settlement.settlements
        ],
    }


def _settlement_lines_from_doc(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []

    lines = data.get("settlements")
    return [line for line in lines if isinstance(line, dict)] if isinstance(lines, list) else []


def _settlement_line_player_id(line: dict[str, Any]) -> str | None:
    player_id = line.get("player_id", line.get("playerId"))
    return player_id if isinstance(player_id, str) and player_id else None


def _settlement_line_exact_hit(line: dict[str, Any]) -> bool:
    return bool(line.get("exact_hit", line.get("exactHit", False)))


def _badge_metadata(badge_key: str) -> dict[str, Any]:
    return RESULT_BADGE_METADATA.get(badge_key) or BET_BADGE_METADATA.get(badge_key, {})


def _public_tone_for_badge(badge_key: str) -> str:
    border = str(_badge_metadata(badge_key).get("border", "yellow"))
    if border in {"brown", "red"}:
        return "cold"
    if border == "orange":
        return "hot"
    return "gold"


def _public_text(value: Any) -> str:
    if not isinstance(value, str):
        return str(value)

    money_match = re.match(r"^(-?\d+,\d{2}).*$", value)
    if money_match:
        return f"{money_match.group(1)} \u20ac"

    return value


def _public_indicators(badge_key: str, indicators: Any) -> list[dict[str, str]]:
    if not isinstance(indicators, list):
        return []

    labels = _badge_metadata(badge_key).get("indicator_labels")
    public_indicators: list[dict[str, str]] = []
    for index, indicator in enumerate(indicators):
        if not isinstance(indicator, dict):
            continue

        label = labels[index] if isinstance(labels, list) and index < len(labels) else _public_text(indicator.get("label", ""))
        public_indicators.append(
            {
                "label": label,
                "value": _public_text(indicator.get("value", "")),
            }
        )

    return public_indicators


def _daily_results_from_match_results(
    match_results: list[BadgeMatchPlayerResult],
) -> list[BadgeDailyPlayerResult]:
    grouped: dict[tuple[str, str, str], dict[str, int]] = {}
    for row in match_results:
        key = (row.player_id, row.ticket_id, row.date)
        current = grouped.setdefault(key, {"units": 0, "exact_hits": 0})
        current["units"] += row.units
        current["exact_hits"] += 1 if row.exact_hit else 0

    return [
        BadgeDailyPlayerResult(
            player_id=player_id,
            ticket_id=ticket_id,
            date=date,
            units=values["units"],
            exact_hits=values["exact_hits"],
        )
        for (player_id, ticket_id, date), values in sorted(grouped.items())
    ]


def _record_daily_results_from_badge_rows(
    daily_results: list[BadgeDailyPlayerResult],
) -> list[RecordDailyPlayerResult]:
    return [
        RecordDailyPlayerResult(
            player_id=row.player_id,
            ticket_id=row.ticket_id,
            date=row.date,
            units=row.units,
            exact_hits=row.exact_hits,
            rank_before=row.rank_before,
            rank_after=row.rank_after,
        )
        for row in daily_results
    ]


def _record_match_results_from_badge_rows(
    match_results: list[BadgeMatchPlayerResult],
) -> list[RecordMatchPlayerResult]:
    return [
        RecordMatchPlayerResult(
            player_id=row.player_id,
            match_id=row.match_id,
            ticket_id=row.ticket_id,
            date=row.date,
            units=row.units,
            exact_hit=row.exact_hit,
            bet_home=row.bet_home,
            bet_away=row.bet_away,
            final_home=row.final_home,
            final_away=row.final_away,
            bet_outcome=row.bet_outcome,
            final_outcome=row.final_outcome,
            kickoff_at_sk=row.kickoff_at_sk,
            home_tier=row.home_tier,
            away_tier=row.away_tier,
            home_code=row.home_code,
            away_code=row.away_code,
        )
        for row in match_results
    ]


def _badge_doc_payload(
    tournament_id: str,
    badge: dict[str, Any],
) -> dict[str, Any]:
    badge_key = str(badge["badge_key"])
    metadata = _badge_metadata(badge_key)
    leader_player_id = str(badge["leader_player_id"])
    kind = str(badge.get("kind", metadata.get("kind", "result")))
    explanation = str(metadata.get("description", ""))
    return {
        "tournamentId": tournament_id,
        "allowedTournamentId": tournament_id,
        "badgeKey": badge_key,
        "kind": kind,
        "title": str(metadata.get("name", badge_key)),
        "explanation": explanation,
        "caption": explanation,
        "emoji": str(metadata.get("emoji", "🏷️")),
        "border": str(metadata.get("border", "white" if kind == "bet" else "yellow")),
        "borderTone": str(metadata.get("border", "white" if kind == "bet" else "yellow")),
        "leader": {"playerId": leader_player_id},
        "followers": [{"playerId": str(player_id)} for player_id in badge.get("followers", [])],
        "indicators": _public_indicators(badge_key, badge.get("indicators", [])),
        "tone": _public_tone_for_badge(badge_key),
        "changedAt": str(badge.get("changed_at", "")),
    }


def _record_row_payload(
    row: dict[str, str],
    player_labels: dict[str, str] | None = None,
    match_labels: dict[str, str] | None = None,
) -> dict[str, str]:
    player_labels = player_labels or {}
    match_labels = match_labels or {}
    source_id = row.get("source_id", "")
    player_id = row.get("player_id")
    match_label = match_labels.get(source_id)
    fallback_label = row.get("label") or match_label or row.get("date") or source_id
    payload = {
        "label": player_labels.get(player_id, player_id) if player_id else fallback_label,
        "sourceId": source_id,
        "sourceLabel": row.get("source_label") or match_label or row.get("date") or source_id,
        "value": _public_text(row.get("value", "")),
    }

    if row.get("date"):
        payload["date"] = row["date"]
    if row.get("detail"):
        payload["detail"] = row["detail"]

    return payload


def _record_doc_payload(
    tournament_id: str,
    record_key: str,
    rows: list[dict[str, str]],
    player_labels: dict[str, str] | None = None,
    match_labels: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "tournamentId": tournament_id,
        "allowedTournamentId": tournament_id,
        "recordKey": record_key,
        "title": RECORD_METADATA.get(record_key, record_key),
        "rows": [_record_row_payload(row, player_labels, match_labels) for row in rows],
    }


def _score_or_none(data: Any) -> Score | None:
    if not isinstance(data, dict):
        return None
    try:
        return _score_from_data(data)
    except Exception:
        return None


def _outcome_from_score(score: Score | None) -> str | None:
    if score is None:
        return None
    if score.home > score.away:
        return "home"
    if score.away > score.home:
        return "away"
    return "draw"


def _string_field(data: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _match_tournament_id(match_data: dict[str, Any]) -> str:
    tournament_id = _string_field(match_data, "tournamentId", "tournamentKey", "tournament_id")
    if tournament_id is None:
        raise ValueError("Match is missing tournament id.")
    return tournament_id


def _load_players_for_stats(db: Any) -> list[PlayerStanding]:
    players: list[PlayerStanding] = []
    query = (
        db.collection("players")
        .where("isPlayer", "==", True)
        .where("status", "==", "active")
    )
    for player_snapshot in _query_stream(query):
        player_data = player_snapshot.to_dict() or {}
        players.append(
            PlayerStanding(
                player_id=player_data.get("id") or player_snapshot.id,
                registration_order=int(player_data.get("registrationOrder", 999_999)),
            )
        )
    return sorted(players, key=lambda row: (row.registration_order, row.player_id))


def _player_display_name_from_data(player_id: str, data: dict[str, Any]) -> str:
    display_name = _string_field(data, "displayName", "name")
    if display_name:
        return display_name

    first_name = _string_field(data, "firstName", "first_name")
    last_name = _string_field(data, "lastName", "last_name")
    if first_name and last_name:
        return f"{first_name} {last_name}"
    if first_name:
        return first_name

    return player_id


def _load_player_labels_for_stats(db: Any) -> dict[str, str]:
    labels: dict[str, str] = {}
    query = (
        db.collection("players")
        .where("isPlayer", "==", True)
        .where("status", "==", "active")
    )
    for player_snapshot in _query_stream(query):
        player_data = player_snapshot.to_dict() or {}
        player_id = str(player_data.get("id") or player_snapshot.id)
        labels[player_id] = _player_display_name_from_data(player_id, player_data)
    return labels


def _team_label_from_match(data: dict[str, Any], side: str) -> str | None:
    prefix = f"{side}Team"
    return _string_field(
        data,
        f"{prefix}NameSk",
        f"{prefix}Name",
        f"{prefix}DisplayName",
        f"{side}NameSk",
        f"{side}Name",
        f"{prefix}Code",
    )


def _match_label_from_data(match_id: str, data: dict[str, Any]) -> str:
    home = _team_label_from_match(data, "home")
    away = _team_label_from_match(data, "away")
    if home and away:
        return f"{home} - {away}"

    return _string_field(data, "label", "matchLabel") or match_id


def _load_match_labels_for_stats(db: Any, tournament_id: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    match_query = db.collection("matches").where("tournamentId", "==", tournament_id)
    for match_snapshot in _query_stream(match_query):
        match_data = match_snapshot.to_dict() or {}
        labels[match_snapshot.id] = _match_label_from_data(match_snapshot.id, match_data)
    return labels


def _load_bets_by_match_and_player(db: Any, match_id: str) -> dict[str, Score]:
    bets_by_player: dict[str, Score] = {}
    bet_query = db.collection("bets").where("matchId", "==", match_id)
    for bet_snapshot in _query_stream(bet_query):
        bet_data = bet_snapshot.to_dict() or {}
        player_id = bet_data.get("playerId")
        score = _score_or_none(bet_data.get("score"))
        if isinstance(player_id, str) and score is not None:
            bets_by_player[player_id] = score
    return bets_by_player


def _settlement_rows_from_doc(data: dict[str, Any]) -> list[dict[str, Any]]:
    return _settlement_lines_from_doc(data)


def _load_match_results_for_stats(db: Any, tournament_id: str) -> list[BadgeMatchPlayerResult]:
    match_results: list[BadgeMatchPlayerResult] = []
    match_query = db.collection("matches").where("tournamentId", "==", tournament_id)

    for match_snapshot in _query_stream(match_query):
        match_id = match_snapshot.id
        match_data = match_snapshot.to_dict() or {}
        settlement_snapshot = _document_get(db.collection("matchSettlements").document(match_id))
        if not settlement_snapshot.exists:
            continue

        settlement_data = settlement_snapshot.to_dict() or {}
        final_score = _score_or_none(match_data.get("finalScore"))
        final_outcome = _outcome_from_score(final_score)
        ticket_id = _ticket_id_from_match_data(match_data) or ""
        date = _string_field(match_data, "officialMatchdayKey") or ticket_id
        bets_by_player = _load_bets_by_match_and_player(db, match_id)

        for line in _settlement_rows_from_doc(settlement_data):
            player_id = _settlement_line_player_id(line)
            if player_id is None:
                continue

            bet_score = bets_by_player.get(player_id)
            match_results.append(
                BadgeMatchPlayerResult(
                    player_id=player_id,
                    match_id=match_id,
                    ticket_id=ticket_id,
                    date=date,
                    units=int(line.get("units", 0)),
                    exact_hit=_settlement_line_exact_hit(line),
                    bet_home=bet_score.home if bet_score else None,
                    bet_away=bet_score.away if bet_score else None,
                    final_home=final_score.home if final_score else None,
                    final_away=final_score.away if final_score else None,
                    bet_outcome=_outcome_from_score(bet_score),
                    final_outcome=final_outcome,
                    kickoff_at_sk=_string_field(match_data, "kickoffAtSk"),
                    home_tier=_string_field(match_data, "homeTeamTier", "home_tier"),
                    away_tier=_string_field(match_data, "awayTeamTier", "away_tier"),
                    home_code=_string_field(match_data, "homeTeamCode", "home_team_code"),
                    away_code=_string_field(match_data, "awayTeamCode", "away_team_code"),
                )
            )

    return sorted(match_results, key=lambda row: (row.date, row.match_id, row.player_id))


def _load_bet_predictions_for_stats(db: Any, tournament_id: str) -> list[BetPlayerPrediction]:
    predictions: list[BetPlayerPrediction] = []
    match_cache: dict[str, dict[str, Any] | None] = {}

    def match_data_for(match_id: str) -> dict[str, Any] | None:
        if match_id not in match_cache:
            snapshot = _document_get(db.collection("matches").document(match_id))
            match_cache[match_id] = snapshot.to_dict() or {} if snapshot.exists else None
        return match_cache[match_id]

    for snapshot in _query_stream(db.collection("ticketSnapshots")):
        snapshot_data = snapshot.to_dict() or {}
        ticket_id = _string_field(snapshot_data, "ticketId", "ticket_id") or snapshot.id
        rows = snapshot_data.get("bets")
        if not isinstance(rows, list):
            continue

        for row in rows:
            if not isinstance(row, dict):
                continue

            player_id = row.get("playerId")
            match_id = row.get("matchId")
            if not isinstance(player_id, str) or not isinstance(match_id, str):
                continue

            match_data = match_data_for(match_id)
            if match_data is None:
                continue

            try:
                if _match_tournament_id(match_data) != tournament_id:
                    continue
            except ValueError:
                continue

            score = _score_or_none(row.get("score"))
            if score is None:
                continue

            predictions.append(
                BetPlayerPrediction(
                    player_id=player_id,
                    match_id=match_id,
                    ticket_id=ticket_id,
                    date=_string_field(match_data, "officialMatchdayKey") or ticket_id,
                    bet_home=score.home,
                    bet_away=score.away,
                    home_tier=_string_field(match_data, "homeTeamTier", "home_tier"),
                    away_tier=_string_field(match_data, "awayTeamTier", "away_tier"),
                )
            )

    return sorted(predictions, key=lambda row: (row.date, row.ticket_id, row.match_id, row.player_id))


def _materialized_stats_docs(
    tournament_id: str,
    players: list[PlayerStanding],
    match_results: list[BadgeMatchPlayerResult],
    changed_at: str,
    bet_predictions: list[BetPlayerPrediction] | None = None,
    player_labels: dict[str, str] | None = None,
    match_labels: dict[str, str] | None = None,
) -> dict[str, dict[str, dict[str, Any]]]:
    daily_results = _daily_results_from_match_results(match_results)
    registration_order = {player.player_id: player.registration_order for player in players}
    badges = [
        *calculate_badges(
            players=players,
            daily_results=daily_results,
            match_results=match_results,
            changed_at=changed_at,
        ),
        *calculate_bet_badges(
            players=players,
            bets=bet_predictions or [],
            changed_at=changed_at,
        ),
    ]
    records = calculate_records(
        daily_results=_record_daily_results_from_badge_rows(daily_results),
        match_results=_record_match_results_from_badge_rows(match_results),
        registration_order=registration_order,
    )

    return {
        "badges": {
            str(badge["badge_key"]): _badge_doc_payload(tournament_id, badge)
            for badge in badges
        },
        "records": {
            record_key: _record_doc_payload(
                tournament_id,
                record_key,
                rows,
                player_labels=player_labels,
                match_labels=match_labels,
            )
            for record_key, rows in records.items()
            if rows
        },
    }


def _materialize_badges_and_records(db: Any, match_id: str) -> dict[str, int]:
    from firebase_admin import firestore

    match_snapshot = _document_get(db.collection("matches").document(match_id))
    if not match_snapshot.exists:
        raise ValueError(f"Match {match_id} does not exist.")

    match_data = match_snapshot.to_dict() or {}
    tournament_id = _match_tournament_id(match_data)
    changed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    docs = _materialized_stats_docs(
        tournament_id=tournament_id,
        players=_load_players_for_stats(db),
        match_results=_load_match_results_for_stats(db, tournament_id),
        changed_at=changed_at,
        bet_predictions=_load_bet_predictions_for_stats(db, tournament_id),
        player_labels=_load_player_labels_for_stats(db),
        match_labels=_load_match_labels_for_stats(db, tournament_id),
    )

    for badge_key, payload in docs["badges"].items():
        db.collection("badges").document(badge_key).set(
            {
                **payload,
                "rulesVersion": "tipparta-generic-v1",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

    for record_key, payload in docs["records"].items():
        db.collection("records").document(record_key).set(
            {
                **payload,
                "rulesVersion": "tipparta-generic-v1",
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )

    return {
        "badgeCount": len(docs["badges"]),
        "recordCount": len(docs["records"]),
    }


def _leaderboard_impacts(lines: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    impacts: dict[str, dict[str, int]] = {}
    for line in lines:
        player_id = _settlement_line_player_id(line)
        if player_id is None:
            continue

        impacts[player_id] = {
            "units": int(line.get("units", 0)),
            "exact_hits": 1 if _settlement_line_exact_hit(line) else 0,
        }

    return impacts


def _leaderboard_deltas(
    previous_settlement: dict[str, Any] | None,
    next_lines: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    previous_impacts = _leaderboard_impacts(_settlement_lines_from_doc(previous_settlement))
    next_impacts = _leaderboard_impacts(next_lines)

    deltas: dict[str, dict[str, int]] = {}
    for player_id in sorted(previous_impacts.keys() | next_impacts.keys()):
        previous = previous_impacts.get(player_id, {"units": 0, "exact_hits": 0})
        next_impact = next_impacts.get(player_id, {"units": 0, "exact_hits": 0})
        units_delta = next_impact["units"] - previous["units"]
        exact_hits_delta = next_impact["exact_hits"] - previous["exact_hits"]

        if units_delta != 0 or exact_hits_delta != 0:
            deltas[player_id] = {
                "units": units_delta,
                "exact_hits": exact_hits_delta,
            }

    return deltas


def _leaderboard_update_specs(
    player_id: str,
    delta: dict[str, int],
    ticket_id: str | None,
) -> list[tuple[str, str, dict[str, int | str]]]:
    specs: list[tuple[str, str, dict[str, int | str]]] = []
    units_delta = delta["units"]
    exact_hits_delta = delta["exact_hits"]

    if units_delta != 0:
        specs.append(("total", player_id, {"playerId": player_id, "units": units_delta}))

    if exact_hits_delta != 0:
        specs.append(("exact", player_id, {"playerId": player_id, "exactHits": exact_hits_delta}))

    if ticket_id and (units_delta != 0 or exact_hits_delta != 0):
        daily_payload: dict[str, int | str] = {"playerId": player_id}
        if units_delta != 0:
            daily_payload["units"] = units_delta
        if exact_hits_delta != 0:
            daily_payload["exactHits"] = exact_hits_delta
        specs.append((f"daily/{ticket_id}", player_id, daily_payload))

    return specs


def _leaderboard_ref(db: Any, board_key: str, player_id: str) -> Any:
    if board_key.startswith("daily/"):
        ticket_id = board_key.removeprefix("daily/")
        return (
            db.collection("leaderboards")
            .document("daily")
            .collection("tickets")
            .document(ticket_id)
            .collection("players")
            .document(player_id)
        )

    return (
        db.collection("leaderboards")
        .document(board_key)
        .collection("players")
        .document(player_id)
    )


def _increment_payload(payload: dict[str, int | str], firestore: Any) -> dict[str, Any]:
    next_payload: dict[str, Any] = {}
    for key, value in payload.items():
        if key == "playerId":
            next_payload[key] = value
        elif isinstance(value, int):
            next_payload[key] = firestore.Increment(value)
    return next_payload


def _write_settlement_and_leaderboards(db: Any, match_id: str) -> Any:
    from firebase_admin import firestore

    settlement_ref = db.collection("matchSettlements").document(match_id)

    @firestore.transactional
    def update_in_transaction(transaction: Any) -> Any:
        final_score, bets, ticket_id = _load_match_bets(db, match_id, transaction=transaction)
        settlement = settle_match(match_id=match_id, final_score=final_score, bets=bets)

        previous_snapshot = settlement_ref.get(transaction=transaction)
        previous_data = previous_snapshot.to_dict() if previous_snapshot.exists else None

        settlement_data = {
            **_settlement_doc_payload(settlement),
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "rulesVersion": "tipparta-generic-v1",
        }
        next_lines = _settlement_lines_from_doc(settlement_data)
        deltas = _leaderboard_deltas(previous_data, next_lines)

        transaction.set(settlement_ref, settlement_data)

        for player_id, delta in deltas.items():
            for board_key, spec_player_id, payload in _leaderboard_update_specs(player_id, delta, ticket_id):
                transaction.set(
                    _leaderboard_ref(db, board_key, spec_player_id),
                    {
                        **_increment_payload(payload, firestore),
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    },
                    merge=True,
                )

        # TODO: Materialize badge and record documents after matchday/ticket orchestration exists.

        return settlement

    return update_in_transaction(db.transaction())


def settlement_worker(request: Any):
    try:
        body = _request_json(request)
        _verify_worker_token(request, body)

        match_id = body.get("matchId")
        if not isinstance(match_id, str) or not match_id:
            return _json_response({"error": "matchId is required."}, 400)

        db = _firestore_client()
        settlement = _write_settlement_and_leaderboards(db, match_id)
        _materialize_badges_and_records(db, match_id)

        return _json_response(_dump_model(settlement))
    except PermissionError as error:
        return _json_response({"error": str(error)}, 403)
    except Exception as error:
        return _json_response({"error": str(error)}, 500)


try:
    from firebase_functions import https_fn

    settle_match_http = https_fn.on_request(secrets=["SETTLEMENT_WORKER_TOKEN"])(settlement_worker)
except ImportError:
    settle_match_http = settlement_worker
