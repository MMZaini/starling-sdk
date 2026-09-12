from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import pytest

from starling_bank import AsyncStarlingClient, PaginationError, StarlingClient, async_iter_feed, iter_feed

PARAMS = dict(account_uid="account", category_uid="category", min_transaction_timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), max_transaction_timestamp=datetime(2026, 2, 1, tzinfo=timezone.utc))
PATH = "/api/v2/feed/account/account/category/category/paginated-transactions"
NEXT = PATH + "?" + urlencode(dict(minTransactionTimestamp="2026-01-01T00:00:00Z", maxTransactionTimestamp="2026-02-01T00:00:00Z", cursor="second", pageToFetch="NEXT"))


def page(uid, next=None):
    return dict(feedItems=[dict(feedItemUid=uid)], links=dict(self=PATH, first=PATH, next=next))


def test_lazy_iteration_preserves_filters():
    requests = []
    def handler(request):
        requests.append(request)
        assert request.url.path == PATH
        assert datetime.fromisoformat(request.url.params["minTransactionTimestamp"]) == PARAMS["min_transaction_timestamp"]
        if len(requests) == 1:
            return httpx.Response(200, json=page("first", NEXT))
        assert request.url.params["cursor"] == "second"
        assert request.url.params["pageToFetch"] == "NEXT"
        return httpx.Response(200, json=page("second"))
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            items = iter_feed(client, **PARAMS)
            assert not requests
            assert [item.feed_item_uid for item in items] == ["first", "second"]
    assert len(requests) == 2


async def test_async_iteration_and_explicit_page_limit():
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=page(str(len(requests)), NEXT if "cursor" not in request.url.params else None))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncStarlingClient(access_token="token", httpx_client=http) as client:
            assert [item.feed_item_uid async for item in async_iter_feed(client, **PARAMS)] == ["1", "2"]
            assert len([item async for item in async_iter_feed(client, **PARAMS, max_pages=1)]) == 1
    assert len(requests) == 3


def test_repeated_cursor_and_stopping_early():
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=page(str(len(requests)), NEXT))
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            for item in iter_feed(client, **PARAMS):
                break
            assert len(requests) == 1
            with pytest.raises(PaginationError, match="repeated"):
                list(iter_feed(client, **PARAMS))
    assert len(requests) == 3


@pytest.mark.parametrize("link", ["https://unexpected.example" + NEXT, NEXT.replace("/account/account/", "/account/other/"), NEXT.replace("2026-01-01", "2025-01-01"), NEXT + "&cursor=other", NEXT + "&unknown=value"])
def test_unexpected_links_are_rejected(link):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=page("first", link))
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            with pytest.raises(PaginationError):
                list(iter_feed(client, **PARAMS))
    assert len(requests) == 1
