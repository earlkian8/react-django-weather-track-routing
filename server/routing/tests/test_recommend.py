import pytest

from routing.engine.recommend import explain, rank, score_route
from routing.engine.risk import Risk

HOUR = 3600


def make_score(
    route_id, *, low=0, moderate=0, high=0, severe=0, no_travel=0, unknown=0, duration_s=HOUR
):
    segments = [
        (low, Risk.LOW),
        (moderate, Risk.MODERATE),
        (high, Risk.HIGH),
        (severe, Risk.SEVERE),
        (no_travel, Risk.NO_TRAVEL),
        (unknown, None),
    ]
    return score_route(route_id, segments, duration_s)


def ids(scores):
    return [score.route_id for score in scores]


# --- score_route -----------------------------------------------------------


def test_score_sums_miles_by_risk():
    score = score_route(
        "A",
        [
            (5, Risk.LOW),
            (10, Risk.HIGH),
            (2.5, Risk.SEVERE),
            (10, Risk.HIGH),
            (1.5, Risk.NO_TRAVEL),
            (4, None),
            (3, None),
        ],
        duration_s=7200,
    )
    assert score.miles_by_risk == {
        Risk.LOW: 5,
        Risk.MODERATE: 0,
        Risk.HIGH: 20,
        Risk.SEVERE: 2.5,
        Risk.NO_TRAVEL: 1.5,
    }
    assert (score.no_travel_miles, score.severe_miles, score.high_miles) == (1.5, 2.5, 20)
    assert (score.route_id, score.unknown_miles, score.duration_s) == ("A", 7, 7200)


@pytest.mark.parametrize(
    ("segments", "expected"),
    [
        pytest.param([(30, Risk.LOW), (10, Risk.NO_TRAVEL)], 1.0, id="weighted-by-miles"),
        pytest.param([(10, Risk.HIGH), (90, None)], 2.0, id="unknown-excluded"),
        pytest.param([(10, Risk.LOW), (90, None)], 0.0, id="low-is-known"),
        pytest.param([(10, None), (90, None)], None, id="all-unknown"),
        pytest.param([(0, Risk.HIGH), (90, None)], None, id="no-known-miles"),
        pytest.param([], None, id="no-segments"),
    ],
)
def test_average_risk(segments, expected):
    assert score_route("A", segments, HOUR).avg_risk == expected


# --- rank ------------------------------------------------------------------

# In each case the winner is worse on every later criterion, so only the named
# one can explain the result.
DECIDING_CASES = [
    pytest.param(
        make_score("A", severe=99, high=1, duration_s=9 * HOUR),
        make_score("B", no_travel=1, low=99),
        "Fewest no-travel miles: 0 mi vs 1 mi on Route B.",
        id="no-travel",
    ),
    pytest.param(
        make_score("A", no_travel=5, high=95, duration_s=9 * HOUR),
        make_score("B", no_travel=5, severe=37, low=58),
        "Fewest severe miles: 0 mi vs 37 mi on Route B.",
        id="severe",
    ),
    pytest.param(
        make_score("A", no_travel=5, severe=5, high=1.2, moderate=88.8, duration_s=9 * HOUR),
        make_score("B", no_travel=5, severe=5, high=12.5, low=77.5),
        "Fewest high miles: 1.2 mi vs 12.5 mi on Route B.",
        id="high",
    ),
    pytest.param(
        make_score("A", high=10, moderate=10, low=80, duration_s=9 * HOUR),
        make_score("B", high=10, moderate=35, low=55),
        "Lowest average risk: 0.3 vs 0.55 on Route B.",
        id="average-risk",
    ),
    pytest.param(
        make_score("A", high=10, low=90, duration_s=5.5 * HOUR),
        make_score("B", high=10, low=90, duration_s=6 * HOUR),
        "Shortest duration: 5 h 30 min vs 6 h 0 min on Route B.",
        id="duration",
    ),
]


@pytest.mark.parametrize(("best", "other", "explanation"), DECIDING_CASES)
def test_each_criterion_decides_when_earlier_ones_tie(best, other, explanation):
    assert ids(rank([best, other])) == ["A", "B"]
    assert ids(rank([other, best])) == ["A", "B"]


@pytest.mark.parametrize(("best", "other", "explanation"), DECIDING_CASES)
def test_explanation_names_the_deciding_criterion(best, other, explanation):
    assert explain(best, other) == explanation


def test_no_travel_outranks_everything():
    routes = [
        make_score("no-travel", no_travel=0.1, low=99.9, duration_s=1 * HOUR),
        make_score("severe", severe=100, duration_s=9 * HOUR),
        make_score("high", high=100, duration_s=8 * HOUR),
        make_score("slow", low=100, duration_s=7 * HOUR),
    ]
    assert ids(rank(routes)) == ["slow", "high", "severe", "no-travel"]


@pytest.mark.parametrize("level", ["no_travel", "severe", "high"])
def test_miles_are_compared_to_a_tenth(level):
    slower = make_score("slower", **{level: 10.01}, low=989.99, duration_s=2 * HOUR)
    faster = make_score("faster", **{level: 10.04}, low=989.96, duration_s=1 * HOUR)
    assert ids(rank([slower, faster])) == ["faster", "slower"]

    fewer = make_score("fewer", **{level: 10.0}, low=990, duration_s=2 * HOUR)
    more = make_score("more", **{level: 10.1}, low=989.9, duration_s=1 * HOUR)
    assert ids(rank([more, fewer])) == ["fewer", "more"]


def test_average_risk_is_compared_to_three_decimals():
    slower = make_score("slower", moderate=30.1, low=969.9, duration_s=2 * HOUR)
    faster = make_score("faster", moderate=30.4, low=969.6, duration_s=1 * HOUR)
    assert ids(rank([slower, faster])) == ["faster", "slower"]

    safer = make_score("safer", moderate=30, low=970, duration_s=2 * HOUR)
    riskier = make_score("riskier", moderate=31, low=969, duration_s=1 * HOUR)
    assert ids(rank([riskier, safer])) == ["safer", "riskier"]


def test_unknown_average_risk_ranks_after_known():
    unknown = make_score("unknown", unknown=100, duration_s=1 * HOUR)
    known = make_score("known", moderate=100, duration_s=2 * HOUR)
    assert ids(rank([unknown, known])) == ["known", "unknown"]


def test_all_low_route_is_not_treated_as_unknown():
    all_low = make_score("all-low", low=100, duration_s=2 * HOUR)
    moderate = make_score("moderate", moderate=100, duration_s=1 * HOUR)
    assert ids(rank([moderate, all_low])) == ["all-low", "moderate"]


def test_two_unknown_averages_tie():
    slower = make_score("slower", unknown=100, duration_s=2 * HOUR)
    faster = make_score("faster", unknown=100, duration_s=1 * HOUR)
    assert ids(rank([slower, faster])) == ["faster", "slower"]


def test_full_tie_keeps_input_order():
    a, b = make_score("A", low=10), make_score("B", low=10)
    assert ids(rank([a, b])) == ["A", "B"]
    assert ids(rank([b, a])) == ["B", "A"]


def test_sub_second_duration_difference_is_a_tie():
    a = make_score("A", low=10, duration_s=100.4)
    b = make_score("B", low=10, duration_s=100.2)
    assert ids(rank([a, b])) == ["A", "B"]


def test_rank_does_not_modify_its_input():
    routes = [make_score("B", severe=1), make_score("A", low=1)]
    rank(routes)
    assert ids(routes) == ["B", "A"]


# --- explain ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("best_s", "other_s", "expected"),
    [
        pytest.param(40 * 60, 65 * 60, "40 min vs 1 h 5 min", id="under-an-hour"),
        pytest.param(5400 + 10, 5400 + 50, "1 h 30 min 10 s vs 1 h 30 min 50 s", id="same-minute"),
        pytest.param(3599, 3600, "59 min vs 1 h 0 min", id="one-second-across-a-minute"),
    ],
)
def test_explained_durations_are_distinguishable(best_s, other_s, expected):
    best = make_score("A", low=10, duration_s=best_s)
    other = make_score("B", low=10, duration_s=other_s)
    assert explain(best, other) == f"Shortest duration: {expected} on Route B."


def test_explain_shows_compared_values_not_raw_ones():
    best = make_score("A", severe=0.04, low=100)
    other = make_score("B", severe=36.96, low=100)
    assert explain(best, other) == "Fewest severe miles: 0 mi vs 37 mi on Route B."


def test_explain_unknown_average_risk():
    best, other = make_score("A", moderate=10), make_score("B", unknown=10)
    assert explain(best, other) == "Lowest average risk: 1 vs unknown on Route B."


def test_explain_single_route():
    assert explain(make_score("A", low=10), None) == "Route A is the only route available."


def test_explain_full_tie():
    best, other = make_score("A", low=10), make_score("B", low=10)
    assert explain(best, other) == "Route A ties with Route B on every criterion."


def test_explain_ignores_differences_below_rounding():
    best = make_score("A", high=10.01, low=989.99, duration_s=100.2)
    other = make_score("B", high=10.04, low=989.96, duration_s=100.4)
    assert explain(best, other) == "Route A ties with Route B on every criterion."
