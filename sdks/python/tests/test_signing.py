import base64
import hashlib
import json
import re
from datetime import datetime, timezone

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from starling_bank import ApiError, AsyncStarlingClient, RequestSigner, SigningError, StarlingClient, verify_webhook_signature

KEY_ID = "11111111-1111-4111-8111-111111111111"
PAYMENT = dict(account_uid="a/b", category_uid="category", external_identifier="unique", reference="Café", amount={"currency": "GBP", "minorUnits": 12345}, destination_payee_account_uid="payee")


@pytest.fixture(scope="module")
def keys():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    return key, pem, public


def verify_request(request, key):
    authorization = request.headers["Authorization"]
    assert authorization.startswith(f'Bearer test-token;Signature keyid="{KEY_ID}",algorithm="rsa-sha512",headers="(request-target) Date Digest",signature="')
    signature = base64.b64decode(re.search(r'signature="([^"]+)"$', authorization)[1])
    content = f'(request-target): {request.method.lower()} {request.url.raw_path.decode()}\nDate: {request.headers["Date"]}\nDigest: {request.headers["Digest"]}'
    key.public_key().verify(signature, content.encode(), padding.PKCS1v15(), hashes.SHA512())
    assert abs((datetime.now(timezone.utc) - datetime.fromisoformat(request.headers["Date"])).total_seconds()) < 5


def test_signs_exact_bytes_and_encoded_url_without_retrying_writes(keys):
    key, pem, _ = keys
    requests = []
    def handler(request):
        requests.append(request)
        assert b"/a%2Fb/" in request.url.raw_path
        verify_request(request, key)
        assert request.headers["Digest"] == base64.b64encode(hashlib.sha512(request.content).digest()).decode()
        assert json.loads(request.content)["reference"] == "Café"
        return httpx.Response(503, json={"errors": [{"message": "unavailable"}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="test-token", signing=RequestSigner(key_id=KEY_ID, private_key=pem), httpx_client=http, max_retries=5) as client:
            with pytest.raises(ApiError) as caught:
                client.payments.create(**PAYMENT, request_options={"max_retries": 10, "additional_query_parameters": {"test": "a b"}, "additional_headers": {"Date": "stale", "Digest": "wrong"}})
            assert caught.value.status_code == 503
        assert not http.is_closed
    assert len(requests) == 1


async def test_async_bodyless_delete_signs_x(keys):
    key, pem, _ = keys
    def handler(request):
        verify_request(request, key)
        assert request.headers["Digest"] == "X" and request.content == b""
        return httpx.Response(204)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncStarlingClient(access_token="test-token", signing=RequestSigner(key_id=KEY_ID, private_key=pem), httpx_client=http) as client:
            await client.payments.cancel_standing_order(account_uid="account", category_uid="category", payment_order_uid="order")
        assert not http.is_closed


def test_signed_operations_without_key_fail_before_network():
    def handler(request):
        pytest.fail("must not send")
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        with StarlingClient(access_token="test-token", httpx_client=http) as client:
            with pytest.raises(SigningError):
                client.payments.create(**PAYMENT)
            with pytest.raises(SigningError):
                client.payments.cancel_standing_order(account_uid="account", category_uid="category", payment_order_uid="order")


def test_signing_key_validation(keys):
    _, pem, public = keys
    with pytest.raises(SigningError):
        RequestSigner(key_id='bad"key', private_key=pem)
    with pytest.raises(SigningError):
        RequestSigner(key_id=KEY_ID, private_key=public)
    with pytest.raises(SigningError) as caught:
        RequestSigner(key_id=KEY_ID, private_key="invalid secret material")
    assert "secret material" not in str(caught.value)
    weak = rsa.generate_private_key(public_exponent=65537, key_size=1024).private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    with pytest.raises(SigningError):
        RequestSigner(key_id=KEY_ID, private_key=weak)


def test_v2_webhooks_require_original_bytes_and_valid_signature(keys):
    key, _, public = keys
    body = '{ "message": "Café", "amount": 12345 }\n'.encode()
    signature = base64.b64encode(key.sign(body, padding.PKCS1v15(), hashes.SHA512())).decode()
    assert verify_webhook_signature(body, signature, public)
    assert not verify_webhook_signature(json.dumps(json.loads(body)).encode(), signature, public)
    assert not verify_webhook_signature(body, "invalid base64", public)
    assert not verify_webhook_signature(body, None, public)
    assert not verify_webhook_signature(body, base64.b64encode(bytes(256)).decode(), public)
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    assert not verify_webhook_signature(body, signature, other)
