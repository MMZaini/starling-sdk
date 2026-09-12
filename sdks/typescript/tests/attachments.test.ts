import assert from "node:assert/strict";
import test from "node:test";
import { getUploadedAttachmentUid, StarlingClient, StarlingError } from "../src/index.js";

const uid = "11111111-1111-4111-8111-111111111111";

test("handles an empty 202 upload through Location and preserves the response", async () => {
  const location = `/api/v2/feed/account/account/category/category/item/attachments/${uid}`;
  const client = new StarlingClient({ accessToken: "token", fetch: async () => new Response(null, { status: 202, headers: { Location: location } }) });
  const result = await client.feed.uploadAttachment(new Blob(["bytes"]), "account", "category", "item").withRawResponse();
  assert.equal(result.data, null);
  assert.equal(result.rawResponse.status, 202);
  assert.equal(result.rawResponse.headers.get("Location"), location);
  assert.equal(getUploadedAttachmentUid(result), uid);
});

test("handles an upload UUID in a 200 JSON body", async () => {
  const client = new StarlingClient({ accessToken: "token", fetch: async () => Response.json(uid) });
  const result = await client.feed.uploadAttachment(new Blob(["bytes"]), "account", "category", "item").withRawResponse();
  assert.equal(getUploadedAttachmentUid(result), uid);
});

test("does not treat empty upload errors as successful responses", async () => {
  for (const status of [400, 401, 500]) {
    const client = new StarlingClient({ accessToken: "token", fetch: async () => new Response(null, { status }) });
    await assert.rejects(client.feed.uploadAttachment(new Blob(["bytes"]), "account", "category", "item"), (error: unknown) => error instanceof StarlingError && error.statusCode === status);
  }
});
