from datetime import datetime, timedelta, timezone

import pytest

from routing.engine.risk import Conditions
from routing.engine.weather import Forecast

START = datetime(2026, 11, 25, 14, 0, tzinfo=timezone.utc)

# Every value is unique, so the hour each one came from is unmistakable.
FORECAST = Forecast(
    start=START,
    wind_mph=[10, 11, 12, 13],
    gust_mph=[20, 21, 22, 23],
    rain_in=[0.0, 0.1, 0.2, 0.3],
    snow_in=[1.0, 1.1, 1.2, 1.3],
)


def at(minutes, forecast=FORECAST):
    return forecast.conditions_at(START + timedelta(minutes=minutes))


@pytest.mark.parametrize(
    ("minutes", "rain", "snow"),
    [
        pytest.param(0, 0.0, 1.0, id="on-the-first-hour"),
        pytest.param(1, 0.1, 1.1, id="just-after-the-hour"),
        pytest.param(59, 0.1, 1.1, id="just-before-the-hour"),
        pytest.param(60, 0.1, 1.1, id="on-the-hour"),
        pytest.param(61, 0.2, 1.2, id="into-the-next-hour"),
        pytest.param(180, 0.3, 1.3, id="on-the-last-hour"),
    ],
)
def test_precipitation_uses_the_hour_ending_at_or_after_eta(minutes, rain, snow):
    conditions = at(minutes)
    assert (conditions.rain_in, conditions.snow_in) == (rain, snow)


@pytest.mark.parametrize(
    ("minutes", "wind", "gust"),
    [
        pytest.param(0, 10, 20, id="on-the-first-hour"),
        pytest.param(29, 10, 20, id="before-the-half-hour"),
        pytest.param(30, 11, 21, id="half-hour-rounds-up"),
        pytest.param(60, 11, 21, id="on-the-hour"),
        pytest.param(89, 11, 21, id="still-nearest-to-the-hour"),
        pytest.param(90, 12, 22, id="second-half-hour-also-rounds-up"),
        pytest.param(180, 13, 23, id="on-the-last-hour"),
    ],
)
def test_wind_uses_the_nearest_hour(minutes, wind, gust):
    conditions = at(minutes)
    assert (conditions.wind_mph, conditions.gust_mph) == (wind, gust)


@pytest.mark.parametrize("minutes", [-61, -1, 181, 10_000])
def test_out_of_range_has_no_conditions(minutes):
    assert at(minutes) is None


def test_other_timezones_are_understood():
    local = (START + timedelta(hours=2)).astimezone(timezone(timedelta(hours=-6)))
    assert FORECAST.conditions_at(local).wind_mph == 12


def with_null(field):
    values = {name: [1.0, 1.0] for name in ("wind_mph", "gust_mph", "rain_in", "snow_in")}
    values[field] = [1.0, None]
    return Forecast(start=START, **values)


@pytest.mark.parametrize("field", ["wind_mph", "rain_in", "snow_in"])
def test_null_values_have_no_conditions(field):
    forecast = with_null(field)
    assert forecast.conditions_at(START) is not None
    assert forecast.conditions_at(START + timedelta(hours=1)) is None
    assert forecast.hour(1) is None


def test_null_gust_is_allowed():
    conditions = Conditions(wind_mph=1.0, gust_mph=None, rain_in=1.0, snow_in=1.0)
    assert with_null("gust_mph").hour(1) == conditions


def test_hour_returns_that_index():
    expected = Conditions(wind_mph=12, gust_mph=22, rain_in=0.2, snow_in=1.2)
    assert FORECAST.hour(2) == expected


@pytest.mark.parametrize("index", [-1, 4])
def test_hour_out_of_range(index):
    assert FORECAST.hour(index) is None
