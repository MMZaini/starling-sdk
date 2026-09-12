import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { StarlingClient, StarlingEnvironment, StarlingError } from "../src/index.js";

test("uses sandbox bearer auth and returns raw response metadata", async () => {
  const client = new StarlingClient({ accessToken: "test-token", fetch: async (input, init) => {
    assert.equal(String(input), "https://api-sandbox.starlingbank.com/api/v2/accounts");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
    return Response.json({ accounts: [{ accountUid: "account-1", currency: "GBP" }] }, { headers: { "X-Request-Id": "request-1" } });
  }});
  const response = await client.accounts.list().withRawResponse();
  assert.equal(response.data.accounts?.[0].accountUid, "account-1");
  assert.equal(response.rawResponse.headers.get("X-Request-Id"), "request-1");
});

test("encodes path values and retains minor-unit amounts without retrying writes", async () => {
  let requests = 0;
  const client = new StarlingClient({ accessToken: "test-token", maxRetries: 4, fetch: async (input, init) => {
    requests++;
    assert.equal(String(input), "https://api-sandbox.starlingbank.com/api/v2/account/a%2Fb/savings-goals");
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), { name: "Holiday", currency: "GBP", target: { currency: "GBP", minorUnits: 12345 } });
    return Response.json({ errors: [{ message: "temporarily unavailable" }] }, { status: 503 });
  }});
  await assert.rejects(client.savingsGoals.create({ accountUid: "a/b", name: "Holiday", currency: "GBP", target: { currency: "GBP", minorUnits: 12345 } }, { maxRetries: 5 }), (error: unknown) => error instanceof StarlingError && error.statusCode === 503);
  assert.equal(requests, 1);
});

test("preserves API error details", async () => {
  const body = { errors: [{ message: "Required scope missing" }], success: false };
  const client = new StarlingClient({ accessToken: "test-token", environment: StarlingEnvironment.Production, fetch: async (input) => {
    assert(String(input).startsWith("https://api.starlingbank.com/"));
    return Response.json(body, { status: 403 });
  }});
  await assert.rejects(client.accounts.list(), (error: unknown) => {
    assert(error instanceof StarlingError);
    assert.equal(error.statusCode, 403);
    assert.deepEqual(error.body, body);
    return true;
  });
});

test("every upstream operation has a generated callable method", () => {
  const operations = JSON.parse(readFileSync(new URL("../../../openapi/operations.json", import.meta.url), "utf8"));
  const client = new StarlingClient({ accessToken: "test-token" });
  for (const { group, name } of operations) {
    assert.equal(typeof (client as any)[group][name], "function", `${group}.${name}`);
  }
});

test("uploads raw attachment bytes with the supplied media type", async () => {
  const bytes = Uint8Array.from([0, 255, 10, 34]);
  const client = new StarlingClient({ accessToken: "test-token", fetch: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await request.arrayBuffer()), bytes);
    return Response.json("attachment-1");
  }});
  assert.equal(await client.feed.uploadAttachment(new Blob([bytes], { type: "image/png" }), "account", "category", "feed-item"), "attachment-1");
});
