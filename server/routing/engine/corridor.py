"""The grid cells around a set of routes, for the weather heatmap."""

from collections.abc import Iterable, Sequence
from math import ceil, cos, hypot, pi, radians

from .geo import EARTH_RADIUS_M, METERS_PER_MILE, Point

# Multiples of 0.1 so every cell is also a checkpoint weather cell.
GRID_STEPS = (0.1, 0.2, 0.3, 0.5, 1.0)
MILES_PER_DEGREE = EARTH_RADIUS_M * pi / 180 / METERS_PER_MILE

GridIndex = tuple[int, int]


def corridor_cells(
    paths: Iterable[Sequence[Point]], buffer_mi: float = 25, max_cells: int = 400
) -> tuple[list[Point], float]:
    """Cells within `buffer_mi` of any path, and the grid step in degrees.

    Uses the finest step that gives at most `max_cells`, or the coarsest if none do.
    """
    paths = list(paths)
    for step in GRID_STEPS:
        indices = _expand(_touched(paths, step), step, buffer_mi)
        if len(indices) <= max_cells:
            break
    return [(round(i * step, 1), round(j * step, 1)) for i, j in sorted(indices)], step


def _touched(paths: Iterable[Sequence[Point]], step: float) -> set[GridIndex]:
    """Grid indices the paths pass through, sampled at least every half step."""
    touched = set()
    for path in paths:
        previous = path[0]
        for point in path:
            dlat, dlng = point[0] - previous[0], point[1] - previous[1]
            pieces = max(1, ceil(max(abs(dlat), abs(dlng)) / (step / 2)))
            for k in range(1, pieces + 1):
                lat, lng = previous[0] + dlat * k / pieces, previous[1] + dlng * k / pieces
                touched.add((round(lat / step), round(lng / step)))
            previous = point
    return touched


def _expand(touched: set[GridIndex], step: float, buffer_mi: float) -> set[GridIndex]:
    masks = {i: _circle(i, step, buffer_mi) for i in {i for i, _ in touched}}
    return {(i + di, j + dj) for i, j in touched for di, dj in masks[i]}


def _circle(row: int, step: float, buffer_mi: float) -> list[GridIndex]:
    """Index offsets within `buffer_mi` of a cell in this latitude row."""
    lat_mi = step * MILES_PER_DEGREE
    lng_mi = lat_mi * cos(radians(row * step))
    rows, columns = int(buffer_mi / lat_mi), int(buffer_mi / lng_mi)
    return [
        (di, dj)
        for di in range(-rows, rows + 1)
        for dj in range(-columns, columns + 1)
        if hypot(di * lat_mi, dj * lng_mi) <= buffer_mi
    ]
