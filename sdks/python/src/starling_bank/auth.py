"""OAuth authorization-code and rotating refresh-token helpers."""

from __future__ import annotations

import hmac
import math
import secrets
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx

from .generated.environment import StarlingClientEnvironment as StarlingEnvironment


class OAuthError(Exception):
    def __init__(self, code: str, status_code: int | None = None):
        self.code = code
        self.status_code = status_code
        super().__init__(f"Starling OAuth failed: {code}" + (f" (HTTP {status_code})" if status_code else ""))


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    token_type: str
    expires_in: float
    expires_at: datetime
    scope: str


def create_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def validate_oauth_state(expected: str, received: str | None) -> bool:
    return bool(expected and received and hmac.compare_digest(expected.encode(), received.encode()))


def _parse_tokens(response: httpx.Response) -> OAuthTokens:
    try:
        value = response.json()
    except ValueError:
        raise OAuthError("invalid_response", response.status_code) from None
    if not isinstance(value, dict):
        raise OAuthError("invalid_response", response.status_code)
    if response.status_code != 200:
        code = value.get("error", "oauth_error")
        if not isinstance(code, str) or not code.replace("_", "").isascii() or not code.replace("_", "").isalpha():
            code = "oauth_error"
        raise OAuthError(code, response.status_code)
    expiry = value.get("expires_in")
    valid_expiry = isinstance(expiry, (int, float)) and not isinstance(expiry, bool)
    if valid_expiry:
        try:
            valid_expiry = math.isfinite(expiry) and expiry > 0
        except OverflowError:
            valid_expiry = False
    if (not isinstance(value.get("access_token"), str) or not value["access_token"]
            or not isinstance(value.get("refresh_token"), str) or not value["refresh_token"]
            or not valid_expiry
            or not isinstance(value.get("token_type"), str) or value["token_type"].lower() != "bearer"
            or not isinstance(value.get("scope", ""), str)):
        raise OAuthError("invalid_response", response.status_code)
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expiry)
    except OverflowError:
        raise OAuthError("invalid_response", response.status_code) from None
    return OAuthTokens(value["access_token"], value["refresh_token"], "Bearer", expiry, expires_at, value.get("scope", ""))


class _OAuthConfiguration:
    def __init__(self, *, client_id: str, client_secret: str, redirect_uri: str,
                 environment: StarlingEnvironment = StarlingEnvironment.SANDBOX,
                 tls: ssl.SSLContext | None = None, token_url: str | None = None,
                 timeout: float = 30, custom_client: bool = False):
        if not client_id or not client_secret or not redirect_uri:
            raise ValueError("client_id, client_secret and redirect_uri are required")
        if not isinstance(environment, StarlingEnvironment):
            raise ValueError("Invalid OAuth environment")
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be positive")
        if not urlparse(redirect_uri).scheme:
            raise ValueError("redirect_uri must be an absolute URI")
        production = environment == StarlingEnvironment.PRODUCTION
        if production and tls is None and not custom_client:
            raise ValueError("Production OAuth requires a client-certificate SSLContext or a configured HTTP client")
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._environment = environment
        self._timeout = timeout
        self._token_url = token_url or (
            "https://token-api.starlingbank.com/oauth/access-token" if production
            else "https://token-api-sandbox.starlingbank.com/oauth/access-token" if tls is not None
            else "https://api-sandbox.starlingbank.com/oauth/access-token")
        parsed = urlparse(self._token_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("token_url must be HTTPS without credentials, query parameters or a fragment")

    def get_authorization_url(self, *, state: str, scopes: list[str] | None = None) -> str:
        if not state:
            raise ValueError("A session-bound OAuth state is required")
        base = "https://oauth.starlingbank.com/" if self._environment == StarlingEnvironment.PRODUCTION else "https://oauth-sandbox.starlingbank.com/"
        query = {"client_id": self._client_id, "response_type": "code", "state": state, "redirect_uri": self._redirect_uri}
        if scopes:
            query["scope"] = " ".join(scopes)
        return base + "?" + urlencode(query)

    def _body(self, parameters: dict[str, str]) -> dict[str, str]:
        return {**parameters, "client_id": self._client_id, "client_secret": self._client_secret}


class StarlingOAuth(_OAuthConfiguration):
    """Explicit token exchange; callers own token persistence and session state."""

    def __init__(self, *, client_id: str, client_secret: str, redirect_uri: str,
                 environment: StarlingEnvironment = StarlingEnvironment.SANDBOX,
                 tls: ssl.SSLContext | None = None, token_url: str | None = None,
                 timeout: float = 30, httpx_client: httpx.Client | None = None):
        super().__init__(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri,
                         environment=environment, tls=tls, token_url=token_url, timeout=timeout,
                         custom_client=httpx_client is not None)
        self._owns_client = httpx_client is None
        self._http = httpx_client if httpx_client is not None else httpx.Client(verify=tls if tls is not None else True, follow_redirects=False, timeout=timeout)

    def exchange_code(self, code: str) -> OAuthTokens:
        if not code:
            raise ValueError("An authorization code is required")
        return self._exchange({"grant_type": "authorization_code", "code": code, "redirect_uri": self._redirect_uri})

    def refresh_token(self, refresh_token: str) -> OAuthTokens:
        if not refresh_token:
            raise ValueError("A refresh token is required")
        return self._exchange({"grant_type": "refresh_token", "refresh_token": refresh_token})

    def _exchange(self, parameters: dict[str, str]) -> OAuthTokens:
        try:
            response = self._http.post(self._token_url, data=self._body(parameters), headers={"Accept": "application/json", "User-Agent": "starling-sdk-python"}, timeout=self._timeout, follow_redirects=False)
        except httpx.TimeoutException:
            raise OAuthError("timeout") from None
        except httpx.HTTPError:
            raise OAuthError("network_error") from None
        return _parse_tokens(response)

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> StarlingOAuth:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncStarlingOAuth(_OAuthConfiguration):
    """Asynchronous OAuth helper with the same exchange and persistence contract."""

    def __init__(self, *, client_id: str, client_secret: str, redirect_uri: str,
                 environment: StarlingEnvironment = StarlingEnvironment.SANDBOX,
                 tls: ssl.SSLContext | None = None, token_url: str | None = None,
                 timeout: float = 30, httpx_client: httpx.AsyncClient | None = None):
        super().__init__(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri,
                         environment=environment, tls=tls, token_url=token_url, timeout=timeout,
                         custom_client=httpx_client is not None)
        self._owns_client = httpx_client is None
        self._http = httpx_client if httpx_client is not None else httpx.AsyncClient(verify=tls if tls is not None else True, follow_redirects=False, timeout=timeout)

    async def exchange_code(self, code: str) -> OAuthTokens:
        if not code:
            raise ValueError("An authorization code is required")
        return await self._exchange({"grant_type": "authorization_code", "code": code, "redirect_uri": self._redirect_uri})

    async def refresh_token(self, refresh_token: str) -> OAuthTokens:
        if not refresh_token:
            raise ValueError("A refresh token is required")
        return await self._exchange({"grant_type": "refresh_token", "refresh_token": refresh_token})

    async def _exchange(self, parameters: dict[str, str]) -> OAuthTokens:
        try:
            response = await self._http.post(self._token_url, data=self._body(parameters), headers={"Accept": "application/json", "User-Agent": "starling-sdk-python"}, timeout=self._timeout, follow_redirects=False)
        except httpx.TimeoutException:
            raise OAuthError("timeout") from None
        except httpx.HTTPError:
            raise OAuthError("network_error") from None
        return _parse_tokens(response)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncStarlingOAuth:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()
