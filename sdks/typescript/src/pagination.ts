import type { StarlingClient } from "./client.js";
import type { Starling } from "./generated/index.js";
import type { BaseRequestOptions } from "./generated/BaseClient.js";
import { encodePathParam } from "./generated/core/url/index.js";

export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaginationError";
  }
}

export interface FeedIteratorOptions extends Omit<BaseRequestOptions, "queryParams" | "additionalBodyParameters" | "stream"> {
  /** Stop after this many pages. Omit to consume the complete range. */
  maxPages?: number;
}

const parameters = new Set(["minTransactionTimestamp", "maxTransactionTimestamp", "cursor", "pageToFetch"]);

/** Lazily follow the paginated feed's next links, without changing accounts or date range. */
export async function* iterateFeed(client: StarlingClient, request: Starling.ListPageFeedRequest, options: FeedIteratorOptions = {}): AsyncGenerator<Starling.FeedItem> {
  const { maxPages, ...requestOptions } = options;
  if ("queryParams" in options && options.queryParams) throw new TypeError("Pass feed filters directly; queryParams is unsupported by iterateFeed");
  if (maxPages !== undefined && (!Number.isSafeInteger(maxPages) || maxPages < 1)) throw new RangeError("maxPages must be a positive integer");
  const min = Date.parse(request.minTransactionTimestamp);
  const max = Date.parse(request.maxTransactionTimestamp);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new RangeError("Provide a valid minimum and maximum transaction timestamp");
  const base = new URL(`/api/v2/feed/account/${encodePathParam(request.accountUid)}/category/${encodePathParam(request.categoryUid)}/paginated-transactions`, client.baseUrl);
  const seen = new Set<string>();
  let current = { ...request };
  for (let count = 0; ; count++) {
    options.abortSignal?.throwIfAborted();
    const marker = JSON.stringify([current.cursor ?? null, current.cursor ? (current.pageToFetch ?? "NEXT") : null]);
    if (seen.has(marker)) throw new PaginationError("Starling returned a repeated pagination cursor");
    seen.add(marker);
    const page = await client.feed.listPage(current, requestOptions);
    if (!Array.isArray(page?.feedItems) || !page.links) throw new PaginationError("Starling returned an invalid feed page");
    for (const item of page.feedItems) {
      options.abortSignal?.throwIfAborted();
      yield item;
    }
    if (!page.links.next || (maxPages !== undefined && count + 1 >= maxPages)) return;
    let next: URL;
    try { next = new URL(page.links.next, base); }
    catch { throw new PaginationError("Starling returned an invalid next link"); }
    if (next.origin !== base.origin || next.pathname !== base.pathname || next.username || next.password || next.hash) throw new PaginationError("The next link changed the API origin or feed endpoint");
    for (const key of next.searchParams.keys()) {
      if (!parameters.has(key) || next.searchParams.getAll(key).length !== 1) throw new PaginationError("The next link contains unsupported or duplicate parameters");
    }
    const minimum = next.searchParams.get("minTransactionTimestamp");
    const maximum = next.searchParams.get("maxTransactionTimestamp");
    if (!minimum || !maximum || Date.parse(minimum) !== min || Date.parse(maximum) !== max) throw new PaginationError("The next link changed the requested date range");
    const cursor = next.searchParams.get("cursor");
    const direction = next.searchParams.get("pageToFetch") ?? "NEXT";
    if (!cursor || direction !== "NEXT") throw new PaginationError("The next link has no forward pagination cursor");
    current = { ...request, minTransactionTimestamp: minimum, maxTransactionTimestamp: maximum, cursor, pageToFetch: "NEXT" };
  }
}
