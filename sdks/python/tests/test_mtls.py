import importlib.util
import ssl
from pathlib import Path

import pytest

from starling_bank import AsyncStarlingOAuth, OAuthError, StarlingEnvironment, StarlingOAuth

spec = importlib.util.spec_from_file_location("tls_server", Path(__file__).parents[3] / "tests/support/tls_server.py")
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


async def test_verified_https_requires_client_certificate():
    with fixture.tls_server() as config:
        tls = ssl.create_default_context(cafile=config["ca"])
        tls.load_cert_chain(config["cert"], config["key"])
        options = dict(client_id="client", client_secret="secret&=+", redirect_uri="https://localhost/callback", environment=StarlingEnvironment.PRODUCTION, token_url=config["url"], tls=tls)
        with StarlingOAuth(**options) as oauth:
            assert oauth.exchange_code("code").access_token == "access-new"
            assert oauth.refresh_token("old").refresh_token == "refresh-new"
        async with AsyncStarlingOAuth(**options) as oauth:
            assert (await oauth.exchange_code("code")).access_token == "access-new"
        without_certificate = ssl.create_default_context(cafile=config["ca"])
        with StarlingOAuth(**{**options, "tls": without_certificate}) as oauth:
            with pytest.raises(OAuthError, match="network_error"):
                oauth.exchange_code("code")
