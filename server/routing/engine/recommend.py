"""Score routes by the risk along them, rank them, and explain the choice."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from math import inf
from typing import NamedTuple

from .risk import Risk


@dataclass(frozen=True)
class RouteScore:
    route_id: str
    miles_by_risk: dict[Risk, float]  # every level is present
    unknown_miles: float  # no forecast; excluded from everything else
    avg_risk: float | None  # distance-weighted; None if nothing is known
    duration_s: float

    @property
    def no_travel_miles(self) -> float:
        return self.miles_by_risk[Risk.NO_TRAVEL]

    @property
    def severe_miles(self) -> float:
        return self.miles_by_risk[Risk.SEVERE]

    @property
    def high_miles(self) -> float:
        return self.miles_by_risk[Risk.HIGH]


def score_route(
    route_id: str, segments: Iterable[tuple[float, Risk | None]], duration_s: float
) -> RouteScore:
    """Score a route from (segment_miles, risk); a risk of None means no forecast."""
    miles_by_risk = {risk: 0.0 for risk in Risk}
    unknown_miles = 0.0
    for miles, risk in segments:
        if risk is None:
            unknown_miles += miles
        else:
            miles_by_risk[risk] += miles

    known_miles = sum(miles_by_risk.values())
    weighted = sum(risk * miles for risk, miles in miles_by_risk.items())
    return RouteScore(
        route_id=route_id,
        miles_by_risk=miles_by_risk,
        unknown_miles=unknown_miles,
        avg_risk=weighted / known_miles if known_miles > 0 else None,
        duration_s=duration_s,
    )


def _compare_miles(best: float, other: float) -> str:
    return f"{best:g} mi vs {other:g} mi"


def _compare_risk(best: float, other: float) -> str:
    best_text, other_text = ("unknown" if v == inf else f"{v:g}" for v in (best, other))
    return f"{best_text} vs {other_text}"


def _compare_durations(best: int, other: int) -> str:
    # Seconds only matter when the minutes would otherwise read the same.
    seconds = best // 60 == other // 60
    return f"{_format_duration(best, seconds)} vs {_format_duration(other, seconds)}"


def _format_duration(total_s: int, seconds: bool) -> str:
    hours, rest = divmod(total_s, 3600)
    minutes, secs = divmod(rest, 60)
    text = f"{hours} h {minutes} min" if hours else f"{minutes} min"
    return f"{text} {secs} s" if seconds else text


class Criterion(NamedTuple):
    name: str
    value: Callable[[RouteScore], float]  # rounded, so float noise can't decide; lower wins
    compare: Callable[[float, float], str]


# In strict order of priority. No Travel isn't in the brief's ranking; it is
# treated as worse than Severe.
CRITERIA = (
    Criterion("Fewest no-travel miles", lambda s: round(s.no_travel_miles, 1), _compare_miles),
    Criterion("Fewest severe miles", lambda s: round(s.severe_miles, 1), _compare_miles),
    Criterion("Fewest high miles", lambda s: round(s.high_miles, 1), _compare_miles),
    Criterion(
        "Lowest average risk",
        lambda s: inf if s.avg_risk is None else round(s.avg_risk, 3),
        _compare_risk,
    ),
    Criterion("Shortest duration", lambda s: round(s.duration_s), _compare_durations),
)


def rank(scores: Iterable[RouteScore]) -> list[RouteScore]:
    """Best route first. Full ties keep their input order."""
    return sorted(scores, key=lambda score: [c.value(score) for c in CRITERIA])


def explain(best: RouteScore, runner_up: RouteScore | None) -> str:
    """Say why `best` ranks ahead of `runner_up` (None if there is only one route)."""
    if runner_up is None:
        return f"Route {best.route_id} is the only route available."

    for criterion in CRITERIA:
        ours, theirs = criterion.value(best), criterion.value(runner_up)
        if ours != theirs:
            return f"{criterion.name}: {criterion.compare(ours, theirs)} on Route {runner_up.route_id}."

    return f"Route {best.route_id} ties with Route {runner_up.route_id} on every criterion."
