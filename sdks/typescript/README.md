# Starling TypeScript SDK

Unofficial typed client for the Starling Bank Public API. Supports Node.js 22+, ESM and CommonJS.

```sh
npm install @mmzaini/starling-sdk
```

```ts
import { StarlingClient, StarlingEnvironment } from "@mmzaini/starling-sdk";

const client = new StarlingClient({
  accessToken: process.env.STARLING_ACCESS_TOKEN,
  environment: StarlingEnvironment.Sandbox,
});

const { accounts } = await client.accounts.list();
const account = accounts?.[0];
if (!account?.accountUid) throw new Error("No account available");
const balance = await client.accounts.getBalance({ accountUid: account.accountUid });
console.log(balance.effectiveBalance);
```

Sandbox is the default. Choose `StarlingEnvironment.Production` explicitly for a personal token or live application.

Omit `accessToken` to read `STARLING_ACCESS_TOKEN`, or pass a supplier such as
`accessToken: () => tokenStore.accessToken` for tokens managed by your application.
The SDK runs on the server; use the separate React package to display data in a browser.

## Pagination and errors

```typescript
import { iterateFeed, StarlingError } from "@mmzaini/starling-sdk";

if (!account.defaultCategory) throw new Error("No default category available");
try {
  for await (const item of iterateFeed(client, {
    accountUid: account.accountUid,
    categoryUid: account.defaultCategory,
    minTransactionTimestamp: "2026-01-01T00:00:00Z",
    maxTransactionTimestamp: "2026-02-01T00:00:00Z",
  })) {
    console.log(item.feedItemUid);
  }
} catch (error) {
  if (error instanceof StarlingError) console.error(error.statusCode);
  else throw error;
}
```

Reads default to two retries; writes are sent once. `timeoutInSeconds` defaults to
60 and covers retries and buffered responses. Pass `abortSignal` per request to
cancel. Inspect `StarlingError.statusCode`, `.body` and `.rawResponse` for failures;
avoid logging credentials or entire banking responses.

```typescript
const response = await client.accounts.list().withRawResponse();
console.log(response.rawResponse.status);
```

## Authentication and signing

Use `StarlingOAuth` for code exchange and refresh. Refresh rotates both tokens;
persist them together. Production OAuth needs a client certificate. Signed API
operations use an optional `signing: { keyId, privateKey }` client option with a
registered RSA API key. These are separate credentials.

- [Authentication](https://github.com/MMZaini/starling-sdk/blob/main/docs/authentication.md)
- [Signing and webhook verification](https://github.com/MMZaini/starling-sdk/blob/main/docs/signing-and-webhooks.md)
- [Endpoint map](https://github.com/MMZaini/starling-sdk/blob/main/docs/naming-map.md)
- [Amounts, files and API behavior](https://github.com/MMZaini/starling-sdk/blob/main/docs/api-gotchas.md)

Types and enum values are available through the `Starling` namespace. CommonJS is
also supported: `const { StarlingClient } = require("@mmzaini/starling-sdk")`.

Generated from Starling's OpenAPI spec with Fern. [Source and maintenance](https://github.com/MMZaini/starling-sdk).
