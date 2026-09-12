"""Typed clients for the Starling Bank Public API."""

from .generated import *
from .client import AsyncStarlingClient, StarlingClient
from .generated.core.api_error import ApiError
from .generated.environment import StarlingClientEnvironment as StarlingEnvironment
from .auth import AsyncStarlingOAuth, OAuthError, OAuthTokens, StarlingOAuth, create_oauth_state, validate_oauth_state
from .signing import RequestSigner, SigningError, verify_webhook_signature
from .pagination import PaginationError, async_iter_feed, iter_feed
from .attachments import get_uploaded_attachment_uid
