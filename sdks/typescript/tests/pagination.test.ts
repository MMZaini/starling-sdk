import assert from "node:assert/strict";
import test from "node:test";
import { iterateFeed, PaginationError, StarlingClient } from "../src/index.js";

const request = { accountUid: "account", categoryUid: "category", minTransactionTimestamp: "2026-01-01T00:00:00Z", maxTransactionTimestamp: "2026-02-01T00:00:00Z" };
const path = "/api/v2/feed/account/account/category/category/paginated-transactions";
const next = `${path}?${new URLSearchParams({ minTransactionTimestamp: request.minTransactionTimestamp, maxTransactionTimestamp: request.maxTransactionTimestamp, cursor: "second", pageToFetch: "NEXT" })}`;
const page = (id: string, next?: string) => ({ feedItems: [{ feedItemUid: id }], links: { self: path, first: path, next } });
async function collect<T>(items: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const item of items) result.push(item); return result; }

test("follows next links lazily and retains the selected account and date range", async () => {
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "token", fetch: async (input) => {
    attempts++;
    const url = new URL(String(input));
    assert.equal(url.pathname, path);
    assert.equal(Date.parse(url.searchParams.get("minTransactionTimestamp")!), Date.parse(request.minTransactionTimestamp));
    if (attempts === 1) return Response.json(page("first", next));
    assert.equal(url.searchParams.get("cursor"), "second");
    assert.equal(url.searchParams.get("pageToFetch"), "NEXT");
    return Response.json(page("second"));
  }});
  const iterable = iterateFeed(client, request);
  assert.equal(attempts, 0);
  assert.deepEqual((await collect(iterable)).map(item => item.feedItemUid), ["first", "second"]);
  assert.equal(attempts, 2);
});

test("breaking iteration and explicit page limits avoid fetching unused pages", async () => {
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "token", fetch: async () => { attempts++; return Response.json(page("first", next)); } });
  for await (const item of iterateFeed(client, request)) { assert.equal(item.feedItemUid, "first"); break; }
  assert.equal(attempts, 1);
  assert.equal((await collect(iterateFeed(client, request, { maxPages: 1 }))).length, 1);
  assert.equal(attempts, 2);
});

test("rejects repeated cursors before requesting a duplicate page", async () => {
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "token", fetch: async () => { attempts++; return Response.json(page(String(attempts), next)); } });
  await assert.rejects(collect(iterateFeed(client, request)), PaginationError);
  assert.equal(attempts, 2);
});

test("rejects links to other accounts, origins, ranges and duplicate query parameters", async () => {
  for (const link of [`https://unexpected.example${next}`, next.replace("/account/account/", "/account/other/"), next.replace("2026-01-01", "2025-01-01"), `${next}&cursor=other`, `${next}&unknown=value`]) {
    let attempts = 0;
    const client = new StarlingClient({ accessToken: "token", fetch: async () => { attempts++; return Response.json(page("first", link)); } });
    await assert.rejects(collect(iterateFeed(client, request)), PaginationError);
    assert.equal(attempts, 1);
  }
});
