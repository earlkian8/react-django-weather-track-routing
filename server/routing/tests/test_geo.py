import pytest

from routing.engine.geo import haversine_m, interpolate


@pytest.mark.parametrize(
    ("a", "b", "expected_m"),
    [
        pytest.param((40, -100), (40, -100), 0, id="same-point"),
        pytest.param((40, -100), (41, -100), 111_195, id="one-degree-north"),
        pytest.param((0, 0), (0, 1), 111_195, id="one-degree-east-at-equator"),
        pytest.param((60, 0), (60, 1), 55_597, id="one-degree-east-at-60N"),
        pytest.param((40.7128, -74.0060), (34.0522, -118.2437), 3_935_750, id="nyc-to-la"),
    ],
)
def test_haversine(a, b, expected_m):
    assert haversine_m(a, b) == pytest.approx(expected_m, rel=1e-4)


@pytest.mark.parametrize(
    ("fraction", "expected"),
    [(0, (40.1, -100.7)), (0.25, (40.3, -100.4)), (1, (40.9, -99.5))],
)
def test_interpolate(fraction, expected):
    assert interpolate((40.1, -100.7), (40.9, -99.5), fraction) == pytest.approx(expected)


def test_interpolate_endpoints_are_exact():
    a, b = (40.1, -100.7), (47.3, -0.1)
    assert (interpolate(a, b, 0), interpolate(a, b, 1)) == (a, b)
