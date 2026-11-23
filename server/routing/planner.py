"""Builds trip plans and their heatmaps from routing, weather and risk."""

import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from django.core.cache import cache
from rest_framework.exceptions import NotFound, ValidationError

from routing.engine.checkpoints import Checkpoint, sample_checkpoints
from routing.engine.corridor import corridor_cells
from routing.engine.geo import METERS_PER_MILE
from routing.engine.recommend import RouteScore, explain, rank, score_route
from routing.engine.risk import Assessment, Conditions, assess
from routing.engine.weather import Forecast
from routing.services import here, open_meteo
from routing.services.here import Place, RouteOption
from routing.services.open_meteo import Cell, snap

PLAN_CACHE_S = 60 * 60
MIN_WINDOW = timedelta(hours=48)
HEATMAP_HOURS = 49  # both ends of the minimum window

NO_TRAVEL_ADVISORY = "Every route crosses No Travel conditions. Consider delaying departure."


@dataclass(frozen=True)
class AssessedCheckpoint:
    checkpoint: Checkpoint
    conditions: Conditions | None  # None, like the assessment, without a forecast
    assessment: Assessment | None


@dataclass(frozen=True)
class AssessedRoute:
    option: RouteOption
    checkpoints: list[AssessedCheckpoint]
    score: RouteScore


def create_plan(request: dict[str, Any]) -> dict[str, Any]:
    """Plan a trip from validated PlanRequestSerializer data."""
    departure = request["departure_time"]
    load_lb = request["load_weight_lb"]
    interval_mi = request["checkpoint_interval_mi"]
    origin = _resolve_place("origin", request["origin"])
    destination = _resolve_place("destination", request["destination"])

    options = here.truck_routes(
        (origin.lat, origin.lng),
        (destination.lat, destination.lng),
        departure,
        here.loaded_weight_kg(load_lb),
    )
    if not options:
        raise ValidationError({"non_field_errors": ["No truck route found between these places."]})

    sampled = [
        sample_checkpoints(o.points, o.cum_dist_m, o.cum_time_s, departure, interval_mi)
        for o in options
    ]
    window_start, window_end = _weather_window(departure, max(o.duration_s for o in options))
    cells = {snap(c.lat, c.lng) for checkpoints in sampled for c in checkpoints}
    forecasts = open_meteo.get_forecasts(cells, window_start, window_end)

    assessed = {
        option.id: _assess_route(option, checkpoints, forecasts, load_lb)
        for option, checkpoints in zip(options, sampled, strict=True)
    }
    ranked = rank(route.score for route in assessed.values())
    best, runner_up = ranked[0], ranked[1] if len(ranked) > 1 else None

    plan_id = str(uuid.uuid4())
    cache.set(
        _plan_key(plan_id),
        {
            "paths": [option.points for option in options],
            "window_start": window_start,
            "window_end": window_end,
            "load": load_lb,
        },
        PLAN_CACHE_S,
    )

    return {
        "id": plan_id,
        "origin": asdict(origin),
        "destination": asdict(destination),
        "departure_time": _iso(departure),
        "load_weight_lb": load_lb,
        "checkpoint_interval_mi": interval_mi,
        "recommended_route_id": best.route_id,
        "recommendation": explain(best, runner_up),
        "advisory": NO_TRAVEL_ADVISORY if all(s.no_travel_miles > 0 for s in ranked) else None,
        "routes": [
            _present_route(assessed[score.route_id], position)
            for position, score in enumerate(ranked, start=1)
        ],
    }


def build_heatmap(plan_id: uuid.UUID) -> dict[str, Any]:
    """Hourly risk and weather for the cells around a recent plan's routes."""
    plan = cache.get(_plan_key(str(plan_id)))
    if plan is None:
        raise NotFound("Plan expired, please create a new plan")

    cells, step = corridor_cells(plan["paths"])
    forecasts = open_meteo.get_forecasts(cells, plan["window_start"], plan["window_end"])

    risk, wind, rain, snow = [], [], [], []
    for cell in cells:
        hours = [forecasts[cell].hour(i) for i in range(HEATMAP_HOURS)]
        risk.append([assess(c, plan["load"]).level if c else None for c in hours])
        wind.append([round(c.wind_mph, 1) if c else None for c in hours])
        rain.append([round(c.rain_in, 2) if c else None for c in hours])
        snow.append([round(c.snow_in, 2) if c else None for c in hours])

    return {
        "plan_id": str(plan_id),
        "start": _iso(plan["window_start"]),
        "hours": HEATMAP_HOURS,
        "cell_size_deg": step,
        "cells": cells,
        "risk": risk,
        "wind": wind,
        "rain": rain,
        "snow": snow,
    }


def _resolve_place(field: str, place: str | Place) -> Place:
    if isinstance(place, Place):
        return place
    matches = here.geocode(place)
    if not matches:
        raise ValidationError({field: [f'No place found for "{place}".']})
    return matches[0]


def _weather_window(departure: datetime, longest_trip_s: float) -> tuple[datetime, datetime]:
    start = _floor_hour(departure)
    last_needed = _floor_hour(departure + timedelta(seconds=longest_trip_s) + timedelta(hours=1))
    return start, max(start + MIN_WINDOW, last_needed)


def _floor_hour(when: datetime) -> datetime:
    return when.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _assess_route(
    option: RouteOption,
    checkpoints: list[Checkpoint],
    forecasts: dict[Cell, Forecast],
    load_lb: int,
) -> AssessedRoute:
    assessed = []
    for checkpoint in checkpoints:
        forecast = forecasts[snap(checkpoint.lat, checkpoint.lng)]
        conditions = forecast.conditions_at(checkpoint.eta)
        assessment = assess(conditions, load_lb) if conditions else None
        assessed.append(AssessedCheckpoint(checkpoint, conditions, assessment))

    segments = [
        (a.checkpoint.segment_miles, a.assessment.level if a.assessment else None)
        for a in assessed
    ]
    return AssessedRoute(option, assessed, score_route(option.id, segments, option.duration_s))


def _present_route(route: AssessedRoute, position: int) -> dict[str, Any]:
    option, score = route.option, route.score
    known = [a.assessment.level for a in route.checkpoints if a.assessment]
    return {
        "id": option.id,
        "name": f"Route {option.id}",
        "rank": position,
        "via": option.via,
        "distance_mi": round(option.distance_m / METERS_PER_MILE, 1),
        "duration_min": round(option.duration_s / 60),
        "arrival_time": _iso(route.checkpoints[-1].checkpoint.eta),
        "geometry": [[round(lng, 5), round(lat, 5)] for lat, lng in option.points],
        "summary": {
            "miles_by_risk": {
                risk.key: round(miles, 1) for risk, miles in score.miles_by_risk.items()
            },
            "no_travel_miles": round(score.no_travel_miles, 1),
            "severe_miles": round(score.severe_miles, 1),
            "high_miles": round(score.high_miles, 1),
            "unknown_miles": round(score.unknown_miles, 1),
            "avg_risk": None if score.avg_risk is None else round(score.avg_risk, 3),
            "worst_risk": max(known).key if known else "unknown",
        },
        "checkpoints": [_present_checkpoint(a) for a in route.checkpoints],
    }


def _present_checkpoint(assessed: AssessedCheckpoint) -> dict[str, Any]:
    checkpoint, assessment = assessed.checkpoint, assessed.assessment
    return {
        "mile": round(checkpoint.mile, 1),
        "lat": checkpoint.lat,
        "lng": checkpoint.lng,
        "eta": _iso(checkpoint.eta),
        "segment_miles": round(checkpoint.segment_miles, 1),
        "weather": _present_weather(assessed.conditions),
        "risk": assessment.level.key if assessment else "unknown",
        "risk_label": assessment.level.label if assessment else "Unknown",
        "risk_level": assessment.level if assessment else None,
        "factors": assessment.factors if assessment else [],
    }


def _present_weather(conditions: Conditions | None) -> dict[str, float | None] | None:
    if conditions is None:
        return None
    gust = conditions.gust_mph
    return {
        "wind_mph": round(conditions.wind_mph, 1),
        "gust_mph": None if gust is None else round(gust, 1),
        "rain_in_hr": round(conditions.rain_in, 2),
        "snow_in_hr": round(conditions.snow_in, 2),
    }


def _plan_key(plan_id: str) -> str:
    return f"plan:{plan_id}"


def _iso(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
