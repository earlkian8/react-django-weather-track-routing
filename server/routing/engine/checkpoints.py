"""Turn a routed polyline into evenly spaced checkpoints with real ETAs."""

from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from itertools import accumulate, pairwise

from .geo import METERS_PER_MILE, Point, haversine_m, interpolate

# (offset into the polyline, length_m, duration_s)
Span = tuple[int, float, float]

# A regular checkpoint this close to the destination is replaced by it.
MIN_LAST_GAP = 0.25  # of an interval
# Absorbs float error so a gap of exactly MIN_LAST_GAP counts as within it.
DISTANCE_TOLERANCE_M = 1e-3


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lat: float
    lng: float
    eta: datetime  # aware, UTC
    segment_miles: float  # stretch of road this checkpoint represents


def build_profile(
    points: Sequence[Point], spans: Sequence[Span]
) -> tuple[list[float], list[float]]:
    """Return (cumulative meters, cumulative seconds) at every polyline vertex.

    Each span runs to the next span's offset (the last one to the end of the
    polyline). Its length and duration are split across its edges in proportion
    to their haversine lengths.
    """
    if len(points) < 2:
        raise ValueError("a route needs at least two points")

    last = len(points) - 1
    bounds = [span[0] for span in spans] + [last]
    if bounds[0] != 0 or any(a > b for a, b in pairwise(bounds)):
        raise ValueError("span offsets must start at 0, not decrease, and stay on the polyline")

    edge_m = [0.0] * last
    edge_s = [0.0] * last
    for (start, length_m, duration_s), end in zip(spans, bounds[1:]):
        if start == end:
            # The span covers no edge. Put it on the edge before it (or the
            # first edge) so the route totals still match what was reported.
            start = max(start - 1, 0)
            end = start + 1

        weights = [haversine_m(points[i], points[i + 1]) for i in range(start, end)]
        total = sum(weights)
        if total == 0:
            weights = [1.0] * len(weights)
            total = len(weights)

        for i, weight in enumerate(weights, start):
            edge_m[i] += length_m * weight / total
            edge_s[i] += duration_s * weight / total

    return list(accumulate(edge_m, initial=0.0)), list(accumulate(edge_s, initial=0.0))


def sample_checkpoints(
    points: Sequence[Point],
    cum_dist_m: Sequence[float],
    cum_time_s: Sequence[float],
    departure: datetime,
    interval_mi: float,
) -> list[Checkpoint]:
    """Checkpoints at mile 0, every `interval_mi`, and the destination."""
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    if departure.utcoffset() is None:
        raise ValueError("departure must be timezone-aware")

    departure = departure.astimezone(timezone.utc)
    targets = _target_distances(cum_dist_m[-1], interval_mi * METERS_PER_MILE)

    checkpoints = []
    for i, target in enumerate(targets):
        previous = targets[max(i - 1, 0)]
        following = targets[min(i + 1, len(targets) - 1)]
        (lat, lng), seconds = _locate(points, cum_dist_m, cum_time_s, target)
        checkpoints.append(
            Checkpoint(
                mile=target / METERS_PER_MILE,
                lat=lat,
                lng=lng,
                eta=departure + timedelta(seconds=seconds),
                segment_miles=(following - previous) / 2 / METERS_PER_MILE,
            )
        )
    return checkpoints


def _target_distances(total_m: float, interval_m: float) -> list[float]:
    targets = [i * interval_m for i in range(int(total_m // interval_m) + 1)]
    gap = total_m - targets[-1]
    # The start is never replaced, however short the route.
    if len(targets) > 1 and gap <= MIN_LAST_GAP * interval_m + DISTANCE_TOLERANCE_M:
        targets.pop()
    return [*targets, total_m]


def _locate(
    points: Sequence[Point],
    cum_dist_m: Sequence[float],
    cum_time_s: Sequence[float],
    target_m: float,
) -> tuple[Point, float]:
    """Position and elapsed seconds at a distance along the route."""
    end = min(bisect_right(cum_dist_m, target_m), len(points) - 1)
    start = end - 1
    edge_m = cum_dist_m[end] - cum_dist_m[start]
    fraction = (target_m - cum_dist_m[start]) / edge_m if edge_m > 0 else 1.0

    position = interpolate(points[start], points[end], fraction)
    seconds = cum_time_s[start] * (1 - fraction) + cum_time_s[end] * fraction
    return position, seconds
