# Migrating from starling-developer-sdk

The [original JavaScript SDK](https://github.com/starlingbank/starling-developer-sdk)
is archived. This package uses named exports, grouped resource methods and typed
response bodies. It is not a drop-in replacement.

```typescript
import { StarlingClient, StarlingEnvironment } from "@mmzaini/starling-sdk";

const client = new StarlingClient({
  accessToken: process.env.STARLING_ACCESS_TOKEN,
  environment: StarlingEnvironment.Sandbox,
});
const { accounts } = await client.accounts.list();
```

| Original SDK | New SDK |
| --- | --- |
| Default `Starling` export | Named `StarlingClient` export |
| `apiUrl` | `environment`, or `baseUrl` for an HTTPS proxy origin |
| `client.account.getAccounts()` | `client.accounts.list()` |
| Axios `{ data }` response envelope | Typed response body directly |
| Axios response metadata | `.withRawResponse()` for status and headers |
| OAuth methods on the API client | Separate `StarlingOAuth` helper |

Select production explicitly when migrating live code: this SDK defaults to the
sandbox. Account/path parameters are named request properties; for example,
`client.accounts.getBalance({ accountUid })`. See the complete
[endpoint map](naming-map.md) for resource and method names.

Use `StarlingError` instead of inspecting Axios error fields. Configure signing
for the operations that require it. OAuth requests use form-encoded bodies, and
token refresh returns both replacement tokens without storing them for you.

Writes never retry automatically. Review payment identifiers and outcome recovery
before replacing existing payment code. Amounts remain integer minor units; field
names on the TypeScript wire models remain Starling's names.

Python is a separate package: `pip install starling-bank-sdk`, then
`from starling_bank import StarlingClient`. Its resource methods and model fields
use snake_case.
