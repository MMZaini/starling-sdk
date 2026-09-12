"""Lazy iteration over Starling's paginated transaction feed."""

from __future__ import annotations

from datetime import datetime
from typing import AsyncIterator, Iterator
from urllib.parse import parse_qs, quote, urljoin, urlsplit

from .client import AsyncStarlingClient, StarlingClient
from .generated.core.request_options import RequestOptions
from .generated.types.feed_item import FeedItem


class PaginationError(Exception):
    pass


class _FeedPagination:
    def __init__(self, base_url, account_uid, category_uid, minimum, maximum, max_pages):
        if minimum.tzinfo is None or maximum.tzinfo is None or minimum > maximum:
            raise ValueError("Provide timezone-aware minimum and maximum transaction timestamps in order")
        if max_pages is not None and (not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1):
            raise ValueError("max_pages must be a positive integer")
        path = f"/api/v2/feed/account/{quote(account_uid, safe='')}/category/{quote(category_uid, safe='')}/paginated-transactions"
        self.base = urlsplit(base_url + path)
        self.minimum, self.maximum = minimum, maximum
        self.request = dict(account_uid=account_uid, category_uid=category_uid, min_transaction_timestamp=minimum, max_transaction_timestamp=maximum)
        self.seen: set[tuple[str | None, str | None]] = set()

    def take(self):
        marker = (self.request.get("cursor"), self.request.get("page_to_fetch"))
        if marker in self.seen:
            raise PaginationError("Starling returned a repeated pagination cursor")
        self.seen.add(marker)
        return self.request

    def advance(self, link):
        try:
            next_url = urlsplit(urljoin(self.base.geturl(), link))
            if (next_url.scheme, next_url.hostname, next_url.port, next_url.path) != (self.base.scheme, self.base.hostname, self.base.port, self.base.path) or next_url.username or next_url.password or next_url.fragment:
                raise PaginationError("The next link changed the API origin or feed endpoint")
            values = parse_qs(next_url.query, keep_blank_values=True)
            allowed = {"minTransactionTimestamp", "maxTransactionTimestamp", "cursor", "pageToFetch"}
            if any(key not in allowed or len(value) != 1 for key, value in values.items()):
                raise PaginationError("The next link contains unsupported or duplicate parameters")
            minimum = datetime.fromisoformat(values["minTransactionTimestamp"][0])
            maximum = datetime.fromisoformat(values["maxTransactionTimestamp"][0])
            if minimum != self.minimum or maximum != self.maximum:
                raise PaginationError("The next link changed the requested date range")
            cursor = values["cursor"][0]
            if not cursor or values.get("pageToFetch", ["NEXT"])[0] != "NEXT":
                raise PaginationError("The next link has no forward pagination cursor")
        except (ValueError, KeyError, TypeError):
            raise PaginationError("Starling returned an invalid next link") from None
        self.request = {**self.request, "cursor": cursor, "page_to_fetch": "NEXT"}


def iter_feed(client: StarlingClient, *, account_uid: str, category_uid: str,
              min_transaction_timestamp: datetime, max_transaction_timestamp: datetime,
              max_pages: int | None = None, request_options: RequestOptions | None = None) -> Iterator[FeedItem]:
    """Yield feed items one page at a time. Breaking the loop prevents further requests."""
    if request_options and request_options.get("additional_query_parameters"):
        raise ValueError("Pass feed filters directly; additional query parameters are unsupported by iter_feed")
    pagination = _FeedPagination(client.base_url, account_uid, category_uid, min_transaction_timestamp, max_transaction_timestamp, max_pages)
    count = 0
    while True:
        page = client.feed.list_page(**pagination.take(), request_options=request_options)
        yield from page.feed_items
        count += 1
        if not page.links.next or (max_pages is not None and count >= max_pages):
            return
        pagination.advance(page.links.next)


async def async_iter_feed(client: AsyncStarlingClient, *, account_uid: str, category_uid: str,
                          min_transaction_timestamp: datetime, max_transaction_timestamp: datetime,
                          max_pages: int | None = None, request_options: RequestOptions | None = None) -> AsyncIterator[FeedItem]:
    """Async feed iteration; cancellation stops the current request or retry wait."""
    if request_options and request_options.get("additional_query_parameters"):
        raise ValueError("Pass feed filters directly; additional query parameters are unsupported by async_iter_feed")
    pagination = _FeedPagination(client.base_url, account_uid, category_uid, min_transaction_timestamp, max_transaction_timestamp, max_pages)
    count = 0
    while True:
        page = await client.feed.list_page(**pagination.take(), request_options=request_options)
        for item in page.feed_items:
            yield item
        count += 1
        if not page.links.next or (max_pages is not None and count >= max_pages):
            return
        pagination.advance(page.links.next)
