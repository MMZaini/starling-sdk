import httpx
import pytest

from starling_bank import ApiError, AsyncStarlingClient, StarlingClient, get_uploaded_attachment_uid

UID = "11111111-1111-4111-8111-111111111111"
PARAMS = dict(account_uid="account", category_uid="category", feed_item_uid="item", request=b"bytes")


def test_empty_202_uses_location_and_preserves_response():
    location = f"/api/v2/feed/account/account/category/category/item/attachments/{UID}"
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(202, headers={"Location": location}))) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            response = client.feed.with_raw_response.upload_attachment(**PARAMS)
    assert response.data is None
    assert response.response.status_code == 202
    assert response.response.content == b""
    assert get_uploaded_attachment_uid(response) == UID


async def test_async_upload_200_uuid():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=UID))) as http:
        async with AsyncStarlingClient(access_token="token", httpx_client=http) as client:
            response = await client.feed.with_raw_response.upload_attachment(**PARAMS)
    assert get_uploaded_attachment_uid(response) == UID


@pytest.mark.parametrize("status", [400, 401, 500])
def test_empty_errors_are_not_success(status):
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status))) as http:
        with StarlingClient(access_token="token", httpx_client=http) as client:
            with pytest.raises(ApiError) as caught:
                client.feed.upload_attachment(**PARAMS)
    assert caught.value.status_code == status
