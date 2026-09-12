# How the SDKs are built

`openapi/starling.json` is Starling's specification, unchanged. Its source URL and checksum are recorded in `openapi/source.json`.

`fern/overrides.yml` provides readable method names, explicit environments, scope documentation and disabled retries for writes. It also declares a binary media type for attachment uploads: the upstream description says input stream, but its wildcard object schema otherwise generates a JSON request.

`fern/generators.yml` pins each language generator. TypeScript uses flattened request parameters; Python uses named, percent-encoded path parameters. Both clients default to the sandbox.

```sh
npm ci
npm run spec:check
npm run generate
```

Generation requires Docker and writes only the generated source directories. On Windows, the same command can run inside WSL with Linux Node and Docker installed. Our pinned generators produce source locally without a Fern account; npm/PyPI packaging is maintained separately.

The endpoint map and scope/signing manifest come from `npm run spec:check`. The check fails for unmapped new operations, stale overrides, duplicate method names and write operations with retries enabled.

Two checked TypeScript patches currently cover generator defects:

- Clear the fetch timeout when the request rejects, as well as when it succeeds.
- Add a missing namespace import for a flattened payee-account enum.

The patches live in `scripts/postprocess.mjs`; generation fails if their expected code changes. Review or remove them when upgrading Fern. Custom SDK helpers live outside the generated directories.
