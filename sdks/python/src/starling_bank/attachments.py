"""Attachment identifiers from synchronous and accepted upload responses."""

import re

from .generated.core.http_response import AsyncHttpResponse, HttpResponse


def get_uploaded_attachment_uid(upload: HttpResponse[str | None] | AsyncHttpResponse[str | None]) -> str:
    """Read the UUID from a 200 JSON body or an empty 202 response's Location header."""
    uuid = re.compile(r"[\da-fA-F]{8}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{4}-[\da-fA-F]{12}")
    if upload.response.status_code not in (200, 202):
        raise ValueError("Expected a successful attachment upload response")
    if isinstance(upload.data, str) and uuid.fullmatch(upload.data):
        return upload.data
    location = upload.response.headers.get("Location", "")
    match = re.search(r"/attachments/([^/?#]+)$", location)
    if match and uuid.fullmatch(match[1]):
        return match[1]
    raise ValueError("The upload response did not contain a valid attachment UUID in its body or Location header")
