from typing import Literal

from .models import Bet, MatchSettlement, PlayerSettlement, Score
from .money import (
    FIFTY_CENT_UNITS,
    FOUR_EUR_UNITS,
    MAX_MATCH_LOSS_UNITS,
    ONE_EUR_UNITS,
    THREE_EUR_UNITS,
    capped_loss,
    split_units_equal_floor,
)

Outcome = Literal["home", "draw", "away"]

NO_WINNER_LABEL = "no_winner_all_wrong_or_missing"


def _outcome(score: Score) -> Outcome:
    if score.home > score.away:
        return "home"
    if score.away > score.home:
        return "away"
    return "draw"


def _goal_difference(score: Score) -> int:
    return score.home - score.away


def _is_exact(score: Score | None, final_score: Score) -> bool:
    return score is not None and score.home == final_score.home and score.away == final_score.away


def _loss_with_exact_win_winners(bet: Bet, final_score: Score) -> tuple[int, str]:
    if bet.score is None:
        return MAX_MATCH_LOSS_UNITS, "missing_bet_loss"

    bet_outcome = _outcome(bet.score)
    final_outcome = _outcome(final_score)

    if bet_outcome == "draw":
        return FOUR_EUR_UNITS, "draw_loss"

    if bet_outcome != final_outcome:
        return MAX_MATCH_LOSS_UNITS, "wrong_winner_loss"

    if abs(_goal_difference(bet.score)) == abs(_goal_difference(final_score)):
        return FIFTY_CENT_UNITS, "correct_winner_exact_goal_difference_loss"

    return ONE_EUR_UNITS, "correct_winner_loss"


def _loss_with_exact_draw_winners(bet: Bet) -> tuple[int, str]:
    if bet.score is None:
        return MAX_MATCH_LOSS_UNITS, "missing_bet_loss"

    if _outcome(bet.score) != "draw":
        return MAX_MATCH_LOSS_UNITS, "wrong_winner_loss"

    return ONE_EUR_UNITS, "draw_non_exact_loss"


def _loss_without_exact_win_winners(
    bet: Bet,
    final_score: Score,
    winner_ids: set[str],
) -> tuple[int, str]:
    if bet.score is None:
        return MAX_MATCH_LOSS_UNITS, "missing_bet_loss"

    if bet.player_id in winner_ids:
        return 0, "closest_goal_difference_winner"

    bet_outcome = _outcome(bet.score)
    final_outcome = _outcome(final_score)

    if bet_outcome == final_outcome:
        return FIFTY_CENT_UNITS, "correct_winner_not_closest_loss"

    if bet_outcome == "draw":
        return THREE_EUR_UNITS, "draw_loss"

    return FOUR_EUR_UNITS, "wrong_winner_loss"


def _loss_without_exact_draw_winners(
    bet: Bet,
    winner_ids: set[str],
) -> tuple[int, str]:
    if bet.score is None:
        return MAX_MATCH_LOSS_UNITS, "missing_bet_loss"

    if bet.player_id in winner_ids:
        return 0, "closest_draw_goal_count_winner"

    if _outcome(bet.score) == "draw":
        return FIFTY_CENT_UNITS, "draw_not_closest_loss"

    return FOUR_EUR_UNITS, "wrong_winner_loss"


def _winner_allocations(total_loss_units: int, winners: list[Bet]) -> tuple[dict[str, int], int]:
    return split_units_equal_floor(
        total_loss_units,
        ((winner.registration_order, winner.player_id) for winner in winners),
    )


def _no_winner_settlement(match_id: str, final_score: Score, bets: list[Bet]) -> MatchSettlement:
    settlements = [
        PlayerSettlement(
            player_id=bet.player_id,
            units=0,
            label=NO_WINNER_LABEL,
            exact_hit=_is_exact(bet.score, final_score),
        )
        for bet in bets
    ]
    return MatchSettlement(match_id=match_id, settlements=settlements, checksum_units=0)


def settle_match(match_id: str, final_score: Score, bets: list[Bet]) -> MatchSettlement:
    final_outcome = _outcome(final_score)
    exact_winners = [bet for bet in bets if _is_exact(bet.score, final_score)]

    if exact_winners:
        winners = exact_winners
        winner_ids = {bet.player_id for bet in winners}
        winner_label = "exact_score_draw_winner" if final_outcome == "draw" else "exact_score_winner"

        def loss_for(bet: Bet) -> tuple[int, str]:
            if bet.player_id in winner_ids:
                return 0, winner_label
            if final_outcome == "draw":
                return _loss_with_exact_draw_winners(bet)
            return _loss_with_exact_win_winners(bet, final_score)

    elif final_outcome == "draw":
        draw_bets = [bet for bet in bets if bet.score is not None and _outcome(bet.score) == "draw"]
        if not draw_bets:
            return _no_winner_settlement(match_id, final_score, bets)

        final_goal_count = final_score.home
        closest_distance = min(abs(bet.score.home - final_goal_count) for bet in draw_bets if bet.score)
        winners = [
            bet
            for bet in draw_bets
            if bet.score is not None and abs(bet.score.home - final_goal_count) == closest_distance
        ]
        winner_ids = {bet.player_id for bet in winners}
        winner_label = "closest_draw_goal_count_winner"

        def loss_for(bet: Bet) -> tuple[int, str]:
            return _loss_without_exact_draw_winners(bet, winner_ids)

    else:
        correct_winner_bets = [
            bet
            for bet in bets
            if bet.score is not None and _outcome(bet.score) == final_outcome
        ]
        if not correct_winner_bets:
            return _no_winner_settlement(match_id, final_score, bets)

        final_margin = abs(_goal_difference(final_score))
        closest_distance = min(
            abs(abs(_goal_difference(bet.score)) - final_margin)
            for bet in correct_winner_bets
            if bet.score
        )
        winners = [
            bet
            for bet in correct_winner_bets
            if bet.score is not None
            and abs(abs(_goal_difference(bet.score)) - final_margin) == closest_distance
        ]
        winner_ids = {bet.player_id for bet in winners}
        winner_label = "closest_goal_difference_winner"

        def loss_for(bet: Bet) -> tuple[int, str]:
            return _loss_without_exact_win_winners(bet, final_score, winner_ids)

    winner_count = len(winners)
    losses: dict[str, tuple[int, str]] = {}
    for bet in bets:
        loss_units, label = loss_for(bet)
        losses[bet.player_id] = (capped_loss(loss_units * winner_count), label)

    total_loss_units = sum(loss_units for loss_units, _ in losses.values())
    winner_units, unallocated_units = _winner_allocations(total_loss_units, winners)

    settlements = []
    for bet in bets:
        if bet.player_id in winner_ids:
            units = winner_units[bet.player_id]
            label = winner_label
        else:
            loss_units, label = losses[bet.player_id]
            units = -loss_units

        settlements.append(
            PlayerSettlement(
                player_id=bet.player_id,
                units=units,
                label=label,
                exact_hit=_is_exact(bet.score, final_score),
            )
        )

    checksum_units = sum(settlement.units for settlement in settlements)
    if checksum_units + unallocated_units != 0:
        raise ValueError(
            f"Settlement checksum plus unallocated pot must be zero, got {checksum_units} + {unallocated_units}"
        )

    return MatchSettlement(
        match_id=match_id,
        settlements=settlements,
        checksum_units=checksum_units,
        unallocated_units=unallocated_units,
    )
