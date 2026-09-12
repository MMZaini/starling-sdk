import assert from "node:assert/strict";
import test from "node:test";
import { StarlingClient, StarlingError, StarlingTimeoutError } from "../src/index.js";

test("treats invalid JSON and redirects as errors while preserving status and raw metadata", async () => {
  for (const status of [200, 302]) {
    const client = new StarlingClient({ accessToken: "token", fetch: async (_, init) => {
      assert.equal(init?.redirect, "manual");
      return new Response("not json", { status, headers: { Location: "https://unexpected.example/", "X-Request-Id": "123" } });
    }});
    await assert.rejects(client.accounts.list(), (error: unknown) => {
      assert(error instanceof StarlingError);
      assert.equal(error.statusCode, status);
      assert.equal(error.body, "not json");
      assert.equal(error.rawResponse?.headers.get("X-Request-Id"), "123");
      return true;
    });
  }
});

test("rejects fractional and unsafe amounts before sending", async () => {
  const client = new StarlingClient({ accessToken: "token", fetch: async () => { throw new Error("must not send"); } });
  for (const minorUnits of [1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    await assert.rejects(client.savingsGoals.create({ accountUid: "account", name: "Goal", currency: "GBP", target: { currency: "GBP", minorUnits } }), RangeError);
  }
});

test("retries read-only rate limits and uses the latest token on the next call", async () => {
  let attempts = 0;
  let token = "initial";
  const client = new StarlingClient({ accessToken: () => token, fetch: async (_, init) => {
    attempts++;
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    return attempts === 1 ? Response.json({}, { status: 429, headers: { "Retry-After": "0" } }) : Response.json({ accounts: [] });
  }});
  await client.accounts.list();
  assert.equal(attempts, 2);
  token = "replacement";
  await client.accounts.list();
  assert.equal(attempts, 3);
});

test("cancellation interrupts Retry-After and prevents a second attempt", { timeout: 1000 }, async () => {
  const abort = new AbortController();
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "token", fetch: async () => {
    attempts++;
    setTimeout(() => abort.abort(), 20);
    return Response.json({}, { status: 429, headers: { "Retry-After": "120" } });
  }});
  await assert.rejects(client.accounts.list({ abortSignal: abort.signal }), (error: unknown) => error instanceof StarlingError && /aborted/.test(error.message));
  assert.equal(attempts, 1);
});

test("the deadline covers a stalled response body", { timeout: 1000 }, async () => {
  const client = new StarlingClient({ accessToken: "token", timeoutInSeconds: 0.03, fetch: async (_, init) => {
    return new Response(new ReadableStream({ start(controller) {
      init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true });
      controller.enqueue(new TextEncoder().encode('{"accounts":'));
    }}), { headers: { "Content-Type": "application/json" } });
  }});
  await assert.rejects(client.accounts.list(), StarlingTimeoutError);
});

test("the deadline stops retries without ignoring long Retry-After values", { timeout: 1000 }, async () => {
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "token", timeoutInSeconds: 0.03, fetch: async () => {
    attempts++;
    return Response.json({}, { status: 429, headers: { "Retry-After": "120" } });
  }});
  await assert.rejects(client.accounts.list(), StarlingTimeoutError);
  assert.equal(attempts, 1);
});
