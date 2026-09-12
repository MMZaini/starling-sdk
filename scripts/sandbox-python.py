"""Check the sandbox only. --write adds a one-penny payment and a receipt attachment."""

import asyncio
import base64
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from starling_bank import ApiError, AsyncStarlingClient, RequestSigner, StarlingClient, StarlingEnvironment, iter_feed, get_uploaded_attachment_uid


def main():
    write = "--write" in sys.argv
    token = os.environ["STARLING_SANDBOX_ACCESS_TOKEN"]
    signing = RequestSigner(key_id=os.environ["STARLING_SANDBOX_API_KEY_UID"], private_key=Path(os.environ["STARLING_SANDBOX_API_PRIVATE_KEY_PATH"]).read_bytes()) if write else None
    with StarlingClient(access_token=token, environment=StarlingEnvironment.SANDBOX, signing=signing) as client:
        accounts = client.accounts.list().accounts or []
        account = next(item for item in accounts if item.currency == "GBP" and item.account_uid and item.default_category)
        balance = client.accounts.with_raw_response.get_balance(account_uid=account.account_uid)
        assert balance.response.status_code == 200 and balance.data.effective_balance
        client.accounts.get_identifiers(account_uid=account.account_uid)
        client.identity.get_token()
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=30)
        params = dict(account_uid=account.account_uid, category_uid=account.default_category)
        items = list(iter_feed(client, **params, min_transaction_timestamp=start, max_transaction_timestamp=now))
        csv = b"".join(client.accounts.export_feed(account_uid=account.account_uid, start=start.date(), end=now.date()))
        assert csv, "Empty CSV export"
        print(f"Python sandbox reads passed: accounts, balances, identifiers, token identity, feed ({len(items)} items), CSV.")
        if write:
            payees = client.payees.list().payees or []
            destination = next(item for payee in payees for item in payee.accounts or [] if item.payee_account_uid)
            payment = client.payments.create(**params, external_identifier=str(uuid4()), destination_payee_account_uid=destination.payee_account_uid, reference="SDK Python test", amount={"currency": "GBP", "minorUnits": 1})
            assert payment.payment_order_uid, "Signed payment did not return a payment order"
            item = next(item for item in items if item.feed_item_uid)
            data = base64.b64decode((Path(__file__).resolve().parents[1] / "tests/fixtures/receipt.base64").read_text().strip())
            upload = client.feed.with_raw_response.upload_attachment(**params, feed_item_uid=item.feed_item_uid, request=data, request_options={"additional_headers": {"Content-Type": "image/png"}})
            attachment = get_uploaded_attachment_uid(upload)
            downloaded = b"".join(client.feed.download_attachment(**params, feed_item_uid=item.feed_item_uid, feed_item_attachment_uid=attachment))
            assert downloaded == data, "Attachment bytes changed"
            print("Python sandbox writes passed: signed one-penny payment and attachment upload/download.")

    async def check_async():
        async with AsyncStarlingClient(access_token=token, environment=StarlingEnvironment.SANDBOX) as client:
            result = await client.accounts.list()
            assert result.accounts
            await client.accounts.get_balance(account_uid=account.account_uid)
        print("Asynchronous Python sandbox reads passed.")
    asyncio.run(check_async())


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Omit potentially sensitive response bodies and request metadata.
        print(f"Sandbox API check failed: HTTP {error.status_code}" if isinstance(error, ApiError) else f"Sandbox check failed: {type(error).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
