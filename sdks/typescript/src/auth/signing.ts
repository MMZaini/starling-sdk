import { constants, createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from "node:crypto";

export class SigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningError";
  }
}

export interface SigningOptions {
  /** UUID of the API key registered in the matching Starling environment. */
  keyId: string;
  privateKey: string | Buffer | KeyObject;
  passphrase?: string;
}

/** RSA-SHA512 signing of the exact bytes sent to Starling. */
export class RequestSigner {
  readonly #key: KeyObject;
  readonly #keyId: string;

  constructor(options: SigningOptions) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(options.keyId)) {
      throw new SigningError("keyId must be the registered API key UUID");
    }
    try {
      this.#key = options.privateKey instanceof KeyObject ? options.privateKey
        : createPrivateKey({ key: options.privateKey, passphrase: options.passphrase });
    } catch {
      throw new SigningError("Cannot load the API private key");
    }
    if (this.#key.type !== "private" || this.#key.asymmetricKeyType !== "rsa" ||
        ![2048, 4096].includes(this.#key.asymmetricKeyDetails?.modulusLength ?? 0)) {
      throw new SigningError("Request signing requires a 2048- or 4096-bit RSA private key");
    }
    this.#keyId = options.keyId;
  }

  signHeaders({ method, url, body, authorization }: {
    method: string; url: string | URL; body?: Uint8Array | null; authorization: string;
  }): { Authorization: string; Date: string; Digest: string } {
    if (!/^Bearer [^\s;,]+$/i.test(authorization)) throw new SigningError("Signing requires one bearer access token");
    const target = new URL(url);
    const date = new Date().toISOString();
    const digest = body == null ? "X" : createHash("sha512").update(body).digest("base64");
    const content = `(request-target): ${method.toLowerCase()} ${target.pathname}${target.search}\nDate: ${date}\nDigest: ${digest}`;
    const signature = sign("RSA-SHA512", Buffer.from(content), { key: this.#key, padding: constants.RSA_PKCS1_PADDING }).toString("base64");
    return {
      Authorization: `${authorization};Signature keyid="${this.#keyId}",algorithm="rsa-sha512",headers="(request-target) Date Digest",signature="${signature}"`,
      Date: date,
      Digest: digest,
    };
  }
}

/** Verify X-Hook-Signature against the unchanged body of a V2 webhook. */
export function verifyWebhookSignature(body: Uint8Array, signature: string | null | undefined, publicKey: string | Buffer | KeyObject): boolean {
  if (!signature || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signature)) return false;
  let key: KeyObject;
  try {
    key = publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);
  } catch {
    throw new SigningError("Cannot load the V2 webhook public key");
  }
  if (key.type !== "public" || key.asymmetricKeyType !== "rsa") throw new SigningError("V2 webhook verification requires an RSA public key");
  return verify("RSA-SHA512", body, { key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signature, "base64"));
}
