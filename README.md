# Starling SDKs

Typed TypeScript and Python clients for the [Starling Public API](https://developer.starlingbank.com/docs),
generated from Starling's official OpenAPI specification with [Fern](https://github.com/fern-api/fern).

[![CI](https://github.com/MMZaini/starling-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/MMZaini/starling-sdk/actions/workflows/ci.yml)

| Package | Install | Docs |
| --- | --- | --- |
| [TypeScript / JavaScript](https://www.npmjs.com/package/@mmzaini/starling-sdk) · Node 22+ | `npm install @mmzaini/starling-sdk` | [TypeScript SDK](sdks/typescript/README.md) |
| [Python](https://pypi.org/project/starling-bank-sdk/) 3.11+ | `pip install starling-bank-sdk` | [Python SDK](sdks/python/README.md) |
| [Optional React components](https://www.npmjs.com/package/@mmzaini/starling-react) · React 18/19 | `npm install @mmzaini/starling-react` | [React package](packages/react/README.md) |

Community maintained and not affiliated with Starling Bank. Both SDKs default to the sandbox.

[Release notes and downloads](https://github.com/MMZaini/starling-sdk/releases).

## Quick start

Create a sandbox account and access token in the [developer portal](https://developer.starlingbank.com/).
Set `STARLING_ACCESS_TOKEN` to that token. Account and balance reads need the corresponding scopes.

```typescript
import { StarlingClient } from "@mmzaini/starling-sdk";

const client = new StarlingClient(); // Reads STARLING_ACCESS_TOKEN; sandbox by default.
const { accounts } = await client.accounts.list();
const account = accounts?.[0];
if (!account?.accountUid) throw new Error("No account available");

const balance = await client.accounts.getBalance({ accountUid: account.accountUid });
console.log(balance.effectiveBalance);
```

```python
from starling_bank import StarlingClient

with StarlingClient() as client:  # Reads STARLING_ACCESS_TOKEN; sandbox by default.
    accounts = client.accounts.list().accounts or []
    if not accounts or not accounts[0].account_uid:
        raise ValueError("No account available")
    balance = client.accounts.get_balance(account_uid=accounts[0].account_uid)
    print(balance.effective_balance)
```

For a personal access token or approved live application, select
`StarlingEnvironment.Production` / `StarlingEnvironment.PRODUCTION` explicitly.
Keep tokens on your server. See [authentication](docs/authentication.md) for OAuth,
token rotation and production client certificates.

## Coverage

- All 87 documented Public API operations, with consistent resource names across languages.
- Bearer tokens, explicit OAuth exchange/refresh, and RSA-SHA512 request signing.
- Lazy feed iterators, binary uploads/downloads and raw response metadata.
- V2 webhook signature verification.
- TypeScript: ESM and CommonJS, typed models and no runtime package dependencies.
- Python: sync/async clients, Pydantic models, context managers and `py.typed`.
- React: display-only account cards, masked identifiers and exact money formatting.

Methods require the appropriate token scopes and Starling permissions. Payments,
standing-order changes, email updates and address updates also require
[request signing](docs/signing-and-webhooks.md). Write requests are never retried
automatically. See [API details](docs/api-gotchas.md) before using writes or pagination.

## Documentation

- [Endpoint and naming map](docs/naming-map.md)
- [Authentication and token rotation](docs/authentication.md)
- [Signing and V2 webhooks](docs/signing-and-webhooks.md)
- [Money, pagination, errors and files](docs/api-gotchas.md)
- [Migrating from the archived SDK](docs/migration.md)
- [Generation](docs/how-it-works.md), [maintenance](docs/maintaining.md), [testing](docs/testing.md) and [releases](docs/releasing.md)

## Development

The upstream spec stays unchanged in `openapi/starling.json`. Fern overrides define
names and API corrections once for both languages. Custom authentication and
transport helpers live outside generated code.

```sh
npm ci
npm --prefix sdks/typescript ci
npm --prefix packages/react ci
python -m pip install -e 'sdks/python[dev]'
npm run generate                          # Requires Docker.
```

See [testing](docs/testing.md) for unit, browser, package-install and sandbox checks.
The repository structure follows [zaini/trading212-sdk](https://github.com/zaini/trading212-sdk).
