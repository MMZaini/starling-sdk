import assert from "node:assert/strict";
import test from "node:test";
import { StarlingOAuth, StarlingEnvironment, OAuthError, createOAuthState, validateOAuthState, type OAuthRequest } from "../src/index.js";

const options = { clientId: "client", clientSecret: "secret&=+", redirectUri: "https://localhost/callback" };
const tokens = { access_token: "access-new", refresh_token: "refresh-new", token_type: "Bearer", expires_in: 3600, scope: "account:read" };

test("builds authorization URLs with session state and encoded parameters", () => {
  const oauth = new StarlingOAuth(options);
  const state = createOAuthState();
  assert.equal(state.length, 43);
  assert.notEqual(state, createOAuthState());
  assert(validateOAuthState(state, state));
  assert(!validateOAuthState(state, "wrong"));
  assert(!validateOAuthState("", ""));
  assert(!validateOAuthState(state, undefined));
  const url = new URL(oauth.getAuthorizationUrl({ state, scopes: ["account:read", "balance:read"] }));
  assert.equal(url.origin, "https://oauth-sandbox.starlingbank.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("scope"), "account:read balance:read");
  assert.equal(url.searchParams.get("redirect_uri"), options.redirectUri);
  assert(!url.searchParams.has("client_secret"));
  assert.throws(() => oauth.getAuthorizationUrl({ state: "" }));
});

test("exchanges and refreshes once using form bodies and returns both replacement tokens", async () => {
  const requests: OAuthRequest[] = [];
  const oauth = new StarlingOAuth({ ...options, transport: async (request) => {
    requests.push(request);
    return { status: 200, body: tokens };
  }});
  const result = await oauth.exchangeCode("code&=+");
  assert.equal(result.accessToken, tokens.access_token);
  assert.equal(result.refreshToken, tokens.refresh_token);
  assert(Math.abs(result.expiresAt.getTime() - Date.now() - 3600000) < 5000);
  await oauth.refreshToken("refresh-old");
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://api-sandbox.starlingbank.com/oauth/access-token");
    assert.equal(request.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(new URLSearchParams(request.body).get("client_secret"), options.clientSecret);
  }
  assert.equal(new URLSearchParams(requests[0].body).get("code"), "code&=+");
  const refresh = new URLSearchParams(requests[1].body);
  assert.equal(refresh.get("grant_type"), "refresh_token");
  assert.equal(refresh.get("refresh_token"), "refresh-old");
  assert(!refresh.has("redirect_uri"));
});

test("enforces HTTPS and production client-certificate configuration", () => {
  assert.throws(() => new StarlingOAuth({ ...options, environment: StarlingEnvironment.Production }), /TLS/);
  for (const tokenUrl of ["http://localhost/token", "https://user:pass@example.com/token", "https://example.com/token?secret=yes"]) {
    assert.throws(() => new StarlingOAuth({ ...options, tokenUrl }), /HTTPS/);
  }
  const oauth = new StarlingOAuth({ ...options, environment: StarlingEnvironment.Production, transport: async ({ url }) => {
    assert.equal(url, "https://token-api.starlingbank.com/oauth/access-token");
    return { status: 200, body: tokens };
  }});
  assert.equal(new URL(oauth.getAuthorizationUrl({ state: "session" })).origin, "https://oauth.starlingbank.com");
});

test("rejects malformed responses and omits secrets from errors without retries", async () => {
  for (const body of [null, [], { ...tokens, expires_in: -1 }, { ...tokens, expires_in: 1e30 }, { ...tokens, refresh_token: "" }, { ...tokens, token_type: "MAC" }]) {
    const oauth = new StarlingOAuth({ ...options, transport: async () => ({ status: 200, body }) });
    await assert.rejects(oauth.refreshToken("old"), (error: unknown) => error instanceof OAuthError && error.code === "invalid_response");
  }
  let attempts = 0;
  const oauth = new StarlingOAuth({ ...options, transport: async () => {
    attempts++;
    return { status: 400, body: { error: "invalid_grant", error_description: "secret&=+ refresh-old" } };
  }});
  await assert.rejects(oauth.refreshToken("refresh-old"), (error: unknown) => {
    assert(error instanceof OAuthError);
    assert.equal(error.code, "invalid_grant");
    assert.equal(error.statusCode, 400);
    assert(!String(error).includes("secret"));
    assert(!String(error).includes("refresh-old"));
    return true;
  });
  assert.equal(attempts, 1);
});

test("passes cancellation to transports and sanitizes transport errors", async () => {
  const abort = new AbortController();
  abort.abort();
  const oauth = new StarlingOAuth({ ...options, transport: async ({ signal }) => {
    signal.throwIfAborted();
    throw new Error("sensitive detail");
  }});
  await assert.rejects(oauth.exchangeCode("code", { signal: abort.signal }), (error: unknown) => error instanceof OAuthError && error.code === "request_aborted");
  await assert.rejects(oauth.exchangeCode("code"), (error: unknown) => error instanceof OAuthError && error.code === "network_error" && !String(error).includes("sensitive"));
});

test("validates timer limits and never invokes a transport for a cancelled exchange", async () => {
  for (const timeoutInSeconds of [0, -1, Infinity, NaN, 2147483.648]) {
    assert.throws(() => new StarlingOAuth({ ...options, timeoutInSeconds }), /timeoutInSeconds/);
  }
  let attempts = 0;
  const oauth = new StarlingOAuth({ ...options, transport: async () => {
    attempts++;
    return { status: 200, body: tokens };
  }});
  await assert.rejects(oauth.exchangeCode("code", { signal: AbortSignal.abort() }),
    (error: unknown) => error instanceof OAuthError && error.code === "request_aborted");
  assert.equal(attempts, 0);
});
