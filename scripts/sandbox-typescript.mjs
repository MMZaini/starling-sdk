import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { StarlingClient, StarlingEnvironment, StarlingError, iterateFeed, getUploadedAttachmentUid } from "../sdks/typescript/dist/index.js";

const write = process.argv.includes("--write");
const token = process.env.STARLING_SANDBOX_ACCESS_TOKEN;
if (!token) throw new Error("Set STARLING_SANDBOX_ACCESS_TOKEN");
if (write) {
  assert(process.env.STARLING_SANDBOX_API_KEY_UID, "Set STARLING_SANDBOX_API_KEY_UID");
  assert(process.env.STARLING_SANDBOX_API_PRIVATE_KEY_PATH, "Set STARLING_SANDBOX_API_PRIVATE_KEY_PATH");
}
const signing = write ? {
  keyId: process.env.STARLING_SANDBOX_API_KEY_UID ?? "",
  privateKey: await readFile(process.env.STARLING_SANDBOX_API_PRIVATE_KEY_PATH ?? ""),
} : undefined;
const client = new StarlingClient({ accessToken: token, environment: StarlingEnvironment.Sandbox, signing });

try {
  const accounts = (await client.accounts.list()).accounts ?? [];
  const account = accounts.find((item) => item.currency === "GBP" && item.accountUid && item.defaultCategory);
  assert(account?.accountUid && account.defaultCategory, "Sandbox needs a GBP account");
  const balance = await client.accounts.getBalance({ accountUid: account.accountUid }).withRawResponse();
  assert.equal(balance.rawResponse.status, 200);
  assert(balance.data.effectiveBalance);
  await client.accounts.getIdentifiers({ accountUid: account.accountUid });
  await client.identity.getToken();
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400000);
  const request = { accountUid: account.accountUid, categoryUid: account.defaultCategory, minTransactionTimestamp: start.toISOString(), maxTransactionTimestamp: now.toISOString() };
  /** @type {import("../sdks/typescript/dist/index.js").Starling.FeedItem[]} */
  const items = [];
  for await (const item of iterateFeed(client, request)) items.push(item);
  const csv = await client.accounts.exportFeed({ accountUid: account.accountUid, start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) });
  assert((await csv.arrayBuffer()).byteLength > 0, "Empty CSV export");
  console.log(`TypeScript sandbox reads passed: accounts, balances, identifiers, token identity, feed (${items.length} items), CSV.`);
  if (write) {
    const payees = (await client.payees.list()).payees ?? [];
    const destination = payees.flatMap((payee) => payee.accounts ?? []).find((item) => item.payeeAccountUid);
    assert(destination?.payeeAccountUid, "Sandbox needs an existing payee");
    const payment = await client.payments.create({ accountUid: account.accountUid, categoryUid: account.defaultCategory, externalIdentifier: randomUUID(), destinationPayeeAccountUid: destination.payeeAccountUid, reference: "SDK TS test", amount: { currency: "GBP", minorUnits: 1 } });
    assert(payment.paymentOrderUid, "Signed payment did not return a payment order");
    const item = items.find((entry) => entry.feedItemUid);
    assert(item?.feedItemUid, "Sandbox needs a feed item for attachment testing");
    const bytes = Buffer.from((await readFile(new URL("../tests/fixtures/receipt.base64", import.meta.url), "utf8")).trim(), "base64");
    const upload = await client.feed.uploadAttachment(new Blob([bytes], { type: "image/png" }), account.accountUid, account.defaultCategory, item.feedItemUid).withRawResponse();
    const attachment = getUploadedAttachmentUid(upload);
    const downloaded = await client.feed.downloadAttachment({ accountUid: account.accountUid, categoryUid: account.defaultCategory, feedItemUid: item.feedItemUid, feedItemAttachmentUid: attachment });
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes, "Attachment bytes changed");
    console.log("TypeScript sandbox writes passed: signed one-penny payment and attachment upload/download.");
  }
} catch (error) {
  // Intentionally omit response bodies, request URLs and credentials from logs.
  console.error(error instanceof StarlingError ? `Sandbox API check failed: HTTP ${error.statusCode ?? "unknown"}` : `Sandbox check failed: ${error instanceof Error ? error.name : "Error"}`);
  process.exitCode = 1;
}
