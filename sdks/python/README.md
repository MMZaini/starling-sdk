# Starling Python SDK

Unofficial typed client for the Starling Bank Public API. Supports Python 3.11+, synchronous and asynchronous usage.

```sh
pip install starling-bank-sdk
```

```python
import os
from starling_bank import StarlingClient, StarlingEnvironment

with StarlingClient(
    access_token=os.environ["STARLING_ACCESS_TOKEN"],
    environment=StarlingEnvironment.SANDBOX,
) as client:
    accounts = client.accounts.list().accounts or []
    if not accounts or not accounts[0].account_uid:
        raise ValueError("No account available")
    balance = client.accounts.get_balance(account_uid=accounts[0].account_uid)
    print(balance.effective_balance)
```

Omit `access_token` to read `STARLING_ACCESS_TOKEN` at construction, or pass a
callable for application-managed tokens. Sandbox is the default; choose
`StarlingEnvironment.PRODUCTION` explicitly for live access.

## Async usage

```python
import asyncio
from starling_bank import AsyncStarlingClient

async def main():
    async with AsyncStarlingClient() as client:
        response = await client.accounts.list()
        print(len(response.accounts or []))

asyncio.run(main())
```

The clients close only HTTP clients they create. Close any supplied HTTPX client
yourself. Typed models use Python field names such as `account_uid`; serialize
with `model_dump(by_alias=True)` when you need Starling's wire names.

## Pagination and errors

Use `iter_feed(client, account_uid=..., category_uid=...,
min_transaction_timestamp=..., max_transaction_timestamp=...)` with timezone-aware
`datetime` values. It follows the paginated endpoint's next links one page at a
time. Use `async_iter_feed` with `async for` for the asynchronous client.

`ApiError` exposes `status_code`, `headers` and `body`. HTTPX connection and timeout
exceptions retain their types. Reads default to two retries; writes never retry
automatically. `timeout` defaults to 60 seconds using HTTPX's timeout model. A supplied
HTTPX client's timeout is retained when the SDK timeout is omitted.

```python
from starling_bank import ApiError

with StarlingClient() as client:
    try:
        result = client.accounts.with_raw_response.list()
        print(result.status_code)
    except ApiError as error:
        print(error.status_code)
```

## Authentication and signing

`StarlingOAuth` and `AsyncStarlingOAuth` handle code exchange and refresh. Refresh
rotates both tokens; persist them together. Production OAuth requires a client
certificate. Install the optional cryptography dependency for request signing and
V2 webhook verification:

```sh
pip install 'starling-bank-sdk[signing]'
```

Pass `signing=RequestSigner(key_id=..., private_key=...)` for signed operations.

- [Authentication](https://github.com/MMZaini/starling-sdk/blob/main/docs/authentication.md)
- [Signing and webhook verification](https://github.com/MMZaini/starling-sdk/blob/main/docs/signing-and-webhooks.md)
- [Amounts, pagination and files](https://github.com/MMZaini/starling-sdk/blob/main/docs/api-gotchas.md)

See the [endpoint map](https://github.com/MMZaini/starling-sdk/blob/main/docs/naming-map.md) for available methods.

Generated from Starling's OpenAPI spec with Fern. [Source and maintenance](https://github.com/MMZaini/starling-sdk).
