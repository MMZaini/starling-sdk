import { Starling, StarlingClient, getUploadedAttachmentUid } from "../../dist/index.js";

const currency: Starling.AccountV2.Currency = Starling.AccountV2.Currency.Gbp;
const account: Starling.AccountV2 = { currency, name: "Main" };
const amount: Starling.CurrencyAndAmount = { currency: "GBP", minorUnits: 1234 };
const client = new StarlingClient({ accessToken: "test" });
const response: Promise<Starling.Accounts> = client.accounts.list();
void [account, amount, response, getUploadedAttachmentUid];
