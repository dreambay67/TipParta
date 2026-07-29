from collections.abc import Iterable

MAX_MATCH_LOSS_UNITS = 100
FIVE_EUR_UNITS = 100
FOUR_EUR_UNITS = 80
THREE_EUR_UNITS = 60
ONE_EUR_UNITS = 20
FIFTY_CENT_UNITS = 10


def capped_loss(units: int) -> int:
    return min(units, MAX_MATCH_LOSS_UNITS)


def split_units_largest_remainder(
    total_units: int,
    recipients: Iterable[tuple[int, str]],
) -> dict[str, int]:
    ordered_recipients = sorted(recipients, key=lambda item: (item[0], item[1]))

    if total_units < 0:
        raise ValueError("total_units must be non-negative")

    if not ordered_recipients:
        if total_units == 0:
            return {}
        raise ValueError("cannot split positive units without recipients")

    base = total_units // len(ordered_recipients)
    remainder = total_units % len(ordered_recipients)

    allocations: dict[str, int] = {}
    for index, (_, player_id) in enumerate(ordered_recipients):
        allocations[player_id] = base + (1 if index < remainder else 0)

    return allocations


def split_units_equal_floor(
    total_units: int,
    recipients: Iterable[tuple[int, str]],
) -> tuple[dict[str, int], int]:
    ordered_recipients = sorted(recipients, key=lambda item: (item[0], item[1]))

    if total_units < 0:
        raise ValueError("total_units must be non-negative")

    if not ordered_recipients:
        if total_units == 0:
            return {}, 0
        raise ValueError("cannot split positive units without recipients")

    base = total_units // len(ordered_recipients)
    allocations = {player_id: base for _, player_id in ordered_recipients}
    unallocated_units = total_units - (base * len(ordered_recipients))

    return allocations, unallocated_units
