# Starling React

Display account details and balances with React 18 or 19. This optional package
contains no API client, authentication or network requests.

```sh
npm install @mmzaini/starling-react
```

```tsx
import { AccountCard } from "@mmzaini/starling-react";
import "@mmzaini/starling-react/styles.css";

<AccountCard account={account} balance={balance} identifiers={identifiers} />;
```

The props accept the data returned by the SDK's `accounts.list()`,
`accounts.getBalance({ accountUid })` and `accounts.getIdentifiers({ accountUid })`.
Fetch that data on your server and pass only the authorized display data to the
browser. The package also works with equivalent JSON from a Python backend.

Identifiers are masked by default. Set `masked={false}` to reveal them, or control
that prop from your own button. Visual masking is not access control: the full
values are still in your application's memory. `hideBalance` hides the balance too.
`status="loading"` and `status="error"` provide accessible states.

Use `AccountDetails` and `Balance` separately for custom layouts:

```tsx
import { AccountDetails, Balance } from "@mmzaini/starling-react";

<Balance amount={{ currency: "GBP", minorUnits: 12345 }} label="Available" />;
<AccountDetails identifiers={identifiers} masked />;
```

`formatMoney({ currency, minorUnits }, locale)` formats integer minor units without
floating-point division. It supports currency fraction digits, negative values and
localized output. Unsafe integers are rejected; missing or invalid component amounts
display an unavailable state. The default locale is `en-GB`, including during SSR.

Styles are optional. Import the stylesheet once, or use the `starling-*` classes
with your own CSS. `AccountCard` accepts `className`, `style`, `title` and footer
`children`. It displays the effective balance and does not include balances in
spaces. The components work with SSR and have no dependency on the TypeScript SDK.

Run the example from this directory with `npm ci && npm run dev`. It uses dummy
data and demonstrates masked details, loading and error states.

Community maintained; not an official Starling Bank package. [SDK repository](https://github.com/MMZaini/starling-sdk).
