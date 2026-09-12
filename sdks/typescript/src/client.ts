import { StarlingClient as GeneratedClient } from "./generated/Client.js";
import type { BaseClientOptions } from "./generated/BaseClient.js";
import { StarlingEnvironment } from "./generated/environments.js";
import type { FetchFunction } from "./generated/core/fetcher/index.js";
import { requestWithDeadline } from "./transport.js";
import { RequestSigner, SigningError, type SigningOptions } from "./auth/signing.js";
import { signedRoutes } from "./metadata/signed-routes.js";

export interface StarlingClientOptions extends Omit<BaseClientOptions, "auth" | "fetcher" | "baseUrl" | "environment" | "stream"> {
  environment?: StarlingEnvironment;
  /** HTTPS origin for a proxy. It must not contain a path, credentials or query. */
  baseUrl?: string;
  signing?: SigningOptions;
}

const routes = signedRoutes.map(({ method, path }) => ({ method, pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`) }));

function validateAmounts(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "minorUnits" && !Number.isSafeInteger(child)) throw new RangeError("minorUnits must be a safe integer; never pass fractional or rounded amounts");
    validateAmounts(child);
  }
}

/** Generated resources with request signing, redirect protection and amount checks. */
export class StarlingClient extends GeneratedClient {
  constructor(options: StarlingClientOptions = {}) {
    const environment = options.environment ?? StarlingEnvironment.Sandbox;
    if (!Object.values(StarlingEnvironment).includes(environment)) throw new TypeError("Invalid Starling environment");
    const origin = new URL(options.baseUrl ?? environment);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new TypeError("baseUrl must be an HTTPS origin without credentials, path or query");
    }
    if (options.maxRetries !== undefined && (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0)) throw new RangeError("maxRetries must be a non-negative integer");
    const signer = options.signing ? new RequestSigner(options.signing) : undefined;
    const send = options.fetch ?? globalThis.fetch;
    const guardedFetch: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== origin.origin) throw new TypeError("Refusing to send credentials to a different origin");
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      if (!/^Bearer [^\s;,]+$/i.test(headers.get("Authorization") ?? "")) throw new TypeError("Provide one non-empty bearer access token");
      const signed = routes.some((route) => route.method === method && route.pattern.test(url.pathname));
      if (signed) {
        if (!signer) throw new SigningError("This endpoint requires signing; configure the registered API key");
        // Signed endpoints have JSON bodies. Read only these, preserving upload streams elsewhere.
        const body = init?.body == null ? undefined : new Uint8Array(await new Response(init.body).arrayBuffer());
        for (const [name, value] of Object.entries(signer.signHeaders({ method, url, body, authorization: headers.get("Authorization") ?? "" }))) headers.set(name, value);
      }
      return send(input, { ...init, headers, redirect: "manual" });
    };
    const guardedFetcher: FetchFunction = async (args) => {
      const method = args.method.toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) validateAmounts(args.body);
      if (!signer && routes.some((route) => route.method === method && route.pattern.test(new URL(args.url).pathname))) {
        throw new SigningError("This endpoint requires signing; configure the registered API key");
      }
      return requestWithDeadline({ ...args, fetchFn: guardedFetch });
    };
    // Do not forward unknown JavaScript options that could bypass these checks.
    super({ accessToken: options.accessToken, environment, baseUrl: origin.origin,
      headers: options.headers, timeoutInSeconds: options.timeoutInSeconds, maxRetries: options.maxRetries,
      logging: options.logging, fetch: guardedFetch, fetcher: guardedFetcher });
  }
}
