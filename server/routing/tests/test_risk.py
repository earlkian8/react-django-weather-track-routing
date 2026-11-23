import pytest

from routing.engine.risk import Assessment, Conditions, Risk, assess


def make_conditions(wind=0, rain=0, snow=0, gust=None):
    return Conditions(wind_mph=wind, gust_mph=gust, rain_in=rain, snow_in=snow)


@pytest.mark.parametrize(
    ("risk", "value", "key", "label"),
    [
        (Risk.LOW, 0, "low", "Low"),
        (Risk.MODERATE, 1, "moderate", "Moderate"),
        (Risk.HIGH, 2, "high", "High"),
        (Risk.SEVERE, 3, "severe", "Severe"),
        (Risk.NO_TRAVEL, 4, "no_travel", "No Travel"),
    ],
)
def test_risk_value_key_and_label(risk, value, key, label):
    assert (risk, risk.key, risk.label) == (value, key, label)


@pytest.mark.parametrize(
    ("wind", "expected"),
    [
        (0, Risk.LOW),
        (24.9, Risk.LOW),
        (25, Risk.MODERATE),
        (34.9, Risk.MODERATE),
        (35, Risk.HIGH),
        (44.9, Risk.HIGH),
        (45, Risk.SEVERE),
        (54.9, Risk.SEVERE),
        (55, Risk.NO_TRAVEL),
        (80, Risk.NO_TRAVEL),
    ],
)
def test_wind_thresholds_when_empty(wind, expected):
    assert assess(make_conditions(wind=wind), load_lb=0).level is expected


@pytest.mark.parametrize(
    ("rain", "expected"),
    [
        (0, Risk.LOW),
        (0.09, Risk.LOW),
        (0.10, Risk.MODERATE),
        (0.24, Risk.MODERATE),
        (0.25, Risk.HIGH),
        (0.49, Risk.HIGH),
        (0.50, Risk.SEVERE),
        (0.99, Risk.SEVERE),
        (1.00, Risk.SEVERE),  # No Travel is strictly above 1.00
        (1.01, Risk.NO_TRAVEL),
    ],
)
def test_rain_thresholds(rain, expected):
    assert assess(make_conditions(rain=rain), load_lb=0).level is expected


@pytest.mark.parametrize(
    ("snow", "expected"),
    [
        (0, Risk.LOW),
        (0.49, Risk.LOW),
        (0.5, Risk.MODERATE),
        (0.99, Risk.MODERATE),
        (1.0, Risk.HIGH),
        (1.99, Risk.HIGH),
        (2.0, Risk.SEVERE),
        (2.99, Risk.SEVERE),
        (3.0, Risk.SEVERE),  # No Travel is strictly above 3.0
        (3.01, Risk.NO_TRAVEL),
    ],
)
def test_snow_thresholds(snow, expected):
    assert assess(make_conditions(snow=snow), load_lb=0).level is expected


@pytest.mark.parametrize(
    ("wind", "load_lb", "expected"),
    [
        # >=55 mph: No Travel for any load
        (55, 0, Risk.NO_TRAVEL),
        (55, 30_000, Risk.NO_TRAVEL),
        (55, 80_000, Risk.NO_TRAVEL),
        # 45-54 mph: No Travel only above 30,000 lb
        (45, 30_000, Risk.SEVERE),
        (45, 30_001, Risk.NO_TRAVEL),
        (45, 40_001, Risk.NO_TRAVEL),
        (54.9, 30_000, Risk.SEVERE),
        (54.9, 30_001, Risk.NO_TRAVEL),
        # 35-44 mph: Severe only above 40,000 lb
        (35, 35_000, Risk.HIGH),
        (40, 35_000, Risk.HIGH),
        (44.9, 35_000, Risk.HIGH),
        (35, 40_000, Risk.HIGH),
        (35, 40_001, Risk.SEVERE),
        (44.9, 40_000, Risk.HIGH),
        (44.9, 40_001, Risk.SEVERE),
        # Below 35 mph: load never matters
        (34.9, 80_000, Risk.MODERATE),
        (24.9, 80_000, Risk.LOW),
    ],
)
def test_load_rules(wind, load_lb, expected):
    assert assess(make_conditions(wind=wind), load_lb=load_lb).level is expected


@pytest.mark.parametrize(
    ("rain", "snow"),
    [(0.30, 0), (0, 1.5)],
)
def test_load_does_not_escalate_rain_or_snow(rain, snow):
    result = assess(make_conditions(rain=rain, snow=snow), load_lb=80_000)
    assert result.level is Risk.HIGH


def test_gusts_are_ignored():
    result = assess(make_conditions(wind=20, gust=70), load_lb=80_000)
    assert result == Assessment(level=Risk.LOW, factors=[])


def test_gust_is_optional():
    result = assess(Conditions(wind_mph=25, rain_in=0, snow_in=0), load_lb=0)
    assert result.level is Risk.MODERATE


@pytest.mark.parametrize(
    ("wind", "rain", "snow", "load_lb", "expected"),
    [
        pytest.param(10, 0.05, 0.1, 80_000, Risk.LOW, id="all-low"),
        pytest.param(50, 0.15, 0.6, 0, Risk.SEVERE, id="wind-worst"),
        pytest.param(30, 0.60, 0.6, 0, Risk.SEVERE, id="rain-worst"),
        pytest.param(30, 0.15, 3.5, 0, Risk.NO_TRAVEL, id="snow-worst"),
        pytest.param(38, 0.30, 1.5, 42_000, Risk.SEVERE, id="loaded-wind-worst"),
        pytest.param(38, 1.50, 0, 42_000, Risk.NO_TRAVEL, id="rain-beats-loaded-wind"),
        pytest.param(40, 0.30, 1.5, 0, Risk.HIGH, id="three-way-tie"),
    ],
)
def test_worst_condition_wins(wind, rain, snow, load_lb, expected):
    result = assess(make_conditions(wind, rain, snow), load_lb=load_lb)
    assert result.level is expected


@pytest.mark.parametrize(
    ("wind", "rain", "snow", "load_lb", "factors"),
    [
        pytest.param(10, 0.05, 0.1, 80_000, [], id="low-conditions-omitted"),
        pytest.param(
            38, 0, 0, 42_000,
            ["Wind 38 mph with 42,000 lb load (Severe)"],
            id="load-escalated-to-severe",
        ),
        pytest.param(
            50, 0, 0, 30_001,
            ["Wind 50 mph with 30,001 lb load (No Travel)"],
            id="load-escalated-to-no-travel",
        ),
        pytest.param(
            38, 0, 0, 35_000,
            ["Wind 38 mph (High)"],
            id="load-omitted-when-it-changed-nothing",
        ),
        pytest.param(
            60, 0, 0, 42_000,
            ["Wind 60 mph (No Travel)"],
            id="load-omitted-when-wind-alone-is-no-travel",
        ),
        pytest.param(
            54.9, 0, 0, 0,
            ["Wind 54.9 mph (Severe)"],
            id="value-not-rounded-across-threshold",
        ),
        pytest.param(
            30, 0.30, 2.5, 0,
            ["Snow 2.5 in/hr (Severe)", "Rain 0.3 in/hr (High)", "Wind 30 mph (Moderate)"],
            id="worst-first-snow-rain-wind",
        ),
        pytest.param(
            38, 1.5, 0.6, 42_000,
            [
                "Rain 1.5 in/hr (No Travel)",
                "Wind 38 mph with 42,000 lb load (Severe)",
                "Snow 0.6 in/hr (Moderate)",
            ],
            id="worst-first-uses-load-adjusted-wind",
        ),
        pytest.param(
            40, 0.30, 1.5, 0,
            ["Wind 40 mph (High)", "Rain 0.3 in/hr (High)", "Snow 1.5 in/hr (High)"],
            id="ties-keep-wind-rain-snow-order",
        ),
    ],
)
def test_factors(wind, rain, snow, load_lb, factors):
    result = assess(make_conditions(wind, rain, snow), load_lb=load_lb)
    assert result.factors == factors
