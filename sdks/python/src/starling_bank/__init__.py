"""Typed clients for the Starling Bank Public API."""

from .generated import *
from .generated.client import AsyncStarlingClient, StarlingClient
from .generated.core.api_error import ApiError
from .generated.environment import StarlingClientEnvironment as StarlingEnvironment
