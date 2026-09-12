# Starling Python SDK

Unofficial typed client for the Starling Bank Public API. Supports Python 3.11+, synchronous and asynchronous usage.

```sh
pip install starling-bank-sdk
```

```python
import os
from starling_bank import StarlingClient, StarlingEnvironment

client = StarlingClient(
    access_token=os.environ["STARLING_ACCESS_TOKEN"],
    environment=StarlingEnvironment.SANDBOX,
)
accounts = client.accounts.list().accounts
balance = client.accounts.get_balance(account_uid=accounts[0].account_uid)
```

Use `AsyncStarlingClient` and await calls in asynchronous applications. Sandbox is the default; choose `StarlingEnvironment.PRODUCTION` explicitly for live access.

See the [endpoint map](https://github.com/MMZaini/starling-sdk/blob/main/docs/naming-map.md) for available methods.
