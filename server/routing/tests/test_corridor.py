import pytest

from routing.engine.corridor import corridor_cells
from routing.engine.geo import METERS_PER_MILE, haversine_m
from routing.services.open_meteo import snap

DALLAS, DENVER = (32.7767, -96.7970), (39.7392, -104.9903)
SEATTLE, MIAMI = (47.6062, -122.3321), (25.7617, -80.1918)


def line(a, b, count):
    """`count` evenly spaced points from a to b."""
    return [
        (a[0] + (b[0] - a[0]) * i / (count - 1), a[1] + (b[1] - a[1]) * i / (count - 1))
        for i in range(count)
    ]


def miles_to_path(cell, path):
    return min(haversine_m(cell, point) for point in path) / METERS_PER_MILE


def half_diagonal_miles(cell, step):
    lat, lng = cell
    corner = (lat + step / 2, lng + step / 2)
    return haversine_m(cell, corner) / METERS_PER_MILE


def test_single_point_covers_a_circle():
    cells, step = corridor_cells([[(40.0, -100.0)]], buffer_mi=25)
    assert step == 0.1
    # 25 mi is 0.36 degrees of latitude but 0.47 of longitude at 40N.
    assert {lat for lat, lng in cells if lng == -100.0} == {39.7, 39.8, 39.9, 40.0, 40.1, 40.2, 40.3}
    assert {lng for lat, lng in cells if lat == 40.0} == {
        -100.4, -100.3, -100.2, -100.1, -100.0, -99.9, -99.8, -99.7, -99.6,
    }
    # A circle, not a box: the corners of its bounding box are out.
    assert (40.3, -99.6) not in cells
    assert (40.2, -99.7) in cells


@pytest.mark.parametrize(
    ("path", "buffer_mi"),
    [
        pytest.param(line((40.0, -100.0), (40.0, -98.0), 400), 25, id="east"),
        pytest.param(line((35.0, -100.0), (36.5, -100.0), 400), 25, id="north"),
        pytest.param(line((45.0, -110.0), (45.8, -108.9), 400), 10, id="diagonal"),
        pytest.param(line((60.0, -120.0), (60.3, -119.0), 400), 25, id="far-north"),
    ],
)
def test_cells_stay_within_the_buffer_and_fill_it(path, buffer_mi):
    cells, step = corridor_cells([path], buffer_mi=buffer_mi, max_cells=10_000)
    assert step == 0.1
    for cell in cells:
        # The path is snapped to the grid first, so allow half a cell.
        assert miles_to_path(cell, path) <= buffer_mi + half_diagonal_miles(cell, step)

    covered = set(cells)
    for lat, lng in path:
        for i in range(-10, 11):
            for j in range(-15, 16):
                cell = (round(lat + i / 10, 1), round(lng + j / 10, 1))
                slack = half_diagonal_miles(cell, step)
                if haversine_m(cell, (lat, lng)) / METERS_PER_MILE < buffer_mi - slack:
                    assert cell in covered


@pytest.mark.parametrize(
    ("paths", "expected_step"),
    [
        pytest.param([line((40.0, -100.0), (40.0, -99.5), 50)], 0.1, id="50-miles"),
        pytest.param([line(DALLAS, DENVER, 5000)], 0.2, id="dallas-denver"),
        pytest.param([line(SEATTLE, MIAMI, 5000)], 0.5, id="seattle-miami"),
    ],
)
def test_step_is_the_finest_that_fits(paths, expected_step):
    cells, step = corridor_cells(paths)
    assert step == expected_step
    assert 0 < len(cells) <= 400


def test_long_multi_path_route_stays_under_max_cells():
    paths = [
        line(SEATTLE, MIAMI, 5000),
        line(SEATTLE, DENVER, 2000) + line(DENVER, MIAMI, 2000),
        line(SEATTLE, DALLAS, 2000) + line(DALLAS, MIAMI, 2000),
    ]
    cells, _ = corridor_cells(paths)
    assert 0 < len(cells) <= 400


def test_max_cells_is_respected_exactly():
    path = [line((40.0, -100.0), (40.0, -98.0), 200)]
    count = len(corridor_cells(path, max_cells=10_000)[0])
    assert corridor_cells(path, max_cells=count)[1] == 0.1
    assert corridor_cells(path, max_cells=count - 1)[1] == 0.2


def test_coarsest_grid_is_used_when_nothing_fits():
    cells, step = corridor_cells([line(SEATTLE, MIAMI, 5000)], max_cells=3)
    assert step == 1.0
    assert len(cells) > 3


@pytest.mark.parametrize(
    ("a", "b"),
    [
        pytest.param(DALLAS, DENVER, id="diagonal"),
        pytest.param((40.0, -100.0), (40.0, -95.0), id="east-west"),
        pytest.param((35.0, -100.0), (40.0, -100.0), id="north-south"),
    ],
)
def test_sparse_paths_are_densified(a, b):
    ends_only, step = corridor_cells([[a, b]], max_cells=10_000)
    assert step == 0.1
    for lat, lng in line(a, b, 5000):
        assert (round(lat, 1), round(lng, 1)) in ends_only


def test_default_cap_is_400_cells():
    path = line((40.0, -100.0), (40.0, -95.0), 1000)
    assert 400 < len(corridor_cells([path], max_cells=10_000)[0]) < 500
    assert corridor_cells([path])[1] == 0.2


def test_paths_are_combined_without_repeats():
    a, b = [(40.0, -100.0)], [(40.1, -100.0)]
    both, _ = corridor_cells([a, b])
    assert len(both) == len(set(both))
    assert set(both) == set(corridor_cells([a])[0]) | set(corridor_cells([b])[0])


@pytest.mark.parametrize("max_cells", [10_000, 400, 150, 60, 25])
def test_cells_line_up_with_the_weather_cache(max_cells):
    cells, _ = corridor_cells([line(DALLAS, DENVER, 500)], max_cells=max_cells)
    assert all(cell == snap(*cell) for cell in cells)


def test_no_paths():
    assert corridor_cells([]) == ([], 0.1)
