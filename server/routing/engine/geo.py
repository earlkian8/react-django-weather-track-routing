"""Small geographic helpers. Points are (lat, lng) in degrees."""

from math import asin, cos, radians, sin, sqrt

METERS_PER_MILE = 1609.344
EARTH_RADIUS_M = 6_371_008.8

Point = tuple[float, float]


def haversine_m(a: Point, b: Point) -> float:
    """Great-circle distance in meters."""
    lat_a, lat_b = radians(a[0]), radians(b[0])
    half_dlat = (lat_b - lat_a) / 2
    half_dlng = radians(b[1] - a[1]) / 2
    h = sin(half_dlat) ** 2 + cos(lat_a) * cos(lat_b) * sin(half_dlng) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(min(h, 1.0)))


def interpolate(a: Point, b: Point, fraction: float) -> Point:
    """The point `fraction` of the way from a (0) to b (1), in a straight line."""
    rest = 1 - fraction
    return (a[0] * rest + b[0] * fraction, a[1] * rest + b[1] * fraction)
