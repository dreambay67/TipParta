from pydantic import BaseModel, Field


class Score(BaseModel):
    home: int = Field(ge=0)
    away: int = Field(ge=0)


class Bet(BaseModel):
    player_id: str = Field(min_length=1)
    score: Score | None
    registration_order: int


class PlayerSettlement(BaseModel):
    player_id: str
    units: int
    label: str
    exact_hit: bool


class MatchSettlement(BaseModel):
    match_id: str
    settlements: list[PlayerSettlement]
    checksum_units: int
    unallocated_units: int = 0
