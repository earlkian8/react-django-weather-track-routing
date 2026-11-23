"""JSON over HTTP for the upstream services, with secrets kept out of logs."""

import logging
import re
from typing import Any

import httpx

from routing.exceptions import UpstreamError

TIMEOUT_S = 15

# HERE: title + cause (requests) or error_description (auth). Open-Meteo: reason.
REASON_FIELDS = ("title", "cause", "reason", "error_description")

_SECRET = re.compile(r"(apiKey=)[^&\s\"']+", re.IGNORECASE)


def _redact_secrets(record: logging.LogRecord) -> bool:
    record.msg = _SECRET.sub(r"\1***", record.getMessage())
    record.args = ()
    return True


# httpx logs every request's full URL, query string included, at INFO.
logging.getLogger("httpx").addFilter(_redact_secrets)


def get_json(url: str, params: dict[str, Any], service_name: str) -> Any:
    """GET `url` and return its JSON, or raise UpstreamError with the reason."""

    # Causes are suppressed (`from None`): httpx exceptions can carry the URL,
    # which would put the API key in tracebacks.
    def fail(message: str) -> UpstreamError:
        secret = params.get("apiKey")
        return UpstreamError(message.replace(secret, "***") if secret else message)

    try:
        response = httpx.get(url, params=params, timeout=TIMEOUT_S)
    except httpx.HTTPError as exc:
        raise fail(f"Could not reach {service_name}: {exc}") from None

    if not response.is_success:
        raise fail(f"{service_name} returned HTTP {response.status_code}: {_reason(response)}")

    try:
        return response.json()
    except ValueError:
        raise fail(f"{service_name} returned a response that isn't JSON") from None


def _reason(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        parts = [body[f] for f in REASON_FIELDS if isinstance(body.get(f), str) and body[f]]
        if parts:
            return ": ".join(parts)
    return response.reason_phrase
