"""Check an installed distribution outside the source checkout and editable environment."""

import asyncio
import importlib.metadata

import httpx

from starling_bank import AsyncStarlingClient, StarlingClient, create_oauth_state


def handler(request):
    assert request.headers["Authorization"] == "Bearer fixture"
    return httpx.Response(200, json={"accounts": []})


assert importlib.metadata.version("starling-bank-sdk")
assert len(create_oauth_state()) == 43
with httpx.Client(transport=httpx.MockTransport(handler)) as http:
    with StarlingClient(access_token="fixture", httpx_client=http) as client:
        assert client.accounts.list().accounts == []


async def check_async():
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncStarlingClient(access_token="fixture", httpx_client=http) as client:
            assert (await client.accounts.list()).accounts == []


asyncio.run(check_async())
print("Installed Python distribution passed synchronous and asynchronous request checks.")
