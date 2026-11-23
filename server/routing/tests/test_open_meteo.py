import threading
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from routing.engine.weather import Forecast
from routing.exceptions import UpstreamError
from routing.services.open_meteo import get_forecasts, snap

START = datetime(2026, 11, 25, 14, 0, tzinfo=timezone.utc)
END = START + timedelta(hours=2)
A, B = (40.0, -100.0), (41.3, -101.2)


def location(wind=10.0, **hourly):
    """One location as Open-Meteo returns it: hourly lists from START."""
    return {
        "latitude": 40.008694,  # the model grid point, not what was asked for
        "longitude": -100.00703,
        "hourly": {
            "time": [int(START.timestamp()) + 3600 * i for i in range(3)],
            "wind_speed_10m": [wind, wind + 1, wind + 2],
            "wind_gusts_10m": [20.0, 21.0, 22.0],
            "rain": [0.0, 0.1, 0.2],
            "showers": [0.0, 0.0, 0.05],
            "snowfall": [0.0, 0.5, 1.0],
        }
        | hourly,
    }


def forecast(wind=10.0):
    return Forecast(
        start=START,
        wind_mph=[wind, wind + 1, wind + 2],
        gust_mph=[20.0, 21.0, 22.0],
        rain_in=[0.0, 0.1, 0.25],
        snow_in=[0.0, 0.5, 1.0],
    )


def answer_each_location(request):
    """Reply to any request, with each location's wind set to its latitude."""
    lats = request.url.params["latitude"].split(",")
    data = [location(wind=float(lat)) for lat in lats]
    return data if len(data) > 1 else data[0]


@pytest.mark.parametrize(
    ("lat", "lng", "expected"),
    [
        (32.7767, -96.797, (32.8, -96.8)),
        (40.04, -100.04, (40.0, -100.0)),
        (40.06, -100.06, (40.1, -100.1)),
        (3 * 0.1, -7 * 0.1, (0.3, -0.7)),
    ],
)
def test_snap(lat, lng, expected):
    assert snap(lat, lng) == expected


def test_request(mock_http):
    mock_http.handler = answer_each_location
    get_forecasts([A, B], START, END)
    url = mock_http.requests[0].url
    assert (url.host, url.path) == ("api.open-meteo.com", "/v1/forecast")
    assert mock_http.params == [
        {
            "latitude": "40.0,41.3",
            "longitude": "-100.0,-101.2",
            "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "timeformat": "unixtime",
            "start_hour": "2026-11-25T14:00",
            "end_hour": "2026-11-25T16:00",
        }
    ]


def test_window_is_sent_in_utc(mock_http):
    mock_http.handler = answer_each_location
    local = timezone(timedelta(hours=-6))
    get_forecasts([A], START.astimezone(local), END.astimezone(local))
    assert mock_http.params[0]["start_hour"] == "2026-11-25T14:00"
    assert mock_http.params[0]["end_hour"] == "2026-11-25T16:00"


def test_single_location_object(mock_http):
    mock_http.replies = [location()]
    assert get_forecasts([A], START, END) == {A: forecast()}


def test_multiple_location_list(mock_http):
    mock_http.replies = [[location(wind=30.0), location(wind=50.0)]]
    assert get_forecasts([A, B], START, END) == {A: forecast(30.0), B: forecast(50.0)}


@pytest.mark.parametrize(
    ("rain", "showers", "expected"),
    [
        pytest.param(0.2, 0.05, 0.25, id="added"),
        pytest.param(None, 0.05, None, id="rain-unknown"),
        pytest.param(0.2, None, None, id="showers-unknown"),
        # Plain float addition gives 0.09999999999999999: Low instead of Moderate.
        pytest.param(0.009, 0.091, 0.1, id="no-float-noise"),
    ],
)
def test_rain_includes_showers(mock_http, rain, showers, expected):
    mock_http.replies = [location(rain=[rain] * 3, showers=[showers] * 3)]
    assert get_forecasts([A], START, END)[A].rain_in == [expected] * 3


def test_no_cells_makes_no_request(mock_http):
    assert get_forecasts([], START, END) == {}
    assert mock_http.requests == []


def test_repeated_cells_are_requested_once(mock_http):
    mock_http.handler = answer_each_location
    assert set(get_forecasts([A, B, A], START, END)) == {A, B}
    assert mock_http.params[0]["latitude"] == "40.0,41.3"


def test_batches_of_100(mock_http):
    mock_http.handler = answer_each_location
    cells = [(round(20 + i / 10, 1), -100.0) for i in range(250)]
    forecasts = get_forecasts(cells, START, END)
    sizes = [len(params["latitude"].split(",")) for params in mock_http.params]
    assert sorted(sizes) == [50, 100, 100]
    assert {cell: f.wind_mph[0] for cell, f in forecasts.items()} == {cell: cell[0] for cell in cells}


def test_batches_run_in_parallel(mock_http):
    # Passes only if four requests are in flight at once.
    barrier = threading.Barrier(4, timeout=5)

    def handler(request):
        barrier.wait()
        return answer_each_location(request)

    mock_http.handler = handler
    cells = [(round(20 + i / 10, 1), -100.0) for i in range(400)]
    assert len(get_forecasts(cells, START, END)) == 400


def test_failed_batch_raises(mock_http):
    mock_http.replies = [httpx.Response(429, json={"error": True, "reason": "Limit exceeded."})]
    with pytest.raises(UpstreamError, match="Open-Meteo returned HTTP 429: Limit exceeded."):
        get_forecasts([A], START, END)


# --- caching ---------------------------------------------------------------


def test_cached_cells_are_not_requested_again(mock_http):
    mock_http.handler = answer_each_location
    first = get_forecasts([A], START, END)
    assert get_forecasts([A], START, END) == first
    assert len(mock_http.requests) == 1


def test_cells_sharing_a_latitude_or_longitude_are_cached_separately(mock_http):
    cells = [(40.0, -100.0), (40.0, -101.0), (41.0, -100.0)]
    mock_http.replies = [[location(wind=30.0), location(wind=40.0), location(wind=50.0)]]
    first = get_forecasts(cells, START, END)
    cached = get_forecasts(cells, START, END)
    assert [cached[cell].wind_mph[0] for cell in cells] == [30.0, 40.0, 50.0]
    assert cached == first


def test_only_missing_cells_are_requested(mock_http):
    mock_http.handler = answer_each_location
    get_forecasts([A], START, END)
    assert set(get_forecasts([A, B], START, END)) == {A, B}
    assert mock_http.params[1]["latitude"] == "41.3"


@pytest.mark.parametrize(
    ("start", "end"),
    [(START + timedelta(hours=1), END), (START, END + timedelta(hours=1)), (START + timedelta(days=1), END + timedelta(days=1))],
)
def test_other_windows_are_cached_separately(mock_http, start, end):
    mock_http.handler = answer_each_location
    get_forecasts([A], START, END)
    get_forecasts([A], start, end)
    assert len(mock_http.requests) == 2


def test_cache_lasts_30_minutes(mock_http, monkeypatch):
    from django.core.cache.backends import locmem

    mock_http.handler = answer_each_location
    now = [1_000_000.0]
    monkeypatch.setattr(locmem.time, "time", lambda: now[0])
    get_forecasts([A], START, END)
    now[0] += 29 * 60
    get_forecasts([A], START, END)
    assert len(mock_http.requests) == 1
    now[0] += 2 * 60
    get_forecasts([A], START, END)
    assert len(mock_http.requests) == 2
