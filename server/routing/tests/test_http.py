import logging
import traceback

import httpx
import pytest

from routing.exceptions import UpstreamError
from routing.services.http import get_json

from .conftest import TEST_KEY

URL = "https://upstream.example/v1"


def fetch():
    return get_json(URL, {"q": "Dallas", "apiKey": TEST_KEY}, "Example")


def test_returns_decoded_json(mock_http):
    mock_http.replies = [{"items": [1, 2]}]
    assert fetch() == {"items": [1, 2]}


def test_sends_params_with_a_15s_timeout(mock_http):
    mock_http.replies = [{}]
    fetch()
    assert mock_http.params == [{"q": "Dallas", "apiKey": TEST_KEY}]
    assert mock_http.timeouts == [15]


@pytest.mark.parametrize(
    ("response", "detail"),
    [
        pytest.param(
            httpx.Response(400, json={"title": "Malformed request", "cause": "Bad weight"}),
            "Example returned HTTP 400: Malformed request: Bad weight",
            id="here-title-and-cause",
        ),
        pytest.param(
            httpx.Response(400, json={"title": "Malformed request", "cause": ""}),
            "Example returned HTTP 400: Malformed request",
            id="here-title-only",
        ),
        pytest.param(
            httpx.Response(401, json={"error": "Unauthorized", "error_description": "apiKey invalid."}),
            "Example returned HTTP 401: apiKey invalid.",
            id="here-auth",
        ),
        pytest.param(
            httpx.Response(400, json={"error": True, "reason": "Latitude out of range"}),
            "Example returned HTTP 400: Latitude out of range",
            id="open-meteo-reason",
        ),
        pytest.param(
            httpx.Response(503, text="<html>oops</html>"),
            "Example returned HTTP 503: Service Unavailable",
            id="not-json",
        ),
        pytest.param(
            httpx.Response(500, json=["oops"]),
            "Example returned HTTP 500: Internal Server Error",
            id="json-but-not-an-object",
        ),
        pytest.param(
            httpx.Response(302, headers={"location": "https://elsewhere.example"}),
            "Example returned HTTP 302: Found",
            id="redirect",
        ),
    ],
)
def test_error_responses_carry_the_upstream_reason(mock_http, response, detail):
    mock_http.replies = [response]
    with pytest.raises(UpstreamError) as error:
        fetch()
    assert str(error.value.detail) == detail
    assert error.value.status_code == 502


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectError("no route to host"), httpx.ReadTimeout("timed out")],
    ids=["connect", "timeout"],
)
def test_network_errors(mock_http, failure):
    mock_http.replies = [failure]
    with pytest.raises(UpstreamError) as error:
        fetch()
    assert str(error.value.detail) == f"Could not reach Example: {failure}"
    assert error.value.status_code == 502


def test_success_with_an_unreadable_body(mock_http):
    mock_http.replies = [httpx.Response(200, text="not json")]
    with pytest.raises(UpstreamError, match="Example returned a response that isn't JSON"):
        fetch()


def test_key_is_redacted_from_httpx_request_logs(mock_http, caplog):
    caplog.set_level(logging.DEBUG)
    mock_http.replies = [{}]
    fetch()
    assert "apiKey=***" in caplog.text  # httpx did log the request
    assert "q=Dallas" in caplog.text
    assert TEST_KEY not in caplog.text


@pytest.mark.parametrize(
    "reply",
    [
        pytest.param(httpx.Response(401, json={"title": f"Bad key {TEST_KEY}"}), id="echoed-in-reason"),
        pytest.param(httpx.ConnectError(f"failed: {URL}?apiKey={TEST_KEY}"), id="echoed-in-network-error"),
        pytest.param(httpx.Response(500), id="plain-error"),
        pytest.param(httpx.Response(200, text=f"not json {TEST_KEY}"), id="unreadable-body"),
    ],
)
def test_key_is_not_in_errors_or_their_tracebacks(mock_http, caplog, reply):
    caplog.set_level(logging.DEBUG)
    mock_http.replies = [reply]
    with pytest.raises(UpstreamError) as error:
        fetch()
    assert TEST_KEY not in str(error.value.detail)
    assert TEST_KEY not in "".join(traceback.format_exception(error.value))
    assert TEST_KEY not in caplog.text
