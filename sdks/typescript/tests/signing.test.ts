import assert from "node:assert/strict";
import { constants, createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import test from "node:test";
import { RequestSigner, SigningError, StarlingClient, StarlingError, verifyWebhookSignature } from "../src/index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const signing = { keyId: "11111111-1111-4111-8111-111111111111", privateKey };
const payment = { accountUid: "a/b", categoryUid: "category", externalIdentifier: "unique", reference: "Café", amount: { currency: "GBP", minorUnits: 12345 }, destinationPayeeAccountUid: "payee" };

function verifyRequest(url: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  const authorization = headers.get("Authorization")!;
  assert(authorization.startsWith(`Bearer test-token;Signature keyid="${signing.keyId}",algorithm="rsa-sha512",headers="(request-target) Date Digest",signature="`));
  const signature = /signature="([^"]+)"$/.exec(authorization)![1];
  const target = new URL(url);
  const content = `(request-target): ${init.method!.toLowerCase()} ${target.pathname}${target.search}\nDate: ${headers.get("Date")}\nDigest: ${headers.get("Digest")}`;
  assert(verify("RSA-SHA512", Buffer.from(content), { key: publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signature, "base64")));
  assert(Math.abs(Date.now() - Date.parse(headers.get("Date")!)) < 5000);
  assert.equal(init.redirect, "manual");
  return headers;
}

test("signs exact UTF-8 JSON bytes, encoded paths and query parameters without retrying writes", async () => {
  let attempts = 0;
  const client = new StarlingClient({ accessToken: "test-token", signing, maxRetries: 5, fetch: async (input, init) => {
    attempts++;
    assert(String(input).includes("/a%2Fb/"));
    const headers = verifyRequest(String(input), init!);
    const body = Buffer.from(String(init?.body));
    assert.equal(headers.get("Digest"), createHash("sha512").update(body).digest("base64"));
    assert.equal(JSON.parse(body.toString()).reference, "Café");
    return Response.json({ errors: [{ message: "unavailable" }] }, { status: 503 });
  }});
  await assert.rejects(client.payments.create(payment, { maxRetries: 10, queryParams: { test: "a b" }, headers: { Date: "stale", Digest: "wrong" } }), (error: unknown) => error instanceof StarlingError && error.statusCode === 503);
  assert.equal(attempts, 1);
});

test("uses the X digest for a bodyless signed DELETE", async () => {
  const client = new StarlingClient({ accessToken: "test-token", signing, fetch: async (input, init) => {
    const headers = verifyRequest(String(input), init!);
    assert.equal(headers.get("Digest"), "X");
    assert.equal(init?.body, undefined);
    return new Response(null, { status: 204 });
  }});
  await client.payments.cancelStandingOrder({ accountUid: "account", categoryUid: "category", paymentOrderUid: "order" });
});

test("fails before networking when a signed operation has no key", async () => {
  const client = new StarlingClient({ accessToken: "test-token", fetch: async () => { throw new Error("must not send"); } });
  await assert.rejects(client.payments.create(payment), SigningError);
  await assert.rejects(client.payments.cancelStandingOrder({ accountUid: "account", categoryUid: "category", paymentOrderUid: "order" }), SigningError);
});

test("validates key identity, algorithm and strength", () => {
  assert.throws(() => new RequestSigner({ ...signing, keyId: 'bad"key' }), SigningError);
  assert.throws(() => new RequestSigner({ ...signing, privateKey: publicKey }), SigningError);
  assert.throws(() => new RequestSigner({ ...signing, privateKey: "invalid secret material" }), (error: unknown) => error instanceof SigningError && !error.message.includes("secret material"));
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024 });
  assert.throws(() => new RequestSigner({ ...signing, privateKey: weak.privateKey }), SigningError);
  const signer = new RequestSigner(signing);
  assert.throws(() => signer.signHeaders({ method: "PUT", url: "https://api-sandbox.starlingbank.com/api/v2/test", authorization: "Bearer token;Signature stale" }), SigningError);
});

test("verifies V2 raw webhook bytes and rejects altered payloads and signatures", () => {
  const body = Buffer.from('{ "message": "Café", "amount": 12345 }\n');
  const signature = sign("RSA-SHA512", body, { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString("base64");
  assert(verifyWebhookSignature(body, signature, publicKey));
  assert(!verifyWebhookSignature(Buffer.from(JSON.stringify(JSON.parse(body.toString()))), signature, publicKey));
  assert(!verifyWebhookSignature(body, "invalid base64", publicKey));
  assert(!verifyWebhookSignature(body, null, publicKey));
  assert(!verifyWebhookSignature(body, Buffer.alloc(256).toString("base64"), publicKey));
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert(!verifyWebhookSignature(body, signature, other.publicKey));
});
