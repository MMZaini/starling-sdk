# How the SDKs are built

`openapi/starling.json` is Starling's specification, unchanged. Its source URL and checksum are recorded in `openapi/source.json`.

`fern/overrides.yml` provides readable method names, explicit environments, scope documentation and disabled retries for writes. It declares a binary media type for attachment uploads: the upstream description says input stream, but its wildcard object schema otherwise generates a JSON request. It also allows empty 202 upload responses, observed in the sandbox with the attachment URL in `Location`; the upstream spec describes only a 200 UUID response.

`fern/generators.yml` pins each language generator. TypeScript uses flattened request parameters; Python uses named, percent-encoded path parameters. Both clients default to the sandbox.

```sh
npm ci
npm run spec:check
npm run generate
```

Generation requires Docker and writes the generated source, endpoint map and signing metadata. On Windows, the same command can run inside WSL with Linux Node and Docker installed. Our pinned generators produce source locally without a Fern account; npm/PyPI packaging is maintained separately.

The endpoint map and scope/signing manifest come from `npm run spec:check`. The check fails for unmapped new operations, stale overrides, duplicate method names and write operations with retries enabled.

Checked TypeScript patches currently cover generator defects:

- Clear the fetch timeout when the request rejects, as well as when it succeeds.
- Add a missing namespace import for a flattened payee-account enum.
- Raise an API error for invalid JSON instead of returning an error object as successful data.
- Treat 3xx responses as errors so redirects cannot appear to be successful API responses.
- Normalize an empty nullable upload response to `null`, matching its TypeScript return type.

A Python patch checks status before accepting an empty optional response body. Without it, an empty 401 or 500 could be returned as a successful upload. The public Python transport also applies header overrides case-insensitively.

The patches live in `scripts/postprocess.mjs`; generation fails if their expected code changes. Review or remove them when upgrading Fern. Custom SDK helpers live outside the generated directories.

The public client subclasses the generated client without duplicating resource methods. Its transport signs requests after serialization, rejects non-integer amounts and prevents redirects. TypeScript also guards against unsafe integers and uses a deadline across retries and buffered responses. Python retains HTTPX's timeout model and explicitly closes only clients it owns. OAuth and V2 webhook verification are separate helpers because they are absent from the REST specification.
