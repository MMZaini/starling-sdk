import { randomBytes, timingSafeEqual } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { StarlingEnvironment } from "../generated/environments.js";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: Date;
  scope: string;
}

export class OAuthError extends Error {
  constructor(public readonly code: string, public readonly statusCode?: number) {
    super(`Starling OAuth failed: ${code}${statusCode ? ` (HTTP ${statusCode})` : ""}`);
    this.name = "OAuthError";
  }
}

export interface OAuthTlsOptions {
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

export interface OAuthRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export type OAuthTransport = (request: OAuthRequest) => Promise<{ status: number; body: unknown }>;

export interface StarlingOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment?: StarlingEnvironment;
  tls?: OAuthTlsOptions;
  /** Supply a certificate-capable transport when TLS is managed externally. */
  transport?: OAuthTransport;
  /** Override for a proxy or a local HTTPS test server. */
  tokenUrl?: string;
  timeoutInSeconds?: number;
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function validateOAuthState(expected: string, received: string | undefined | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function httpsTransport(tls?: OAuthTlsOptions): OAuthTransport {
  return ({ url, body, headers, signal }) => new Promise((resolve, reject) => {
    const request = httpsRequest(url, { ...tls, rejectUnauthorized: true, method: "POST", headers, signal }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          response.destroy(new OAuthError("response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        try {
          resolve({ status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch {
          reject(new OAuthError("invalid_response", status));
        }
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

function parseTokens(body: unknown, status: number): OAuthTokens {
  if (!body || typeof body !== "object") throw new OAuthError("invalid_response", status);
  const value = body as Record<string, unknown>;
  if (status !== 200) {
    const code = typeof value.error === "string" && /^[a-z_]+$/.test(value.error) ? value.error : "oauth_error";
    throw new OAuthError(code, status);
  }
  if (typeof value.access_token !== "string" || !value.access_token ||
      typeof value.refresh_token !== "string" || !value.refresh_token ||
      typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 0 ||
      typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer" ||
      (value.scope !== undefined && typeof value.scope !== "string")) {
    throw new OAuthError("invalid_response", status);
  }
  const expiresAt = new Date(Date.now() + value.expires_in * 1000);
  if (Number.isNaN(expiresAt.getTime())) throw new OAuthError("invalid_response", status);
  return {
    accessToken: value.access_token, refreshToken: value.refresh_token,
    tokenType: "Bearer", expiresIn: value.expires_in, expiresAt,
    scope: (value.scope as string | undefined) ?? "",
  };
}

/** Explicit OAuth helpers. Applications own token persistence and callback sessions. */
export class StarlingOAuth {
  readonly #options: StarlingOAuthOptions;
  readonly #tokenUrl: string;
  readonly #transport: OAuthTransport;

  constructor(options: StarlingOAuthOptions) {
    if (!options.clientId || !options.clientSecret || !options.redirectUri) {
      throw new TypeError("clientId, clientSecret and redirectUri are required");
    }
    const environment = options.environment ?? StarlingEnvironment.Sandbox;
    if (!Object.values(StarlingEnvironment).includes(environment)) throw new TypeError("Invalid OAuth environment");
    const production = environment === StarlingEnvironment.Production;
    const timeout = options.timeoutInSeconds ?? 30;
    if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError("timeoutInSeconds must be positive");
    if (production && !options.tls && !options.transport) {
      throw new TypeError("Production OAuth requires client TLS credentials or a certificate-capable transport");
    }
    new URL(options.redirectUri);
    const tokenUrl = options.tokenUrl ?? (production
      ? "https://token-api.starlingbank.com/oauth/access-token"
      : options.tls ? "https://token-api-sandbox.starlingbank.com/oauth/access-token"
        : "https://api-sandbox.starlingbank.com/oauth/access-token");
    const parsed = new URL(tokenUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new TypeError("tokenUrl must be HTTPS without credentials, query parameters or a fragment");
    }
    this.#options = { ...options, environment, timeoutInSeconds: timeout };
    this.#tokenUrl = tokenUrl;
    this.#transport = options.transport ?? httpsTransport(options.tls);
  }

  getAuthorizationUrl({ state, scopes }: { state: string; scopes?: string[] }): string {
    if (!state) throw new TypeError("A session-bound OAuth state is required");
    const url = new URL(this.#options.environment === StarlingEnvironment.Production
      ? "https://oauth.starlingbank.com/" : "https://oauth-sandbox.starlingbank.com/");
    url.search = new URLSearchParams({ client_id: this.#options.clientId, response_type: "code", state, redirect_uri: this.#options.redirectUri }).toString();
    if (scopes?.length) url.searchParams.set("scope", scopes.join(" "));
    return url.toString();
  }

  exchangeCode(code: string, options?: { signal?: AbortSignal }): Promise<OAuthTokens> {
    if (!code) throw new TypeError("An authorization code is required");
    return this.#exchange({ grant_type: "authorization_code", code, redirect_uri: this.#options.redirectUri }, options?.signal);
  }

  refreshToken(refreshToken: string, options?: { signal?: AbortSignal }): Promise<OAuthTokens> {
    if (!refreshToken) throw new TypeError("A refresh token is required");
    return this.#exchange({ grant_type: "refresh_token", refresh_token: refreshToken }, options?.signal);
  }

  async #exchange(parameters: Record<string, string>, signal?: AbortSignal): Promise<OAuthTokens> {
    const body = new URLSearchParams({ ...parameters, client_id: this.#options.clientId, client_secret: this.#options.clientSecret }).toString();
    const timeout = AbortSignal.timeout(Math.ceil(this.#options.timeoutInSeconds! * 1000));
    try {
      const response = await this.#transport({
        url: this.#tokenUrl, body,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "starling-sdk-typescript" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      return parseTokens(response.body, response.status);
    } catch (error) {
      if (error instanceof OAuthError) throw error;
      throw new OAuthError(signal?.aborted ? "request_aborted" : timeout.aborted ? "timeout" : "network_error");
    }
  }
}
