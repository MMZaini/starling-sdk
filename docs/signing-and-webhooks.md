# Signing and webhooks

## Signed API requests

Six Public API operations require a signature in addition to the access token:
updating email, updating addresses, creating/updating/cancelling standing orders,
and creating payments. The SDK derives this requirement from the OpenAPI spec and
rejects calls to those operations if signing is not configured.

Register an RSA public API key in the developer portal for the environment you
are using. Supply the matching private key and the **API key UUID** to the SDK.
The rotation key is for registering replacement API keys. It is not used for
ordinary API requests. OAuth client certificates are also separate.

```typescript
import { readFileSync } from "node:fs";
import { StarlingClient } from "@mmzaini/starling-sdk";

const client = new StarlingClient({
  accessToken: process.env.STARLING_ACCESS_TOKEN,
  signing: {
    keyId: process.env.STARLING_API_KEY_UID!,
    privateKey: readFileSync(process.env.STARLING_API_PRIVATE_KEY_PATH!),
  },
});
```

```sh
pip install 'starling-bank-sdk[signing]'
```

```python
import os
from pathlib import Path
from starling_bank import RequestSigner, StarlingClient

signer = RequestSigner(
    key_id=os.environ["STARLING_API_KEY_UID"],
    private_key=Path(os.environ["STARLING_API_PRIVATE_KEY_PATH"]).read_bytes(),
)
client = StarlingClient(access_token=os.environ["STARLING_ACCESS_TOKEN"], signing=signer)
```

Both implementations support RSA-SHA512 with 2048- or 4096-bit RSA keys, including
encrypted PEM keys via `passphrase` (bytes in Python). TypeScript also accepts a
Node `KeyObject`. ECDSA and eIDAS signing are not implemented in this release.

The SDK signs the final encoded path and exact request bytes, includes ISO `Date`
and SHA-512 `Digest` headers, and uses Starling's `X` digest for a bodyless request.
Keep the server clock synchronized: Starling requires signed requests to arrive
within five seconds of their timestamp. Keys are loaded when the client/signer is
constructed; construct a new instance after rotating keys.

Write requests are sent once, even if `maxRetries` is set. Keep a payment's
`externalIdentifier` stable when reconciling an uncertain outcome. Check the
payment's status before deciding whether to resubmit. A returned payment order
does not by itself mean the payment has settled.

The SDK uses the public API's signing contract described in [Starling's docs](https://developer.starlingbank.com/docs)
and [official signing examples](https://github.com/starlingbank/api-samples/tree/master/public-api-examples/message-signing).

## V2 webhook verification

Use the webhook's public key from the portal, not your API signing public key.
Verify the original bytes before parsing JSON:

```typescript
import { verifyWebhookSignature } from "@mmzaini/starling-sdk";

if (!verifyWebhookSignature(rawBody, hookSignature, webhookPublicKey)) {
  throw new Error("Invalid webhook signature");
}
const event = JSON.parse(rawBody.toString("utf8"));
```

```python
import json
from starling_bank import verify_webhook_signature

if not verify_webhook_signature(raw_body, hook_signature, webhook_public_key):
    raise ValueError("Invalid webhook signature")
event = json.loads(raw_body)
```

`hookSignature` / `hook_signature` is the `X-Hook-Signature` header. Capture a raw
`Buffer` in Node or `bytes` in Python before your framework's JSON parser runs.
Whitespace and Unicode re-encoding change the signature. Missing, malformed or
mismatched signatures return `false` / `False`; an invalid public key raises
`SigningError`.

This helper verifies V2 RSA-SHA512 signatures. It does not implement V1 shared-secret
webhooks, provide a webhook server, or prevent replay. Deduplicate events, apply
your application's event-age policy, and acknowledge accepted events promptly
before processing them asynchronously. Starling retries deliveries when a 2xx
response is not received within two seconds. See the [V2 webhook documentation](https://developer.starlingbank.com/docs)
for payload schemas and delivery behavior.
