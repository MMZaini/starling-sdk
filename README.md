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

## React component preview

[Open the interactive preview](https://mmzaini.github.io/starling-sdk/) to try
`AccountCard`, `Balance`, `AccountDetails`, and `formatMoney`. It includes live prop
controls, state examples, and copyable code, using fictional data without API credentials.

The showcase lives in [`packages/react/example`](packages/react/example) and is
deployed separately from the SDK packages. See the [React README](packages/react/README.md#component-preview)
for local development and production preview commands.

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

## Why another SDK

Starling [archived its JavaScript SDK](https://github.com/starlingbank/starling-developer-sdk)
on 10 September 2026, leaving it read-only and no longer maintained. A few friends
and I needed a Starling SDK for projects we were working on, so I built this one.
Both clients are generated from Starling's official OpenAPI spec with Fern, which
keeps ordinary API updates to a spec update and regeneration. The structure follows
my friend's [Trading 212 SDK](https://github.com/zaini/trading212-sdk).

A daily workflow regenerates, tests, merges and publishes compatible spec updates.
Changes that cannot be classified safely open a PR for review. See
[automatic updates](docs/maintaining.md#automatic-updates) for the exact policy.

## Repository layout

```text
openapi/          Starling's unmodified spec, source checksum and endpoint metadata
fern/             Pinned generators and overrides for names, auth and API corrections
scripts/          Spec updates, generation, package checks and release tooling
sdks/typescript/  Generated client, TypeScript helpers, package metadata and tests
sdks/python/      Generated client, Python helpers, package metadata and tests
packages/react/   Optional account components, styles, examples and browser tests
tests/            Shared fixtures, automation checks and the local mutual-TLS server
docs/             Authentication, API details, naming map, maintenance and releases
.github/          CI, spec-update and publishing workflows
```

## Development

Requires Node 22+, Python 3.11+ and Docker for generation. From the repository root:

```sh
npm ci
npm --prefix sdks/typescript ci
npm --prefix packages/react ci
python -m pip install -e 'sdks/python[dev]'
npm run generate                          # Requires Docker.
npm --prefix sdks/typescript test
python -m pytest sdks/python/tests
npm --prefix packages/react test
```

See [testing](docs/testing.md) for unit, browser, package-install and sandbox checks.
Sandbox checks are opt-in; ordinary tests need no bank credentials.

## Contributing

Issues and pull requests are welcome, especially:

- Unexpected API behavior, with a small reproduction and redacted request/response details.
- Spec updates, missing types and corrections to endpoint names.
- Improvements to authentication helpers, components, documentation and examples.

Keep credentials and account details out of issues and commits. Generated files
come from the spec and overrides; fixes usually belong there or in the helpers
outside `generated/`. [CONTRIBUTING.md](CONTRIBUTING.md) explains where changes go
and which checks to run.

## License

[MIT](LICENSE).
