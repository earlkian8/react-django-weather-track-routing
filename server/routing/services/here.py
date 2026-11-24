"""HERE geocoding and truck routing."""

import logging
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Any

import flexpolyline
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from routing.engine.checkpoints import build_profile
from routing.engine.geo import Point
from routing.exceptions import UpstreamError

from .http import get_json

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocode.search.hereapi.com/v1/geocode"
ROUTES_URL = "https://router.hereapi.com/v8/routes"

KG_PER_LB = 0.45359237
ROUTE_IDS = "ABC"

# Tried in order, only while there are fewer routes than ROUTE_IDS.
ROUTE_VARIANTS = ({}, {"routingMode": "short"}, {"avoid[features]": "tollRoad"})

# Routes sharing this much of their points (to 0.01 degrees) are the same route.
DUPLICATE_OVERLAP = 0.9


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lng: float


@dataclass(frozen=True)
class RouteOption:
    id: str
    points: list[Point]
    cum_dist_m: list[float]
    cum_time_s: list[float]
    distance_m: float
    duration_s: float
    via: list[str]  # up to two main route numbers
    ferry_m: float = 0.0


def loaded_weight_kg(load_lb: float) -> int:
    """Loaded truck weight in whole kilograms, which is all HERE accepts."""
    return round((settings.TRUCK_TARE_LB + load_lb) * KG_PER_LB)


def geocode(query: str, limit: int = 5) -> list[Place]:
    data = get_json(
        GEOCODE_URL,
        {
            "q": query,
            "limit": limit,
            "lang": "en-US",
            "apiKey": _api_key(),
        },
        "HERE Geocoding",
    )
    return [
        Place(item["address"]["label"], item["position"]["lat"], item["position"]["lng"])
        for item in data["items"]
    ]


def truck_routes(
    origin: Point, destination: Point, departure: datetime, gross_weight_kg: float
) -> list[RouteOption]:
    """Up to three distinct truck routes in HERE's order; empty if there are none."""
    if departure.utcoffset() is None:
        raise ValueError("departure must be timezone-aware")

    params = {
        "transportMode": "truck",
        "origin": _format_point(origin),
        "destination": _format_point(destination),
        "departureTime": departure.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "alternatives": 2,
        "vehicle[grossWeight]": round(gross_weight_kg),
        "return": "polyline,summary",
        "spans": "length,duration,routeNumbers",
        "apiKey": _api_key(),
    }

    options: list[RouteOption] = []
    for variant in ROUTE_VARIANTS:
        try:
            data = get_json(ROUTES_URL, params | variant, "HERE Routing")
        except UpstreamError as exc:
            if not options:
                raise
            # The retries only add choice, so don't lose the routes we have.
            logger.warning("Skipping extra routes: %s", exc.detail)
            continue

        for route in data["routes"]:
            option = _parse_route(route)
            if not any(_is_duplicate(option, other) for other in options):
                options.append(option)
        if len(options) >= len(ROUTE_IDS):
            break

    return [replace(option, id=id_) for id_, option in zip(ROUTE_IDS, options)]


def _api_key() -> str:
    if not settings.HERE_API_KEY:
        raise ImproperlyConfigured("HERE_API_KEY is not set. Add it to server/.env.")
    return settings.HERE_API_KEY


def _format_point(point: Point) -> str:
    return f"{point[0]},{point[1]}"


def _parse_route(route: dict[str, Any]) -> RouteOption:
    points: list[Point] = []
    cum_dist_m: list[float] = []
    cum_time_s: list[float] = []
    spans: list[dict[str, Any]] = []
    ferry_m = 0.0
    start = _departure(route["sections"][0])

    for section in route["sections"]:
        # Span offsets count from the start of their own section.
        section_points = flexpolyline.decode(section["polyline"])
        section_dist_m, section_time_s = build_profile(
            section_points,
            [(s["offset"], s["length"], s["duration"]) for s in section["spans"]],
        )

        # A later section starts on the vertex the previous one ended on.
        skip = 1 if points else 0
        base_m = cum_dist_m[-1] if points else 0.0
        base_s = cum_time_s[-1] if points else 0.0
        departure = _departure(section)
        if start and departure:
            # Boarding and leaving a ferry take time between sections, outside any span.
            base_s = max(base_s, (departure - start).total_seconds())
        points += section_points[skip:]
        cum_dist_m += [base_m + d for d in section_dist_m[skip:]]
        cum_time_s += [base_s + t for t in section_time_s[skip:]]
        spans += section["spans"]
        if section.get("transport", {}).get("mode") == "ferry":
            ferry_m += section_dist_m[-1]

    return RouteOption(
        id="",  # assigned once duplicates are gone
        points=points,
        cum_dist_m=cum_dist_m,
        cum_time_s=cum_time_s,
        distance_m=cum_dist_m[-1],
        duration_s=cum_time_s[-1],
        via=_via(spans),
        ferry_m=ferry_m,
    )


def _departure(section: dict[str, Any]) -> datetime | None:
    time = section.get("departure", {}).get("time")
    return datetime.fromisoformat(time) if time else None


def _via(spans: list[dict[str, Any]]) -> list[str]:
    """The two route numbers covering the most distance."""
    length_m: dict[str, float] = defaultdict(float)
    for span in spans:
        entries = span.get("routeNumbers")
        if not isinstance(entries, list):
            continue
        values = [entry.get("value") for entry in entries if isinstance(entry, dict)]
        for number in {value for value in values if value and isinstance(value, str)}:
            length_m[number] += span["length"]
    return sorted(length_m, key=lambda number: (-length_m[number], number))[:2]


def _is_duplicate(a: RouteOption, b: RouteOption) -> bool:
    cells_a, cells_b = _cells(a), _cells(b)
    # Against the larger set, so a route plus a long extra leg stays distinct.
    return len(cells_a & cells_b) >= DUPLICATE_OVERLAP * max(len(cells_a), len(cells_b))


def _cells(option: RouteOption) -> set[Point]:
    return {(round(lat, 2), round(lng, 2)) for lat, lng in option.points}
