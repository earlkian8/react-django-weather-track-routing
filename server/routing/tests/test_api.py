import uuid
from datetime import datetime, timedelta, timezone

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from routing.engine.geo import METERS_PER_MILE
from routing.engine.weather import Forecast
from routing.exceptions import UpstreamError
from routing.services import here, open_meteo
from routing.services.here import Place, RouteOption

# 20 minutes past an hour, well inside the allowed departure range.
DEPARTURE = datetime.now(timezone.utc).replace(minute=20, second=0, microsecond=0) + timedelta(days=1)
WINDOW_START = DEPARTURE.replace(minute=0)

DALLAS = {"lat": 40.0, "lng": -100.0, "label": "Dallas, TX"}
DENVER = {"lat": 41.0, "lng": -100.0, "label": "Denver, CO"}


def iso(when):
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def make_route(id_, lng, miles=100.0, hours=2.0, via=()):
    """A straight route one degree north along a longitude."""
    return RouteOption(
        id=id_,
        points=[(40.0, lng), (41.0, lng)],
        cum_dist_m=[0.0, miles * METERS_PER_MILE],
        cum_time_s=[0.0, hours * 3600],
        distance_m=miles * METERS_PER_MILE,
        duration_s=hours * 3600,
        via=list(via),
    )


class FakeServices:
    """Stands in for HERE and Open-Meteo, recording what they're asked for."""

    def __init__(self):
        self.places = {}
        self.routes = [make_route("A", -100.0), make_route("B", -101.0)]
        self.weather = {}  # longitude -> wind, or a dict of hourly values
        self.no_forecast = set()  # longitudes
        self.geocoded = []
        self.route_calls = []
        self.forecast_calls = []

    def geocode(self, query, limit=5):
        self.geocoded.append(query)
        return self.places.get(query, [])

    def truck_routes(self, *args):
        self.route_calls.append(args)
        return self.routes

    def get_forecasts(self, cells, start, end):
        cells = set(cells)
        self.forecast_calls.append((cells, start, end))
        hours = (end - start) // timedelta(hours=1) + 1
        return {cell: self._forecast(cell[1], start, hours) for cell in cells}

    def _forecast(self, lng, start, hours):
        values = {"wind_mph": 10.0, "gust_mph": 15.0, "rain_in": 0.0, "snow_in": 0.0}
        values |= self.weather.get(lng, {})
        if lng in self.no_forecast:
            values["wind_mph"] = None
        return Forecast(start=start, **{name: [value] * hours for name, value in values.items()})


@pytest.fixture
def services(monkeypatch):
    fake = FakeServices()
    monkeypatch.setattr(here, "geocode", fake.geocode)
    monkeypatch.setattr(here, "truck_routes", fake.truck_routes)
    monkeypatch.setattr(open_meteo, "get_forecasts", fake.get_forecasts)
    return fake


@pytest.fixture
def client():
    return APIClient()


def post_plan(client, **overrides):
    body = {
        "origin": DALLAS,
        "destination": DENVER,
        "departure_time": iso(DEPARTURE),
        "load_weight_lb": 42_000,
    } | overrides
    return client.post("/api/plans/", body, format="json")


def make_plan(client, **overrides):
    response = post_plan(client, **overrides)
    assert response.status_code == 200, response.json()
    return response.json()


# --- plans: response -------------------------------------------------------


def test_plan_response(client, services):
    services.routes = [make_route("A", -100.0, via=["I-40", "US-287"])]
    services.weather[-100.0] = {"wind_mph": 38.04, "gust_mph": 51.26, "rain_in": 0.104, "snow_in": 0.006}
    plan = make_plan(client, checkpoint_interval_mi=50)
    uuid.UUID(plan.pop("id"))

    def checkpoint(mile, lat, minutes, segment_miles):
        return {
            "mile": mile,
            "lat": lat,
            "lng": -100.0,
            "eta": iso(DEPARTURE + timedelta(minutes=minutes)),
            "segment_miles": segment_miles,
            "weather": {"wind_mph": 38.0, "gust_mph": 51.3, "rain_in_hr": 0.1, "snow_in_hr": 0.01},
            "risk": "severe",
            "risk_label": "Severe",
            "risk_level": 3,
            "factors": [
                "Wind 38.04 mph with 42,000 lb load (Severe)",
                "Rain 0.104 in/hr (Moderate)",
            ],
        }

    assert plan == {
        "origin": DALLAS,
        "destination": DENVER,
        "departure_time": iso(DEPARTURE),
        "load_weight_lb": 42_000,
        "checkpoint_interval_mi": 50,
        "recommended_route_id": "A",
        "recommendation": "Route A is the only route available.",
        "advisory": None,
        "routes": [
            {
                "id": "A",
                "name": "Route A",
                "rank": 1,
                "via": ["I-40", "US-287"],
                "distance_mi": 100.0,
                "duration_min": 120,
                "arrival_time": iso(DEPARTURE + timedelta(hours=2)),
                "geometry": [[-100.0, 40.0], [-100.0, 41.0]],
                "summary": {
                    "miles_by_risk": {
                        "low": 0.0, "moderate": 0.0, "high": 0.0, "severe": 100.0, "no_travel": 0.0,
                    },
                    "no_travel_miles": 0.0,
                    "severe_miles": 100.0,
                    "high_miles": 0.0,
                    "unknown_miles": 0.0,
                    "avg_risk": 3.0,
                    "worst_risk": "severe",
                },
                "checkpoints": [
                    checkpoint(0.0, 40.0, 0, 25.0),
                    checkpoint(50.0, 40.5, 60, 50.0),
                    checkpoint(100.0, 41.0, 120, 25.0),
                ],
            }
        ],
    }


def test_geometry_is_lng_lat_rounded_to_5_decimals(client, services):
    route = make_route("A", -100.123456789)
    services.routes = [route]
    assert make_plan(client)["routes"][0]["geometry"] == [[-100.12346, 40.0], [-100.12346, 41.0]]


def test_miles_are_rounded_to_a_tenth(client, services):
    services.routes = [make_route("A", -100.0, miles=33.333)]
    route = make_plan(client, checkpoint_interval_mi=50)["routes"][0]
    assert route["distance_mi"] == 33.3
    assert [c["mile"] for c in route["checkpoints"]] == [0.0, 33.3]
    assert [c["segment_miles"] for c in route["checkpoints"]] == [16.7, 16.7]
    assert route["summary"]["miles_by_risk"]["low"] == 33.3


def test_average_risk_is_rounded_to_three_decimals(client, services):
    services.routes = [make_route("A", -100.0, miles=90)]
    services.weather[-100.0] = {"wind_mph": 30.0}
    original = services._forecast

    def calm_in_the_first_hour(lng, start, hours):
        forecast = original(lng, start, hours)
        forecast.wind_mph[0] = 0.0
        return forecast

    services._forecast = calm_in_the_first_hour
    # Only the start is in the first hour: 12.5 of 90 miles Low, the rest Moderate.
    summary = make_plan(client, checkpoint_interval_mi=25)["routes"][0]["summary"]
    assert summary["avg_risk"] == 0.861
    assert summary["worst_risk"] == "moderate"


def test_times_are_utc_whatever_zone_was_sent(client, services):
    local = DEPARTURE.astimezone(timezone(timedelta(hours=-6)))
    plan = make_plan(client, departure_time=local.isoformat())
    assert plan["departure_time"] == iso(DEPARTURE)
    assert plan["routes"][0]["checkpoints"][0]["eta"] == iso(DEPARTURE)
    assert plan["routes"][0]["arrival_time"] == iso(DEPARTURE + timedelta(hours=2))


def test_checkpoints_without_a_forecast_are_unknown(client, services):
    services.routes = [make_route("A", -100.0)]
    services.no_forecast = {-100.0}
    route = make_plan(client)["routes"][0]
    for checkpoint in route["checkpoints"]:
        assert checkpoint["weather"] is None
        assert (checkpoint["risk"], checkpoint["risk_label"]) == ("unknown", "Unknown")
        assert (checkpoint["risk_level"], checkpoint["factors"]) == (None, [])
    assert route["summary"]["unknown_miles"] == 100.0
    assert route["summary"]["avg_risk"] is None
    assert route["summary"]["worst_risk"] == "unknown"


def test_missing_gust_is_null(client, services):
    services.weather[-100.0] = {"gust_mph": None}
    weather = make_plan(client)["routes"][0]["checkpoints"][0]["weather"]
    assert weather["gust_mph"] is None


# --- plans: recommendation -------------------------------------------------


def test_recommends_the_safer_route(client, services):
    services.weather[-100.0] = {"wind_mph": 50.0}
    plan = make_plan(client, load_weight_lb=20_000)
    assert plan["recommended_route_id"] == "B"
    assert plan["recommendation"] == "Fewest severe miles: 0 mi vs 100 mi on Route A."
    assert [(r["id"], r["rank"]) for r in plan["routes"]] == [("B", 1), ("A", 2)]
    assert plan["advisory"] is None


def test_load_changes_the_risk(client, services):
    services.weather = {-100.0: {"wind_mph": 38.0}, -101.0: {"wind_mph": 38.0}}
    assert make_plan(client, load_weight_lb=35_000)["routes"][0]["summary"]["worst_risk"] == "high"
    assert make_plan(client, load_weight_lb=42_000)["routes"][0]["summary"]["worst_risk"] == "severe"


@pytest.mark.parametrize(
    ("winds", "expected"),
    [
        pytest.param(
            (60.0, 60.0),
            "Every route crosses No Travel conditions. Consider delaying departure.",
            id="all-routes",
        ),
        pytest.param((60.0, 10.0), None, id="one-route"),
        pytest.param((10.0, 10.0), None, id="no-routes"),
    ],
)
def test_advisory(client, services, winds, expected):
    services.weather = {-100.0: {"wind_mph": winds[0]}, -101.0: {"wind_mph": winds[1]}}
    assert make_plan(client)["advisory"] == expected


# --- plans: what the services are asked for --------------------------------


def test_route_request(client, services):
    make_plan(client)
    assert services.route_calls == [((40.0, -100.0), (41.0, -100.0), DEPARTURE, 34_927)]
    assert services.geocoded == []


def test_text_places_use_the_first_geocoding_result(client, services):
    services.places = {
        "dallas": [Place("Dallas, TX", 32.8, -96.8), Place("Dallas, GA", 33.9, -84.8)],
        "denver": [Place("Denver, CO", 39.7, -105.0)],
    }
    plan = make_plan(client, origin=" dallas ", destination="denver")
    assert plan["origin"] == {"label": "Dallas, TX", "lat": 32.8, "lng": -96.8}
    assert plan["destination"] == {"label": "Denver, CO", "lat": 39.7, "lng": -105.0}
    assert services.route_calls[0][:2] == ((32.8, -96.8), (39.7, -105.0))


@pytest.mark.parametrize("field", ["origin", "destination"])
def test_unknown_place_is_a_400(client, services, field):
    response = post_plan(client, **{field: "nowhere"})
    assert response.status_code == 400
    assert response.json() == {field: ['No place found for "nowhere".']}
    assert services.route_calls == []


def test_no_truck_route_is_a_400(client, services):
    services.routes = []
    response = post_plan(client)
    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["No truck route found between these places."]}


def test_forecasts_for_all_routes_come_from_one_call(client, services):
    make_plan(client, checkpoint_interval_mi=50)
    [(cells, _, _)] = services.forecast_calls
    assert cells == {(lat, lng) for lat in (40.0, 40.5, 41.0) for lng in (-100.0, -101.0)}


@pytest.mark.parametrize(
    ("hours", "expected_end_h"),
    [
        pytest.param(2, 48, id="at-least-48h"),
        # 14:20 + 60 h arrives at :20, so the hour mark after it is needed.
        pytest.param(60, 61, id="longest-trip-plus-1h"),
        # 14:20 + 60.9 h arrives at :14 one hour later.
        pytest.param(60.9, 62, id="trip-crossing-an-hour-mark"),
    ],
)
def test_weather_window(client, services, hours, expected_end_h):
    services.routes = [make_route("A", -100.0), make_route("B", -101.0, hours=hours)]
    plan = make_plan(client)
    [(_, start, end)] = services.forecast_calls
    assert start == WINDOW_START
    assert end == WINDOW_START + timedelta(hours=expected_end_h)
    assert all(c["weather"] for route in plan["routes"] for c in route["checkpoints"])


def test_plan_is_cached_for_the_heatmap(client, services):
    plan = make_plan(client)
    assert cache.get(f"plan:{plan['id']}") == {
        "paths": [[(40.0, -100.0), (41.0, -100.0)], [(40.0, -101.0), (41.0, -101.0)]],
        "window_start": WINDOW_START,
        "window_end": WINDOW_START + timedelta(hours=48),
        "load": 42_000,
    }


def test_plan_cache_lasts_an_hour(client, services, monkeypatch):
    from django.core.cache.backends import locmem

    plan = make_plan(client)
    now = locmem.time.time()
    monkeypatch.setattr(locmem.time, "time", lambda: now + 59 * 60)
    assert cache.get(f"plan:{plan['id']}") is not None
    monkeypatch.setattr(locmem.time, "time", lambda: now + 61 * 60)
    assert cache.get(f"plan:{plan['id']}") is None


# --- plans: validation -----------------------------------------------------


def test_interval_defaults_to_25(client, services):
    plan = make_plan(client)
    assert plan["checkpoint_interval_mi"] == 25
    assert [c["mile"] for c in plan["routes"][0]["checkpoints"]] == [0, 25, 50, 75, 100]


@pytest.mark.parametrize("load", [0, 80_000])
@pytest.mark.parametrize("interval", [10, 25, 50])
@pytest.mark.parametrize("offset", [timedelta(minutes=-59), timedelta(days=7, minutes=-1)])
def test_limits_are_accepted(client, services, load, interval, offset):
    make_plan(
        client,
        load_weight_lb=load,
        checkpoint_interval_mi=interval,
        departure_time=iso(datetime.now(timezone.utc) + offset),
    )


def now_plus(**delta):
    return iso(datetime.now(timezone.utc) + timedelta(**delta))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        pytest.param("checkpoint_interval_mi", 30, id="interval-not-offered"),
        pytest.param("checkpoint_interval_mi", "often", id="interval-not-a-number"),
        pytest.param("departure_time", now_plus(days=7, minutes=1), id="departure-too-far-ahead"),
        pytest.param("departure_time", now_plus(minutes=-61), id="departure-too-long-ago"),
        pytest.param("departure_time", "tomorrow", id="departure-not-a-date"),
        pytest.param("load_weight_lb", -1, id="negative-load"),
        pytest.param("load_weight_lb", 80_001, id="overweight-load"),
        pytest.param("load_weight_lb", 1.5, id="fractional-load"),
        pytest.param("load_weight_lb", None, id="null-load"),
        pytest.param("origin", "   ", id="blank-text"),
        pytest.param("origin", 5, id="place-is-a-number"),
        pytest.param("origin", None, id="place-is-null"),
        pytest.param("origin", {"lat": 40, "lng": -100}, id="place-without-label"),
        pytest.param("origin", {"lng": -100, "label": "x"}, id="place-without-lat"),
        pytest.param("origin", {"lat": 91, "lng": -100, "label": "x"}, id="lat-out-of-range"),
        pytest.param("destination", {"lat": 40, "lng": 181, "label": "x"}, id="lng-out-of-range"),
        pytest.param("destination", {"lat": "nan", "lng": 0, "label": "x"}, id="lat-nan"),
    ],
)
def test_invalid_input_is_a_400(client, services, field, value):
    response = post_plan(client, **{field: value})
    assert response.status_code == 400
    assert list(response.json()) == [field]
    assert services.route_calls == []


def test_place_of_the_wrong_type_explains_what_is_accepted(client, services):
    response = post_plan(client, origin=5)
    assert response.json() == {
        "origin": ["Must be a place name or an object with lat, lng and label."]
    }


def test_required_fields(client, services):
    response = client.post("/api/plans/", {}, format="json")
    assert response.status_code == 400
    assert set(response.json()) == {"origin", "destination", "departure_time", "load_weight_lb"}


# --- plans: upstream failures and throttling -------------------------------


@pytest.mark.parametrize(
    ("module", "name"),
    [(here, "truck_routes"), (open_meteo, "get_forecasts")],
    ids=["routing", "weather"],
)
def test_upstream_failure_is_a_502(client, services, monkeypatch, module, name):
    def fail(*args):
        raise UpstreamError("HERE Routing returned HTTP 500: oops")

    monkeypatch.setattr(module, name, fail)
    response = post_plan(client)
    assert response.status_code == 502
    assert response.json() == {"detail": "HERE Routing returned HTTP 500: oops"}


def test_plans_are_throttled(client, services):
    statuses = [client.post("/api/plans/", {}, format="json").status_code for _ in range(21)]
    assert statuses == [400] * 20 + [429]


# --- geocode ---------------------------------------------------------------


def test_geocode(client, services):
    services.places = {"dallas": [Place("Dallas, TX", 32.8, -96.8), Place("Dallas, GA", 33.9, -84.8)]}
    response = client.get("/api/geocode/", {"q": " dallas "})
    assert response.status_code == 200
    assert response.json() == [
        {"label": "Dallas, TX", "lat": 32.8, "lng": -96.8},
        {"label": "Dallas, GA", "lat": 33.9, "lng": -84.8},
    ]


@pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "da"}, {"q": "  da  "}])
def test_short_queries_are_not_sent(client, services, params):
    response = client.get("/api/geocode/", params)
    assert (response.status_code, response.json()) == (200, [])
    assert services.geocoded == []


def test_three_characters_are_enough(client, services):
    client.get("/api/geocode/", {"q": "dal"})
    assert services.geocoded == ["dal"]


def test_geocode_has_its_own_throttle(client, services):
    statuses = [client.get("/api/geocode/").status_code for _ in range(121)]
    assert statuses == [200] * 120 + [429]


# --- heatmap ---------------------------------------------------------------


def get_heatmap(client, plan_id):
    return client.get(f"/api/plans/{plan_id}/heatmap/")


def test_heatmap_shape(client, services):
    plan = make_plan(client)
    response = get_heatmap(client, plan["id"])
    assert response.status_code == 200
    heatmap = response.json()
    assert set(heatmap) == {
        "plan_id", "start", "hours", "cell_size_deg", "cells", "risk", "wind", "rain", "snow",
    }
    assert (heatmap["plan_id"], heatmap["start"]) == (plan["id"], iso(WINDOW_START))
    assert (heatmap["hours"], heatmap["cell_size_deg"]) == (49, 0.1)
    assert 0 < len(heatmap["cells"]) <= 400
    for name in ("risk", "wind", "rain", "snow"):
        assert len(heatmap[name]) == len(heatmap["cells"])
        assert {len(values) for values in heatmap[name]} == {49}


def test_heatmap_uses_the_plans_weather_window(client, services):
    services.routes = [make_route("A", -100.0, hours=60)]
    plan = make_plan(client)
    heatmap = get_heatmap(client, plan["id"]).json()
    (_, *plan_window), (cells, *heatmap_window) = services.forecast_calls
    assert heatmap_window == plan_window == [WINDOW_START, WINDOW_START + timedelta(hours=61)]
    assert cells == {tuple(cell) for cell in heatmap["cells"]}


def test_heatmap_values_follow_their_cell_and_hour(client, services):
    services.routes = [make_route("A", -100.0)]
    services.weather[-100.0] = {"wind_mph": 38.04, "rain_in": 0.104, "snow_in": 0.006}
    original = services._forecast

    def stormy_at_hour_5(lng, start, hours):
        forecast = original(lng, start, hours)
        if lng == -100.0:
            forecast.wind_mph[5] = 60.0
        return forecast

    services._forecast = stormy_at_hour_5
    heatmap = get_heatmap(client, make_plan(client)["id"]).json()
    windy = heatmap["cells"].index([40.5, -100.0])
    calm = heatmap["cells"].index([40.5, -100.1])
    assert heatmap["risk"][windy] == [3] * 5 + [4] + [3] * 43  # 38 mph with 42,000 lb is Severe
    assert heatmap["wind"][windy] == [38.0] * 5 + [60.0] + [38.0] * 43
    assert heatmap["rain"][windy] == [0.1] * 49
    assert heatmap["snow"][windy] == [0.01] * 49
    assert heatmap["risk"][calm] == [0] * 49


def test_heatmap_risk_depends_on_the_load(client, services):
    services.routes = [make_route("A", -100.0)]
    services.weather[-100.0] = {"wind_mph": 38.0}
    heatmap = get_heatmap(client, make_plan(client, load_weight_lb=35_000)["id"]).json()
    assert heatmap["risk"][heatmap["cells"].index([40.5, -100.0])] == [2] * 49


def test_heatmap_hours_without_data_are_null(client, services):
    services.routes = [make_route("A", -100.0)]
    services.no_forecast = {-100.0}
    heatmap = get_heatmap(client, make_plan(client)["id"]).json()
    cell = heatmap["cells"].index([40.5, -100.0])
    for name in ("risk", "wind", "rain", "snow"):
        assert heatmap[name][cell] == [None] * 49


def test_expired_plan_is_a_404(client, services):
    response = get_heatmap(client, uuid.uuid4())
    assert response.status_code == 404
    assert response.json() == {"detail": "Plan expired, please create a new plan"}
    assert services.forecast_calls == []


def test_heatmap_upstream_failure_is_a_502(client, services, monkeypatch):
    plan = make_plan(client)

    def fail(*args):
        raise UpstreamError("Open-Meteo returned HTTP 429: Limit exceeded.")

    monkeypatch.setattr(open_meteo, "get_forecasts", fail)
    response = get_heatmap(client, plan["id"])
    assert response.status_code == 502


# --- health ----------------------------------------------------------------


def test_health(client):
    response = client.get("/api/health/")
    assert (response.status_code, response.json()) == (200, {"status": "ok"})
