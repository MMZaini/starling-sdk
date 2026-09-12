# Authentication

Use a personal access token for your own account, a sandbox token for development,
or OAuth for an application that connects customers' accounts. Tokens and OAuth
secrets belong on your server. The SDK defaults to the sandbox; choose production
explicitly.

## Access tokens

```typescript
import { StarlingClient, StarlingEnvironment } from "@mmzaini/starling-sdk";

const client = new StarlingClient({
  accessToken: process.env.STARLING_ACCESS_TOKEN,
  environment: StarlingEnvironment.Sandbox,
});
const accounts = await client.accounts.list();
```

```python
import os
from starling_bank import StarlingClient, StarlingEnvironment

client = StarlingClient(
    access_token=os.environ["STARLING_ACCESS_TOKEN"],
    environment=StarlingEnvironment.SANDBOX,
)
accounts = client.accounts.list()
```

Permissions depend on the token's scopes and the application's approval. An SDK
method being available does not grant permission to call it. Personal access
tokens do not use OAuth refresh. See Starling's [API access documentation](https://developer.starlingbank.com/docs).

## OAuth

Register an application and its exact redirect URI in the developer portal. Generate
a fresh state for each authorization attempt, store it in the initiating user's
server-side session, and validate it once in the callback before exchanging the code.
Reject missing or mismatched state. Do not accept a state copied from the callback
as the expected value.

```typescript
import { StarlingOAuth, createOAuthState, validateOAuthState } from "@mmzaini/starling-sdk";

const oauth = new StarlingOAuth({
  clientId: process.env.STARLING_CLIENT_ID!,
  clientSecret: process.env.STARLING_CLIENT_SECRET!,
  redirectUri: "https://your-app.example/oauth/callback",
});

const state = createOAuthState(); // Store in the user's session before redirecting.
const url = oauth.getAuthorizationUrl({ state });

// In the callback, using state retrieved from that same session:
if (!validateOAuthState(state, callbackState)) throw new Error("Invalid OAuth state");
const tokens = await oauth.exchangeCode(callbackCode);
// Persist tokens.accessToken, tokens.refreshToken and tokens.expiresAt securely.
```

`callbackState` and `callbackCode` above are the callback query values, validated by
your application. Handle the callback's `error` parameter and consume the session
state even when authorization fails.

```python
from starling_bank import StarlingOAuth, create_oauth_state, validate_oauth_state

with StarlingOAuth(
    client_id=os.environ["STARLING_CLIENT_ID"],
    client_secret=os.environ["STARLING_CLIENT_SECRET"],
    redirect_uri="https://your-app.example/oauth/callback",
) as oauth:
    state = create_oauth_state()  # Store in the user's session before redirecting.
    url = oauth.get_authorization_url(state=state)
    # Later, in the callback, with state retrieved from the same session:
    if not validate_oauth_state(state, callback_state):
        raise ValueError("Invalid OAuth state")
    tokens = oauth.exchange_code(callback_code)
```

Python also provides `AsyncStarlingOAuth`, with `async with` and awaited token
methods. TypeScript token methods accept `{ signal }` for cancellation. Both helpers
use form-encoded POST bodies, a 30-second default timeout, and no automatic retries.
`OAuthError` exposes `code` and `statusCode` (`status_code` in Python), without the
server's potentially sensitive error description or request credentials.

## Refresh and persistence

OAuth access tokens expire. Refresh explicitly before expiry, using `expiresAt`
(`expires_at` in Python) with a small clock margin:

```typescript
const replacement = await oauth.refreshToken(storedRefreshToken);
```

```python
replacement = oauth.refresh_token(stored_refresh_token)
```

Refresh rotates **both** tokens. Save the new access token, refresh token and expiry
together before using them. Serialize refreshes per account connection across
workers; two concurrent refreshes can overwrite the newest token. The SDK neither
stores tokens nor refreshes automatically on a 401. If a refresh result is lost,
recover through your persistence/reconciliation procedure or reauthorize; do not
retry refresh indefinitely. A 403 usually needs a scope or consent change.

Clients accept a token supplier to read the current token on each API call:

```typescript
const client = new StarlingClient({ accessToken: () => tokenStore.accessToken });
```

```python
client = StarlingClient(access_token=lambda: token_store.access_token)
```

Each OAuth connection represents an account holder. Keep tokens associated with
the correct connection, particularly when a customer has different account types.

## Production certificates

Production OAuth token exchange requires mutual TLS: a client certificate and its
private key. These are separate from API request-signing keys and webhook keys.
Obtain and register the appropriate certificate through Starling's onboarding.

```typescript
import { readFileSync } from "node:fs";

const oauth = new StarlingOAuth({
  clientId: process.env.STARLING_CLIENT_ID!,
  clientSecret: process.env.STARLING_CLIENT_SECRET!,
  redirectUri: "https://your-app.example/oauth/callback",
  environment: StarlingEnvironment.Production,
  tls: {
    cert: readFileSync(process.env.STARLING_TLS_CERT_PATH!),
    key: readFileSync(process.env.STARLING_TLS_KEY_PATH!),
  },
});
```

```python
import ssl

tls = ssl.create_default_context()
tls.load_cert_chain(os.environ["STARLING_TLS_CERT_PATH"], os.environ["STARLING_TLS_KEY_PATH"])
oauth = StarlingOAuth(
    client_id=os.environ["STARLING_CLIENT_ID"],
    client_secret=os.environ["STARLING_CLIENT_SECRET"],
    redirect_uri="https://your-app.example/oauth/callback",
    environment=StarlingEnvironment.PRODUCTION,
    tls=tls,
)
```

The sandbox supports token exchange without a client certificate. Providing `tls`
selects its mutual-TLS endpoint. Production rejects missing certificate configuration
unless you supply a custom transport (TypeScript) or HTTP client (Python); in that
case you are responsible for configuring mutual TLS and certificate verification.
Python helpers close only HTTP clients they create. Close a supplied client yourself.

Never disable server certificate verification. See the current [Starling OAuth
documentation](https://developer.starlingbank.com/docs) for onboarding, supported
certificates and token lifetimes.
