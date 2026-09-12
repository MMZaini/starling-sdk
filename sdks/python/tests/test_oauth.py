from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from starling_bank import (
    AsyncStarlingOAuth, OAuthError, StarlingEnvironment, StarlingOAuth,
    create_oauth_state, validate_oauth_state,
)

OPTIONS = dict(client_id="client", client_secret="secret&=+", redirect_uri="https://localhost/callback")
TOKENS = dict(access_token="access-new", refresh_token="refresh-new", token_type="Bearer", expires_in=3600, scope="account:read")


def test_authorization_and_state():
    state = create_oauth_state()
    assert len(state) == 43 and state != create_oauth_state()
    assert validate_oauth_state(state, state)
    assert not validate_oauth_state(state, "wrong")
    assert not validate_oauth_state(state, None)
    assert not validate_oauth_state("", "")
    with StarlingOAuth(**OPTIONS) as oauth:
        url = urlparse(oauth.get_authorization_url(state=state, scopes=["account:read", "balance:read"]))
        assert url.netloc == "oauth-sandbox.starlingbank.com"
        query = parse_qs(url.query)
        assert query["state"] == [state]
        assert query["scope"] == ["account:read balance:read"]
        assert query["redirect_uri"] == [OPTIONS["redirect_uri"]]
        assert "client_secret" not in query
        with pytest.raises(ValueError):
            oauth.get_authorization_url(state="")
    assert oauth._http.is_closed


def test_exchange_and_refresh_bodies_and_client_ownership():
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=TOKENS)
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingOAuth(**OPTIONS, httpx_client=http) as oauth:
            result = oauth.exchange_code("code&=+")
            assert result.access_token == "access-new"
            assert result.refresh_token == "refresh-new"
            assert "access-new" not in repr(result) and "refresh-new" not in repr(result)
            assert result.expires_at.tzinfo is not None
            oauth.refresh_token("refresh-old")
        assert not http.is_closed
    assert len(requests) == 2
    for request in requests:
        assert str(request.url) == "https://api-sandbox.starlingbank.com/oauth/access-token"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        assert parse_qs(request.content.decode())["client_secret"] == [OPTIONS["client_secret"]]
    assert parse_qs(requests[0].content.decode())["code"] == ["code&=+"]
    refresh = parse_qs(requests[1].content.decode())
    assert refresh["grant_type"] == ["refresh_token"]
    assert refresh["refresh_token"] == ["refresh-old"]
    assert "redirect_uri" not in refresh


def test_production_requires_certificate_configuration_and_https():
    with pytest.raises(ValueError, match="certificate"):
        StarlingOAuth(**OPTIONS, environment=StarlingEnvironment.PRODUCTION)
    for token_url in ["http://localhost/token", "https://user:pass@example.com/token", "https://example.com/token?secret=yes"]:
        with pytest.raises(ValueError, match="HTTPS"):
            StarlingOAuth(**OPTIONS, token_url=token_url)


@pytest.mark.parametrize("body", [None, [], {**TOKENS, "expires_in": -1}, {**TOKENS, "expires_in": True}, {**TOKENS, "expires_in": 1e30}, {**TOKENS, "expires_in": 10**400}, {**TOKENS, "refresh_token": ""}, {**TOKENS, "token_type": "MAC"}])
def test_invalid_token_response(body):
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body))) as http:
        with StarlingOAuth(**OPTIONS, httpx_client=http) as oauth:
            with pytest.raises(OAuthError, match="invalid_response"):
                oauth.refresh_token("old")


def test_oauth_errors_are_sanitized_and_never_retried():
    attempts = []
    def handler(request):
        attempts.append(request)
        return httpx.Response(400, json={"error": "invalid_grant", "error_description": "secret&=+ refresh-old"})
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingOAuth(**OPTIONS, httpx_client=http) as oauth:
            with pytest.raises(OAuthError) as caught:
                oauth.refresh_token("refresh-old")
    assert caught.value.code == "invalid_grant" and caught.value.status_code == 400
    assert "secret" not in str(caught.value) and "refresh-old" not in str(caught.value)
    assert len(attempts) == 1


async def test_async_exchange_refresh_and_ownership():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=TOKENS))) as http:
        async with AsyncStarlingOAuth(**OPTIONS, httpx_client=http) as oauth:
            assert (await oauth.exchange_code("code")).access_token == "access-new"
            assert (await oauth.refresh_token("old")).refresh_token == "refresh-new"
        assert not http.is_closed
    async with AsyncStarlingOAuth(**OPTIONS) as oauth:
        pass
    assert oauth._http.is_closed


async def test_async_timeout_is_sanitized():
    def handler(request):
        raise httpx.ReadTimeout("secret detail", request=request)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncStarlingOAuth(**OPTIONS, httpx_client=http) as oauth:
            with pytest.raises(OAuthError) as caught:
                await oauth.refresh_token("old")
    assert caught.value.code == "timeout" and "secret" not in str(caught.value)
