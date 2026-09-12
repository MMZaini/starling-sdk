"""Generated resources with signing and explicit HTTP client ownership."""

from __future__ import annotations

import math
import os
import re
from contextlib import asynccontextmanager, contextmanager
from typing import Callable, cast
from urllib.parse import urlsplit

import httpx

from .generated.client import AsyncStarlingClient as GeneratedAsyncClient, StarlingClient as GeneratedClient
from .generated.core.logging import LogConfig, Logger
from .generated.environment import StarlingClientEnvironment as StarlingEnvironment
from .metadata.signed_routes import SIGNED_ROUTES
from .signing import RequestSigner, SigningError

_ROUTES = [(route["method"], re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", route["path"]) + "$")) for route in SIGNED_ROUTES]


def _configuration(base_url, environment, access_token, timeout, max_retries):
    if not isinstance(environment, StarlingEnvironment):
        raise ValueError("Invalid Starling environment")
    base_url = base_url or environment.value
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("base_url must be an HTTPS origin without credentials, path or query")
    if timeout is not None and (not math.isfinite(timeout) or timeout <= 0):
        raise ValueError("timeout must be positive")
    if not isinstance(max_retries, int) or isinstance(max_retries, bool) or max_retries < 0:
        raise ValueError("max_retries must be a non-negative integer")
    token = access_token if access_token is not None else os.getenv("STARLING_ACCESS_TOKEN")
    if not token:
        raise ValueError("Provide access_token or set STARLING_ACCESS_TOKEN")
    return base_url.rstrip("/"), token


def _validate_amounts(value):
    if isinstance(value, dict):
        for name, child in value.items():
            if name == "minorUnits" and (not isinstance(child, int) or isinstance(child, bool)):
                raise ValueError("minorUnits must be an integer; never pass fractional amounts")
            _validate_amounts(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _validate_amounts(child)


class _RequestGuard:
    def __init__(self, origin: str, signer: RequestSigner | None):
        self.origin = httpx.URL(origin)
        self.signer = signer

    def prepare(self, http, method, url, kwargs):
        if kwargs.get("timeout") is None:
            kwargs.pop("timeout", None)  # Preserve the supplied HTTP client's timeout.
        if kwargs.get("headers"):
            # Fern merges dictionaries case-sensitively; HTTP header overrides are not.
            kwargs["headers"] = {key.lower(): value for key, value in kwargs["headers"].items()}
        if method.upper() not in ("GET", "HEAD", "OPTIONS"):
            _validate_amounts(kwargs.get("json"))
        request = http.build_request(method, url, **kwargs)
        if (request.url.scheme, request.url.host, request.url.port) != (self.origin.scheme, self.origin.host, self.origin.port):
            raise ValueError("Refusing to send credentials to a different origin")
        if not re.fullmatch(r"Bearer [^\s;,]+", request.headers.get("Authorization", ""), re.IGNORECASE):
            raise ValueError("Provide one non-empty bearer access token")
        path = request.url.raw_path.decode("ascii").split("?", 1)[0]
        if any(method.upper() == verb and pattern.fullmatch(path) for verb, pattern in _ROUTES):
            if self.signer is None:
                raise SigningError("This endpoint requires signing; configure the registered API key")
            body = request.read() if "content-length" in request.headers or "transfer-encoding" in request.headers else None
            request.headers.update(self.signer.sign_headers(method=method, url=str(request.url), body=body, authorization=request.headers["Authorization"]))
        return request


class _SyncHttp:
    def __init__(self, http: httpx.Client, guard: _RequestGuard):
        self.http, self.guard = http, guard

    def request(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs)
        return self.http.send(request, auth=None, follow_redirects=False)

    @contextmanager
    def stream(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs)
        response = self.http.send(request, stream=True, auth=None, follow_redirects=False)
        try:
            yield response
        finally:
            response.close()


class _AsyncHttp:
    def __init__(self, http: httpx.AsyncClient, guard: _RequestGuard):
        self.http, self.guard = http, guard

    async def request(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs)
        return await self.http.send(request, auth=None, follow_redirects=False)

    @asynccontextmanager
    async def stream(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs)
        response = await self.http.send(request, stream=True, auth=None, follow_redirects=False)
        try:
            yield response
        finally:
            await response.aclose()


class StarlingClient(GeneratedClient):
    """Synchronous API client. Close it, or use a with block, when finished."""

    def __init__(self, *, access_token: str | Callable[[], str] | None = None,
                 environment: StarlingEnvironment = StarlingEnvironment.SANDBOX,
                 base_url: str | None = None, signing: RequestSigner | None = None,
                 headers: dict[str, str] | None = None, timeout: float | None = None,
                 max_retries: int = 2, httpx_client: httpx.Client | None = None,
                 logging: LogConfig | Logger | None = None):
        origin, token = _configuration(base_url, environment, access_token, timeout, max_retries)
        self._owns_client = httpx_client is None
        default_timeout = timeout if timeout is not None else 60 if self._owns_client else None
        self._http = httpx_client if httpx_client is not None else httpx.Client(timeout=default_timeout, follow_redirects=False)
        http = _SyncHttp(self._http, _RequestGuard(origin, signing))
        super().__init__(base_url=origin, environment=environment, access_token=token, headers=headers,
                         timeout=default_timeout, max_retries=max_retries, follow_redirects=False,
                         httpx_client=cast(httpx.Client, http), logging=logging)
        self._base_url = origin

    @property
    def base_url(self) -> str:
        return self._base_url

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> StarlingClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncStarlingClient(GeneratedAsyncClient):
    """Asynchronous API client. Use async with, or await aclose(), when finished."""

    def __init__(self, *, access_token: str | Callable[[], str] | None = None,
                 environment: StarlingEnvironment = StarlingEnvironment.SANDBOX,
                 base_url: str | None = None, signing: RequestSigner | None = None,
                 headers: dict[str, str] | None = None, timeout: float | None = None,
                 max_retries: int = 2, httpx_client: httpx.AsyncClient | None = None,
                 logging: LogConfig | Logger | None = None):
        origin, token = _configuration(base_url, environment, access_token, timeout, max_retries)
        self._owns_client = httpx_client is None
        default_timeout = timeout if timeout is not None else 60 if self._owns_client else None
        self._http = httpx_client if httpx_client is not None else httpx.AsyncClient(timeout=default_timeout, follow_redirects=False)
        http = _AsyncHttp(self._http, _RequestGuard(origin, signing))
        super().__init__(base_url=origin, environment=environment, access_token=token, headers=headers,
                         timeout=default_timeout, max_retries=max_retries, follow_redirects=False,
                         httpx_client=cast(httpx.AsyncClient, http), logging=logging)
        self._base_url = origin

    @property
    def base_url(self) -> str:
        return self._base_url

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncStarlingClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()
