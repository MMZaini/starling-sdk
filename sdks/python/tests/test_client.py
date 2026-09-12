import json
import re
from pathlib import Path

import httpx
import pytest

from starling_bank import ApiError, AsyncStarlingClient, StarlingClient, StarlingEnvironment


def test_bearer_auth_and_raw_response():
    def handler(request):
        assert str(request.url) == "https://api-sandbox.starlingbank.com/api/v2/accounts"
        assert request.headers["authorization"] == "Bearer test-token"
        return httpx.Response(200, json={"accounts": [{"accountUid": "account-1", "currency": "GBP"}]}, headers={"X-Request-Id": "request-1"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = StarlingClient(access_token="test-token", httpx_client=http)
        result = client.accounts.with_raw_response.list()
        assert result.data.accounts[0].account_uid == "account-1"
        assert result.response.headers["X-Request-Id"] == "request-1"


def test_writes_preserve_amounts_and_are_not_retried():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.method == "PUT"
        assert request.url.raw_path == b"/api/v2/account/a%2Fb/savings-goals"
        assert json.loads(request.content) == {"name": "Holiday", "currency": "GBP", "target": {"currency": "GBP", "minorUnits": 12345}}
        return httpx.Response(503, json={"errors": [{"message": "temporarily unavailable"}]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = StarlingClient(access_token="test-token", httpx_client=http, max_retries=4)
        with pytest.raises(ApiError) as error:
            client.savings_goals.create(account_uid="a/b", name="Holiday", currency="GBP", target={"currency": "GBP", "minorUnits": 12345}, request_options={"max_retries": 5})
        assert error.value.status_code == 503
    assert len(requests) == 1


async def test_async_client_and_error_details():
    body = {"errors": [{"message": "Required scope missing"}], "success": False}

    async def handler(request):
        assert request.url.host == "api.starlingbank.com"
        return httpx.Response(403, json=body)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = AsyncStarlingClient(access_token="test-token", environment=StarlingEnvironment.PRODUCTION, httpx_client=http)
        with pytest.raises(ApiError) as error:
            await client.accounts.list()
        assert error.value.status_code == 403
        assert error.value.body == body


def test_every_operation_has_sync_and_async_methods():
    operations = json.loads((Path(__file__).resolve().parents[3] / "openapi/operations.json").read_text())
    snake = lambda value: re.sub(r"[A-Z]", lambda match: "_" + match[0].lower(), value)
    with httpx.Client() as http:
        client = StarlingClient(access_token="test-token", httpx_client=http)
        for op in operations:
            assert callable(getattr(getattr(client, snake(op["group"])), snake(op["name"])))


async def test_every_operation_has_async_methods():
    operations = json.loads((Path(__file__).resolve().parents[3] / "openapi/operations.json").read_text())
    snake = lambda value: re.sub(r"[A-Z]", lambda match: "_" + match[0].lower(), value)
    async with httpx.AsyncClient() as http:
        client = AsyncStarlingClient(access_token="test-token", httpx_client=http)
        for op in operations:
            assert callable(getattr(getattr(client, snake(op["group"])), snake(op["name"])))


def test_upload_uses_raw_bytes_and_supplied_media_type():
    data = bytes([0, 255, 10, 34])

    def handler(request):
        assert request.headers["content-type"] == "image/png"
        assert request.content == data
        return httpx.Response(200, json="attachment-1")

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = StarlingClient(access_token="test-token", httpx_client=http)
        result = client.feed.upload_attachment(account_uid="account", category_uid="category", feed_item_uid="feed-item", request=data, request_options={"additional_headers": {"content-type": "image/png"}})
        assert result == "attachment-1"
