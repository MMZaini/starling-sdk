import asyncio

import httpx
import pytest

from starling_bank import ApiError, AsyncStarlingClient, StarlingClient


@pytest.mark.parametrize("status", [200, 302])
def test_invalid_json_and_redirects_are_errors(status):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, text="not json", headers={"Location": "https://unexpected.example/", "X-Request-Id": "123"})
    with httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            with pytest.raises(ApiError) as caught:
                client.accounts.list()
    assert caught.value.status_code == status
    assert caught.value.body == "not json"
    assert len(requests) == 1


def test_invalid_amounts_are_rejected_before_network():
    def handler(request):
        pytest.fail("must not send")
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            for amount in [1.5, True, float("inf")]:
                with pytest.raises(ValueError, match="minorUnits"):
                    client.savings_goals.create(account_uid="account", name="Goal", currency="GBP", target={"currency": "GBP", "minorUnits": amount})


def test_reads_env_at_instantiation_and_preserves_custom_timeouts(monkeypatch):
    monkeypatch.setenv("STARLING_ACCESS_TOKEN", "new-token")
    def handler(request):
        assert request.headers["Authorization"] == "Bearer new-token"
        assert request.extensions["timeout"]["read"] == 7
        return httpx.Response(200, json={"accounts": []})
    with httpx.Client(transport=httpx.MockTransport(handler), timeout=7) as http:
        with StarlingClient(httpx_client=http) as client:
            client.accounts.list()
        assert not http.is_closed
    with StarlingClient() as client:
        pass
    assert client._http.is_closed


async def test_async_cancellation_interrupts_retry_wait():
    requests = []
    event = asyncio.Event()
    def handler(request):
        requests.append(request)
        event.set()
        return httpx.Response(429, json={}, headers={"Retry-After": "60"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncStarlingClient(access_token="token", httpx_client=http) as client:
            task = asyncio.create_task(client.accounts.list())
            await asyncio.wait_for(event.wait(), timeout=1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, timeout=1)
    assert len(requests) == 1
