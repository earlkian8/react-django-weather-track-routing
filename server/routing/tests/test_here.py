from datetime import datetime, timedelta, timezone

import flexpolyline
import httpx
import pytest
from django.core.exceptions import ImproperlyConfigured

from routing.exceptions import UpstreamError
from routing.services.here import Place, geocode, gross_weight_kg, truck_routes

from .conftest import TEST_KEY

ORIGIN, DESTINATION = (32.7767, -96.797), (39.7392, -104.9903)
DEPARTURE = datetime(2026, 11, 25, 14, 0, tzinfo=timezone.utc)
LINE = [(40.0, -100.0), (40.1, -100.0), (40.3, -100.0)]


def span(offset, length, duration, *numbers):
    data = {"offset": offset, "length": length, "duration": duration}
    if numbers:
        data["routeNumbers"] = [{"value": n, "language": "en", "routeType": 1} for n in numbers]
    return data


def section(points, spans):
    return {"polyline": flexpolyline.encode(points), "spans": spans}


def route(points=LINE, spans=None):
    return {"sections": [section(points, spans or [span(0, 1000, 100)])]}


def routes(*items):
    return {"routes": list(items)}


def column(lng, count=100):
    """`count` points 0.01 degrees apart, so each is its own cell."""
    return [(40 + i / 100, lng) for i in range(count)]


# Three routes that share nothing, enough to need no retry.
DISTINCT = [route(column(lng)) for lng in (-100.0, -101.0, -102.0)]


def get_routes(departure=DEPARTURE, weight=36287):
    return truck_routes(ORIGIN, DESTINATION, departure, weight)


def first_lngs(options):
    return [option.points[0][1] for option in options]


# --- configuration ---------------------------------------------------------


@pytest.mark.parametrize("call", [lambda: geocode("Dallas"), get_routes], ids=["geocode", "routes"])
def test_missing_api_key_is_a_clear_error(mock_http, settings, call):
    settings.HERE_API_KEY = ""
    with pytest.raises(ImproperlyConfigured, match="HERE_API_KEY is not set"):
        call()
    assert mock_http.requests == []


@pytest.mark.parametrize(
    ("tare_lb", "load_lb", "expected_kg"),
    [(35_000, 45_000, 36_287), (20_000, 20_000, 18_144), (35_000, 0, 15_876)],
)
def test_gross_weight_is_tare_plus_load_in_kg(settings, tare_lb, load_lb, expected_kg):
    settings.TRUCK_TARE_LB = tare_lb
    assert gross_weight_kg(load_lb) == expected_kg


# --- geocode ---------------------------------------------------------------


def test_geocode_request(mock_http):
    mock_http.replies = [{"items": []}, {"items": []}]
    geocode("Dallas, TX")
    geocode("Dallas, TX", limit=2)
    url = mock_http.requests[0].url
    assert (url.host, url.path) == ("geocode.search.hereapi.com", "/v1/geocode")
    expected = {"q": "Dallas, TX", "in": "countryCode:USA,CAN,MEX", "apiKey": TEST_KEY}
    assert mock_http.params == [{**expected, "limit": "5"}, {**expected, "limit": "2"}]


def test_geocode_parses_places(mock_http):
    mock_http.replies = [
        {
            "items": [
                {
                    "title": "Dallas",
                    "address": {"label": "Dallas, TX, United States"},
                    "position": {"lat": 32.77823, "lng": -96.7951},
                }
            ]
        }
    ]
    assert geocode("Dallas") == [Place("Dallas, TX, United States", 32.77823, -96.7951)]


# --- truck_routes: request -------------------------------------------------


def test_routes_request(mock_http):
    mock_http.replies = [routes(*DISTINCT)]
    get_routes()
    url = mock_http.requests[0].url
    assert (url.host, url.path) == ("router.hereapi.com", "/v8/routes")
    assert mock_http.params == [
        {
            "transportMode": "truck",
            "origin": "32.7767,-96.797",
            "destination": "39.7392,-104.9903",
            "departureTime": "2026-11-25T14:00:00Z",
            "alternatives": "2",
            "vehicle[grossWeight]": "36287",
            "return": "polyline,summary",
            "spans": "length,duration,routeNumbers",
            "apiKey": TEST_KEY,
        }
    ]


def test_fractional_weight_is_sent_as_a_whole_number(mock_http):
    mock_http.replies = [routes(*DISTINCT)]
    get_routes(weight=36287.4)
    assert mock_http.params[0]["vehicle[grossWeight]"] == "36287"


def test_local_departure_is_sent_as_utc(mock_http):
    mock_http.replies = [routes(*DISTINCT)]
    get_routes(departure=DEPARTURE.astimezone(timezone(timedelta(hours=-6))))
    assert mock_http.params[0]["departureTime"] == "2026-11-25T14:00:00Z"


def test_naive_departure_is_rejected(mock_http):
    with pytest.raises(ValueError):
        get_routes(departure=datetime(2026, 11, 25, 14, 0))
    assert mock_http.requests == []


# --- truck_routes: parsing -------------------------------------------------


def parse(mock_http, data):
    mock_http.replies = [routes(data), routes(), routes()]
    [option] = get_routes()
    return option


def test_decodes_polyline_and_builds_profile(mock_http):
    # Edges are 1/3 and 2/3 of the line.
    option = parse(mock_http, route(LINE, [span(0, 3000, 300)]))
    assert option.points == LINE
    assert option.cum_dist_m == pytest.approx([0, 1000, 3000])
    assert option.cum_time_s == pytest.approx([0, 100, 300])
    assert (option.distance_m, option.duration_s) == pytest.approx((3000, 300))


def test_spans_keep_their_own_speeds(mock_http):
    option = parse(mock_http, route(LINE, [span(0, 1000, 50), span(1, 2000, 400)]))
    assert option.cum_dist_m == pytest.approx([0, 1000, 3000])
    assert option.cum_time_s == pytest.approx([0, 50, 450])


def test_sections_are_joined_without_the_duplicated_vertex(mock_http):
    second = [(40.3, -100.0), (40.4, -100.0), (40.6, -100.0)]
    third = [(40.6, -100.0), (40.7, -100.0)]
    option = parse(
        mock_http,
        {
            "sections": [
                section(LINE, [span(0, 1000, 50), span(1, 2000, 400)]),
                section(second, [span(0, 500, 10), span(1, 700, 20)]),  # offsets restart
                section(third, [span(0, 100, 5)]),
            ]
        },
    )
    assert option.points == [*LINE, (40.4, -100.0), (40.6, -100.0), (40.7, -100.0)]
    assert option.cum_dist_m == pytest.approx([0, 1000, 3000, 3500, 4200, 4300])
    assert option.cum_time_s == pytest.approx([0, 50, 450, 460, 480, 485])
    assert (option.distance_m, option.duration_s) == pytest.approx((4300, 485))


@pytest.mark.parametrize(
    ("spans", "expected"),
    [
        pytest.param(
            [span(0, 100, 1, "I-35"), span(1, 500, 1, "US-287"), span(1, 900, 1, "I-40")],
            ["I-40", "US-287"],
            id="top-two-longest-first",
        ),
        pytest.param(
            [span(0, 300, 1, "I-35"), span(0, 400, 1, "I-40"), span(1, 300, 1, "I-35")],
            ["I-35", "I-40"],
            id="distance-summed-across-spans",
        ),
        pytest.param(
            [span(0, 500, 1, "US-81", "US-287"), span(1, 100, 1, "US-287")],
            ["US-287", "US-81"],
            id="shared-road-counts-for-each-number",
        ),
        pytest.param(
            [span(0, 100, 1, "I-35", "I-35"), span(1, 150, 1, "I-40")],
            ["I-40", "I-35"],
            id="repeat-in-one-span-counts-once",
        ),
        pytest.param([span(0, 100, 1, "I-40")], ["I-40"], id="only-one"),
        pytest.param([span(0, 100, 1)], [], id="missing"),
        pytest.param([{**span(0, 100, 1), "routeNumbers": None}], [], id="null"),
        pytest.param([{**span(0, 100, 1), "routeNumbers": "I-40"}], [], id="not-a-list"),
        pytest.param([{**span(0, 100, 1), "routeNumbers": 5}], [], id="not-iterable"),
        pytest.param(
            [{**span(0, 100, 1), "routeNumbers": [None, "x", {}, {"value": None}, {"value": ["I-35"]}, {"value": ""}, {"value": "I-40"}]}],
            ["I-40"],
            id="bad-entries-skipped",
        ),
    ],
)
def test_via(mock_http, spans, expected):
    assert parse(mock_http, route(LINE, spans)).via == expected


def test_via_combines_sections(mock_http):
    option = parse(
        mock_http,
        {
            "sections": [
                section(LINE, [span(0, 100, 1, "I-35")]),
                section(LINE, [span(0, 80, 1, "I-40"), span(1, 60, 1, "I-35")]),
            ]
        },
    )
    assert option.via == ["I-35", "I-40"]


def test_ids_follow_here_order(mock_http):
    mock_http.replies = [routes(*DISTINCT)]
    options = get_routes()
    assert [option.id for option in options] == ["A", "B", "C"]
    assert first_lngs(options) == [-100.0, -101.0, -102.0]


# --- truck_routes: retries -------------------------------------------------


def test_three_routes_need_no_retry(mock_http):
    mock_http.replies = [routes(*DISTINCT)]
    get_routes()
    assert len(mock_http.requests) == 1


def test_retries_short_then_toll_free(mock_http):
    mock_http.replies = [routes(item) for item in DISTINCT]
    options = get_routes()
    assert first_lngs(options) == [-100.0, -101.0, -102.0]
    base, short, toll_free = mock_http.params
    assert short == {**base, "routingMode": "short"}
    assert toll_free == {**base, "avoid[features]": "tollRoad"}


def test_stops_retrying_once_there_are_three(mock_http):
    mock_http.replies = [routes(DISTINCT[0]), routes(*DISTINCT[1:])]
    assert len(get_routes()) == 3
    assert len(mock_http.requests) == 2


def test_never_returns_more_than_three(mock_http):
    extra = route(column(-103.0))
    mock_http.replies = [routes(*DISTINCT[:2]), routes(DISTINCT[2], extra)]
    assert first_lngs(get_routes()) == [-100.0, -101.0, -102.0]


def test_failed_retry_keeps_the_routes_already_found(mock_http):
    mock_http.replies = [routes(DISTINCT[0]), httpx.Response(500), routes(DISTINCT[1])]
    assert first_lngs(get_routes()) == [-100.0, -101.0]


def test_first_request_failing_raises(mock_http):
    mock_http.replies = [httpx.Response(401, json={"error_description": "apiKey invalid."})]
    with pytest.raises(UpstreamError, match="HERE Routing returned HTTP 401: apiKey invalid."):
        get_routes()


def test_retry_failing_with_nothing_found_raises(mock_http):
    mock_http.replies = [routes(), httpx.Response(500)]
    with pytest.raises(UpstreamError):
        get_routes()


def test_no_route_found_returns_an_empty_list(mock_http):
    nothing = {"notices": [{"code": "noRouteFound"}], "routes": []}
    mock_http.replies = [nothing, nothing, nothing]
    assert get_routes() == []


# --- truck_routes: duplicates ----------------------------------------------


def unique_count(mock_http, *point_lists):
    mock_http.replies = [routes(*(route(points) for points in point_lists)), routes(), routes()]
    return len(get_routes())


def test_retry_duplicates_are_dropped_keeping_the_first(mock_http):
    again = route(column(-100.0), [span(0, 1000, 999)])
    mock_http.replies = [routes(DISTINCT[0]), routes(again, DISTINCT[1]), routes(again)]
    options = get_routes()
    assert [option.id for option in options] == ["A", "B"]
    assert first_lngs(options) == [-100.0, -101.0]
    assert options[0].duration_s == pytest.approx(100)


def test_duplicates_within_one_response_trigger_a_retry(mock_http):
    mock_http.replies = [routes(DISTINCT[0], DISTINCT[0], DISTINCT[1]), routes(DISTINCT[2])]
    assert first_lngs(get_routes()) == [-100.0, -101.0, -102.0]


@pytest.mark.parametrize(("shared", "expected"), [(100, 1), (90, 1), (89, 2), (0, 2)])
def test_ninety_percent_overlap_is_a_duplicate(mock_http, shared, expected):
    base = column(-100.0)
    other = base[:shared] + column(-101.0)[shared:]
    assert unique_count(mock_http, base, other) == expected


def test_points_are_compared_to_a_hundredth_of_a_degree(mock_http):
    base = column(-100.0)
    nudged = [(lat + 0.004, lng - 0.004) for lat, lng in base]
    shifted = [(lat, lng - 0.01) for lat, lng in base]
    assert unique_count(mock_http, base, nudged) == 1
    assert unique_count(mock_http, base, shifted) == 2


@pytest.mark.parametrize("longer_first", [False, True])
def test_route_with_a_long_extra_leg_is_not_a_duplicate(mock_http, longer_first):
    base = column(-100.0)
    longer = base + column(-101.0, 50)
    pair = [longer, base] if longer_first else [base, longer]
    assert unique_count(mock_http, *pair) == 2
