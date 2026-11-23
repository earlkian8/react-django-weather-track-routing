import httpx
import pytest
from django.core.cache import cache

TEST_KEY = "test-key-that-must-stay-secret"


class MockHttp:
    """Stands in for the network; everything else in httpx stays real.

    `replies` is used up in order. A reply is an httpx.Response, an exception
    to raise, or a JSON-able body to return with a 200. Set `handler` instead
    when requests run in parallel and the reply depends on the request.
    """

    def __init__(self):
        self.replies = []
        self.handler = None
        self.requests = []
        self.timeouts = []

    def get(self, url, **kwargs):
        self.timeouts.append(kwargs.get("timeout"))
        with httpx.Client(transport=httpx.MockTransport(self._handle)) as client:
            return client.get(url, **kwargs)

    def _handle(self, request):
        self.requests.append(request)
        reply = self.handler(request) if self.handler else self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx.Response):
            return reply
        return httpx.Response(200, json=reply)

    @property
    def params(self):
        return [dict(request.url.params) for request in self.requests]


@pytest.fixture
def mock_http(monkeypatch):
    mock = MockHttp()
    monkeypatch.setattr(httpx, "get", mock.get)
    return mock


@pytest.fixture(autouse=True)
def isolated_settings(settings):
    """Keep the real API key and the on-disk cache out of every test."""
    settings.HERE_API_KEY = TEST_KEY
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    cache.clear()
