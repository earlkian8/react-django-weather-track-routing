"""Hourly forecasts from Open-Meteo, batched and cached per grid cell."""

from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from itertools import batched
from typing import Any

from django.core.cache import cache

from routing.engine.weather import Forecast

from .http import get_json

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 100
MAX_WORKERS = 4
CACHE_S = 30 * 60

Cell = tuple[float, float]  # (lat, lng) on the 0.1 degree grid


def snap(lat: float, lng: float) -> Cell:
    """The 0.1 degree grid cell nearest to a point."""
    return (round(lat, 1), round(lng, 1))


def get_forecasts(cells: Iterable[Cell], start: datetime, end: datetime) -> dict[Cell, Forecast]:
    """Forecasts for every cell from `start` to `end`, both on the hour."""
    start_hour, end_hour = _format_hour(start), _format_hour(end)
    keys = {cell: f"forecast:{cell[0]}:{cell[1]}:{start_hour}:{end_hour}" for cell in cells}

    cached = cache.get_many(keys.values())
    forecasts = {cell: cached[key] for cell, key in keys.items() if key in cached}
    missing = [cell for cell in keys if cell not in forecasts]

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        batches = pool.map(
            lambda batch: _fetch_batch(batch, start_hour, end_hour), batched(missing, BATCH_SIZE)
        )
        fetched = {cell: forecast for batch in batches for cell, forecast in batch.items()}

    cache.set_many({keys[cell]: forecast for cell, forecast in fetched.items()}, CACHE_S)
    return forecasts | fetched


def _format_hour(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M")


def _fetch_batch(cells: tuple[Cell, ...], start_hour: str, end_hour: str) -> dict[Cell, Forecast]:
    data = get_json(
        FORECAST_URL,
        {
            "latitude": ",".join(str(lat) for lat, _ in cells),
            "longitude": ",".join(str(lng) for _, lng in cells),
            "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "timeformat": "unixtime",
            "start_hour": start_hour,
            "end_hour": end_hour,
        },
        "Open-Meteo",
    )
    locations = data if isinstance(data, list) else [data]  # a single location isn't wrapped
    return {
        cell: _parse_forecast(location["hourly"])
        for cell, location in zip(cells, locations, strict=True)
    }


def _parse_forecast(hourly: dict[str, Any]) -> Forecast:
    return Forecast(
        start=datetime.fromtimestamp(hourly["time"][0], timezone.utc),
        wind_mph=hourly["wind_speed_10m"],
        gust_mph=hourly["wind_gusts_10m"],
        rain_in=[_add_liquid(r, s) for r, s in zip(hourly["rain"], hourly["showers"], strict=True)],
        snow_in=hourly["snowfall"],
    )


def _add_liquid(rain: float | None, showers: float | None) -> float | None:
    """Showers are convective rain, reported separately but just as wet."""
    if rain is None or showers is None:
        return None
    return round(rain + showers, 3)  # float noise must not shift a total across a threshold
