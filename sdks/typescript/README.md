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
const balance = await client.accounts.getBalance({ accountUid: accounts[0].accountUid });
```

Sandbox is the default. Choose `StarlingEnvironment.Production` explicitly for a personal token or live application.

See the [endpoint map](https://github.com/MMZaini/starling-sdk/blob/main/docs/naming-map.md) for available methods.
