# Working with the API

## Money and accounts

Amounts are integer minor units: GBP 12.34 is `{ currency: "GBP", minorUnits: 1234 }`.
Do not calculate payment amounts by multiplying a floating-point value by 100.
TypeScript rejects fractions and values outside `Number.MAX_SAFE_INTEGER` on
writes. Python rejects fractional and boolean minor units. Neither client converts
currencies or validates an account's available funds locally.

Response fields follow the upstream schema and can be optional. Check that an
account has `accountUid` and `defaultCategory` (`account_uid`, `default_category`
in Python) before using them. The default category identifies the main account
balance; a space's category identifies that space. `effectiveBalance` includes
pending outgoing transactions; `clearedBalance` represents settled transactions.

## Feed pagination

```typescript
import { iterateFeed } from "@mmzaini/starling-sdk";

for await (const item of iterateFeed(client, {
  accountUid,
  categoryUid,
  minTransactionTimestamp: "2026-01-01T00:00:00Z",
  maxTransactionTimestamp: "2026-02-01T00:00:00Z",
})) {
  // Process one item; break to stop without fetching another page.
}
```

```python
from datetime import datetime, timezone
from starling_bank import iter_feed

for item in iter_feed(
    client,
    account_uid=account_uid,
    category_uid=category_uid,
    min_transaction_timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    max_transaction_timestamp=datetime(2026, 2, 1, tzinfo=timezone.utc),
):
    pass  # Process one item.
```

Use `async_iter_feed` with `AsyncStarlingClient` for `async for`. The helpers use
`feed.listPage` / `feed.list_page` and follow the API's `links.next`. They preserve
the account and date range, reject unexpected links and repeated cursors, and
load only one page at a time. An explicit `maxPages` / `max_pages` limit stops
after that many pages; omit it to consume the complete range.

The non-paginated feed endpoints can be capped and have one-year date restrictions.
Use the paginated endpoint for complete histories, subject to token scopes and
consent restrictions. Iteration does not create a snapshot or deduplicate feed
items. For synchronization, persist items by their identifier and reconcile updates.

## Errors, retries and timeouts

TypeScript throws `StarlingError` with `statusCode`, `body` and `rawResponse`.
Python throws `ApiError` with `status_code` and `body`; HTTPX transport exceptions
remain available for connection/timeout handling. Malformed JSON and 3xx responses
are errors. Neither public client follows redirects.

Reads default to up to two retries. TypeScript retries HTTP 408, 429 and 5xx;
Python's generated transport also retries 409 and selected connection failures.
Write endpoints, including PUT and DELETE, never retry automatically. OAuth
exchange and refresh also send only one request. A 401 does not trigger refresh
or replay; a 403 may indicate scopes, consent or application approval.

TypeScript's `timeoutInSeconds` defaults to 60 and covers retries and buffered
response reads. `abortSignal` cancels requests and retry waits. Streaming downloads
return before their body is consumed; keep an abort signal alive while reading and
cancel the stream if you stop early. Python uses HTTPX's per-operation timeouts,
defaults to 60 seconds, and preserves a supplied HTTP client's timeout when no SDK
timeout is set. Cancel an asyncio task to stop asynchronous work. Close a partially
consumed synchronous download iterator explicitly, for example with
`contextlib.closing`.

Starling supplies `Retry-After` when rate limiting. TypeScript respects it within
the request deadline. Python's pinned generator caps its retry delay at 60 seconds;
set `max_retries=0` and schedule requests yourself if you need longer waits.

## Files and raw responses

Attachment uploads are **raw bytes**, not multipart forms or JSON. Set the actual
media type. TypeScript accepts a `Blob`:

```typescript
import { getUploadedAttachmentUid } from "@mmzaini/starling-sdk";

const upload = await client.feed.uploadAttachment(
  new Blob([bytes], { type: "image/png" }), accountUid, categoryUid, feedItemUid,
).withRawResponse();
const attachmentUid = getUploadedAttachmentUid(upload);
```

```python
from starling_bank import get_uploaded_attachment_uid

upload = client.feed.with_raw_response.upload_attachment(
    account_uid=account_uid, category_uid=category_uid, feed_item_uid=feed_item_uid,
    request=png_bytes,
    request_options={"additional_headers": {"Content-Type": "image/png"}},
)
attachment_uid = get_uploaded_attachment_uid(upload)
```

The upstream spec describes a 200 response with a JSON UUID. The sandbox also
returns an empty 202 response with a `Location` header. The overrides allow an
absent response body, and these helpers extract the UUID from either response
without following the URL. An accepted upload may still be processing.

TypeScript downloads provide `.arrayBuffer()`, `.blob()` and `.stream()`; Python
downloads yield byte chunks. Consume or close them. Large downloads are better
streamed than collected into one buffer.

Use `await client.accounts.list().withRawResponse()` in TypeScript, or
`client.accounts.with_raw_response.list()` in Python, to retain response headers
and status. Default SDK logging is silent. Debug logging redacts authorization
headers, but treat application logs and API error bodies as potentially sensitive.

See the [endpoint map](naming-map.md), [authentication](authentication.md) and
[request signing](signing-and-webhooks.md) for method names and setup.
