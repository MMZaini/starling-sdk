"""RSA-SHA512 request signing and V2 webhook verification."""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit


class SigningError(Exception):
    pass


def _cryptography():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        return hashes, serialization, padding, rsa
    except ImportError:
        raise ImportError("Install starling-bank-sdk[signing] for signing and webhook verification") from None


class RequestSigner:
    """Load a registered API private key once; sign the exact serialized request bytes."""

    def __init__(self, *, key_id: str, private_key: str | bytes, passphrase: bytes | None = None):
        if not re.fullmatch(r"[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}", key_id):
            raise SigningError("key_id must be the registered API key UUID")
        _, serialization, _, rsa = _cryptography()
        try:
            self.__key = serialization.load_pem_private_key(private_key.encode() if isinstance(private_key, str) else private_key, password=passphrase)
        except (ValueError, TypeError):
            raise SigningError("Cannot load the API private key") from None
        if not isinstance(self.__key, rsa.RSAPrivateKey) or self.__key.key_size not in (2048, 4096):
            raise SigningError("Request signing requires a 2048- or 4096-bit RSA private key")
        self.__key_id = key_id

    def sign_headers(self, *, method: str, url: str, body: bytes | None, authorization: str) -> dict[str, str]:
        if not re.fullmatch(r"Bearer [^\s;,]+", authorization, re.IGNORECASE):
            raise SigningError("Signing requires one bearer access token")
        hashes, _, padding, _ = _cryptography()
        parsed = urlsplit(url)
        target = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
        date = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        digest = "X" if body is None else base64.b64encode(hashlib.sha512(body).digest()).decode()
        content = f"(request-target): {method.lower()} {target}\nDate: {date}\nDigest: {digest}"
        signature = base64.b64encode(self.__key.sign(content.encode(), padding.PKCS1v15(), hashes.SHA512())).decode()
        return {
            "Authorization": f'{authorization};Signature keyid="{self.__key_id}",algorithm="rsa-sha512",headers="(request-target) Date Digest",signature="{signature}"',
            "Date": date,
            "Digest": digest,
        }


def verify_webhook_signature(body: bytes, signature: str | None, public_key: str | bytes) -> bool:
    """Verify X-Hook-Signature over the unchanged raw body of a V2 webhook."""
    if not signature:
        return False
    try:
        decoded = base64.b64decode(signature, validate=True)
        if base64.b64encode(decoded).decode() != signature:
            return False
    except (binascii.Error, ValueError):
        return False
    hashes, serialization, padding, rsa = _cryptography()
    from cryptography.exceptions import InvalidSignature
    try:
        key = serialization.load_pem_public_key(public_key.encode() if isinstance(public_key, str) else public_key)
    except (ValueError, TypeError):
        raise SigningError("Cannot load the V2 webhook public key") from None
    if not isinstance(key, rsa.RSAPublicKey):
        raise SigningError("V2 webhook verification requires an RSA public key")
    try:
        key.verify(decoded, body, padding.PKCS1v15(), hashes.SHA512())
        return True
    except InvalidSignature:
        return False
