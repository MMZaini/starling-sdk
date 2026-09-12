import { Starling, StarlingClient, RequestSigner } from "../../dist/index.cjs";

const currency: Starling.AccountV2.Currency = Starling.AccountV2.Currency.Gbp;
const account: Starling.AccountV2 = { currency, name: "Main" };
const client = new StarlingClient({ accessToken: "test" });
const response: Promise<Starling.Accounts> = client.accounts.list();
void [account, response, RequestSigner];
