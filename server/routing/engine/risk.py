"""Weather risk classification for a single point on a route."""

from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def key(self) -> str:
        return self.name.lower()

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


@dataclass(frozen=True, kw_only=True)
class Conditions:
    wind_mph: float  # sustained; this is what gets classified
    gust_mph: float | None = None  # informational only
    rain_in: float  # per hour
    snow_in: float  # per hour


@dataclass(frozen=True)
class Assessment:
    level: Risk
    factors: list[str]


def _classify_wind(mph: float) -> Risk:
    if mph >= 55:
        return Risk.NO_TRAVEL
    if mph >= 45:
        return Risk.SEVERE
    if mph >= 35:
        return Risk.HIGH
    if mph >= 25:
        return Risk.MODERATE
    return Risk.LOW


def _apply_load(wind: Risk, load_lb: float) -> Risk:
    """Escalate a wind level for heavy loads. No Travel already holds for any load."""
    if wind is Risk.SEVERE and load_lb > 30_000:
        return Risk.NO_TRAVEL
    if wind is Risk.HIGH and load_lb > 40_000:
        return Risk.SEVERE
    return wind


def _classify_rain(inches: float) -> Risk:
    if inches > 1.00:  # exactly 1.00 is still Severe
        return Risk.NO_TRAVEL
    if inches >= 0.50:
        return Risk.SEVERE
    if inches >= 0.25:
        return Risk.HIGH
    if inches >= 0.10:
        return Risk.MODERATE
    return Risk.LOW


def _classify_snow(inches: float) -> Risk:
    if inches > 3.0:  # exactly 3.0 is still Severe
        return Risk.NO_TRAVEL
    if inches >= 2.0:
        return Risk.SEVERE
    if inches >= 1.0:
        return Risk.HIGH
    if inches >= 0.5:
        return Risk.MODERATE
    return Risk.LOW


def assess(conditions: Conditions, load_lb: float) -> Assessment:
    """Rate conditions by the worst of wind (load-adjusted), rain and snow."""
    base_wind = _classify_wind(conditions.wind_mph)
    wind = _apply_load(base_wind, load_lb)

    # :g avoids rounding a value across a threshold (54.9 must not read as 55).
    wind_text = f"Wind {conditions.wind_mph:g} mph"
    if wind is not base_wind:
        wind_text += f" with {load_lb:,.0f} lb load"

    rated = [
        (wind, wind_text),
        (_classify_rain(conditions.rain_in), f"Rain {conditions.rain_in:g} in/hr"),
        (_classify_snow(conditions.snow_in), f"Snow {conditions.snow_in:g} in/hr"),
    ]
    # The sort is stable, so ties keep wind, rain, snow order.
    rated.sort(key=lambda item: item[0], reverse=True)

    return Assessment(
        level=rated[0][0],
        factors=[f"{text} ({risk.label})" for risk, text in rated if risk is not Risk.LOW],
    )
