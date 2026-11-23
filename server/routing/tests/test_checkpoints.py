from datetime import datetime, timedelta, timezone

import pytest

from routing.engine.checkpoints import build_profile, sample_checkpoints
from routing.engine.geo import METERS_PER_MILE

# A 50 mile route due north, so edge lengths are proportional to latitude change.
#   Span 1: 30 mi in 30 min (60 mph), edges of 10 and 20 mi
#   Span 2: 20 mi in 40 min (30 mph), two edges of 10 mi
# Span 2 covers half as much latitude per mile, so positions are only right if
# the reported span lengths are used rather than straight-line distance.
POINTS = [(40.0, -100.0), (40.1, -100.0), (40.3, -100.0), (40.35, -100.0), (40.4, -100.0)]
SPANS = [(0, 30 * METERS_PER_MILE, 1800), (2, 20 * METERS_PER_MILE, 2400)]
DEPARTURE = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)


def sample(interval_mi, departure=DEPARTURE):
    cum_dist_m, cum_time_s = build_profile(POINTS, SPANS)
    return sample_checkpoints(POINTS, cum_dist_m, cum_time_s, departure, interval_mi)


def miles(cum_dist_m):
    return [d / METERS_PER_MILE for d in cum_dist_m]


# --- build_profile ---------------------------------------------------------


def test_profile_splits_spans_by_edge_length():
    cum_dist_m, cum_time_s = build_profile(POINTS, SPANS)
    assert miles(cum_dist_m) == pytest.approx([0, 10, 30, 40, 50])
    assert cum_time_s == pytest.approx([0, 600, 1800, 3000, 4200])


def test_profile_uses_haversine_not_degrees():
    # At 60N, 0.1 degrees north and 0.2 degrees east are about the same length.
    points = [(60.0, 10.0), (60.1, 10.0), (60.1, 10.2)]
    cum_dist_m, cum_time_s = build_profile(points, [(0, 1000, 100)])
    assert cum_dist_m == pytest.approx([0, 500, 1000], rel=0.01)
    assert cum_time_s == pytest.approx([0, 50, 100], rel=0.01)


def test_profile_repeated_point_takes_no_share():
    points = [(40.0, -100.0), (40.1, -100.0), (40.1, -100.0), (40.2, -100.0)]
    cum_dist_m, cum_time_s = build_profile(points, [(0, 1000, 100)])
    assert cum_dist_m == pytest.approx([0, 500, 500, 1000])
    assert cum_time_s == pytest.approx([0, 50, 50, 100])


def test_profile_span_of_identical_points_is_split_evenly():
    points = [(40.0, -100.0)] * 3
    cum_dist_m, cum_time_s = build_profile(points, [(0, 1000, 100)])
    assert cum_dist_m == pytest.approx([0, 500, 1000])
    assert cum_time_s == pytest.approx([0, 50, 100])


@pytest.mark.parametrize(
    ("spans", "expected_m", "expected_s"),
    [
        pytest.param([(0, 5, 1), (0, 100, 10), (1, 100, 10)], [0, 105, 205], [0, 11, 21], id="start"),
        pytest.param([(0, 100, 10), (1, 5, 1), (1, 100, 10)], [0, 105, 205], [0, 11, 21], id="middle"),
        pytest.param([(0, 100, 10), (1, 100, 10), (2, 5, 1)], [0, 100, 205], [0, 10, 21], id="end"),
    ],
)
def test_profile_span_without_edges_keeps_totals(spans, expected_m, expected_s):
    points = [(40.0, -100.0), (40.1, -100.0), (40.2, -100.0)]
    cum_dist_m, cum_time_s = build_profile(points, spans)
    assert cum_dist_m == pytest.approx(expected_m)
    assert cum_time_s == pytest.approx(expected_s)


@pytest.mark.parametrize(
    ("points", "spans"),
    [
        pytest.param(POINTS[:1], [(0, 100, 10)], id="single-point"),
        pytest.param(POINTS, [], id="no-spans"),
        pytest.param(POINTS, [(1, 100, 10)], id="start-of-route-uncovered"),
        pytest.param(POINTS, [(0, 100, 10), (3, 100, 10), (2, 100, 10)], id="offsets-go-backwards"),
        pytest.param(POINTS, [(0, 100, 10), (5, 100, 10)], id="offset-past-end"),
    ],
)
def test_profile_rejects_bad_input(points, spans):
    with pytest.raises(ValueError):
        build_profile(points, spans)


# --- sample_checkpoints ----------------------------------------------------


@pytest.mark.parametrize(
    ("interval_mi", "expected_miles"),
    [
        pytest.param(10, [0, 10, 20, 30, 40, 50], id="exact-multiple"),
        pytest.param(20, [0, 20, 40, 50], id="half-interval-left"),
        pytest.param(15, [0, 15, 30, 45, 50], id="one-third-left"),
        pytest.param(16, [0, 16, 32, 50], id="one-eighth-left-replaced"),
        pytest.param(40, [0, 50], id="exactly-a-quarter-left-replaced"),
        pytest.param(39.9, [0, 39.9, 50], id="just-over-a-quarter-left"),
        pytest.param(80, [0, 50], id="interval-longer-than-route"),
        pytest.param(500, [0, 50], id="start-never-replaced"),
    ],
)
def test_checkpoint_miles(interval_mi, expected_miles):
    assert [c.mile for c in sample(interval_mi)] == pytest.approx(expected_miles)


@pytest.mark.parametrize("interval_mi", [0.7, 3, 10, 12.5, 16, 39.9, 40, 49, 50, 51, 500])
def test_starts_at_origin_and_ends_at_destination(interval_mi):
    checkpoints = sample(interval_mi)
    first, last = checkpoints[0], checkpoints[-1]
    assert (first.mile, first.lat, first.lng, first.eta) == (0, 40.0, -100.0, DEPARTURE)
    assert (last.lat, last.lng) == POINTS[-1]
    assert last.mile == pytest.approx(50)
    assert last.eta == DEPARTURE + timedelta(seconds=4200)


@pytest.mark.parametrize(
    ("interval_mi", "expected_s"),
    [
        pytest.param(10, [0, 600, 1200, 1800, 3000, 4200], id="at-and-between-vertices"),
        pytest.param(15, [0, 900, 1800, 3600, 4200], id="slow-span-midpoint"),
    ],
)
def test_etas_follow_span_speeds(interval_mi, expected_s):
    elapsed = [(c.eta - DEPARTURE).total_seconds() for c in sample(interval_mi)]
    assert elapsed == pytest.approx(expected_s)


def test_positions_are_interpolated():
    checkpoints = sample(15)
    assert [c.lat for c in checkpoints] == pytest.approx([40.0, 40.15, 40.3, 40.375, 40.4])
    assert {c.lng for c in checkpoints} == {-100.0}


def test_longitude_is_interpolated():
    points = [(40.0, -100.0), (41.0, -98.0)]
    checkpoints = sample_checkpoints(points, [0, 2 * METERS_PER_MILE], [0, 120], DEPARTURE, 1)
    assert (checkpoints[1].lat, checkpoints[1].lng) == pytest.approx((40.5, -99.0))


def test_repeated_points_do_not_break_sampling():
    points = [(40.0, -100.0), (40.1, -100.0), (40.1, -100.0), (40.2, -100.0), (40.2, -100.0)]
    cum_dist_m = [m * METERS_PER_MILE for m in (0, 10, 10, 20, 20)]
    checkpoints = sample_checkpoints(points, cum_dist_m, [0, 600, 600, 1200, 1200], DEPARTURE, 10)
    assert [c.lat for c in checkpoints] == pytest.approx([40.0, 40.1, 40.2])
    assert checkpoints[-1].eta == DEPARTURE + timedelta(seconds=1200)


def test_time_on_a_zero_length_final_edge_counts_toward_arrival():
    points = [(40.0, -100.0), (40.1, -100.0), (40.1, -100.0)]
    cum_dist_m = [m * METERS_PER_MILE for m in (0, 10, 10)]
    checkpoints = sample_checkpoints(points, cum_dist_m, [0, 600, 660], DEPARTURE, 10)
    assert checkpoints[-1].eta == DEPARTURE + timedelta(seconds=660)


@pytest.mark.parametrize(
    ("interval_mi", "expected"),
    [
        pytest.param(20, [10, 20, 15, 5], id="short-last-gap"),
        pytest.param(16, [8, 16, 17, 9], id="long-last-gap"),
        pytest.param(500, [25, 25], id="two-checkpoints"),
    ],
)
def test_segment_miles(interval_mi, expected):
    assert [c.segment_miles for c in sample(interval_mi)] == pytest.approx(expected)


@pytest.mark.parametrize("interval_mi", [0.7, 3, 10, 12.5, 16, 39.9, 40, 49, 50, 51, 500])
def test_segment_miles_add_up_to_route_length(interval_mi):
    assert sum(c.segment_miles for c in sample(interval_mi)) == pytest.approx(50)


def test_etas_are_utc_for_a_local_departure():
    local = DEPARTURE.astimezone(timezone(timedelta(hours=-5)))
    etas = [c.eta for c in sample(50, departure=local)]
    assert etas == [DEPARTURE, DEPARTURE + timedelta(seconds=4200)]
    assert {eta.utcoffset() for eta in etas} == {timedelta(0)}


def test_naive_departure_is_rejected():
    with pytest.raises(ValueError):
        sample(10, departure=datetime(2026, 11, 24, 12, 0))


@pytest.mark.parametrize("interval_mi", [0, -5])
def test_non_positive_interval_is_rejected(interval_mi):
    with pytest.raises(ValueError):
        sample(interval_mi)
