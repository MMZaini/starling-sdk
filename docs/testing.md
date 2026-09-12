# Testing

From the repository root:

```sh
npm ci
npm test
npm --prefix sdks/typescript ci
python -m pip install -e 'sdks/python[dev]'
npm --prefix sdks/typescript run typecheck
npm --prefix sdks/typescript test
npm --prefix sdks/typescript run build
npm --prefix sdks/typescript run check:scripts
npm --prefix sdks/typescript run check:public-types
python -m pytest sdks/python/tests
```

The mutual-TLS tests create short-lived certificates and a local HTTPS server.
TypeScript uses the root `.venv` if present, otherwise `python`; set `TEST_PYTHON`
to use another interpreter. The Python `dev` extra includes the certificate tooling.
Unit tests require no bank credentials and make no requests to Starling.

Root tests cover spec compatibility, versioning and release-note selection. Git
automation tests use temporary repositories and a fake GitHub CLI: they exercise
owner-authored merges and reject stale commits and changes outside generated
output. They run on Linux in CI; use WSL to run them on Windows.

For the optional React package, build the TypeScript SDK first so the component
tests can verify compatibility with its public types, then run:

```sh
npm --prefix packages/react ci
npm --prefix packages/react run typecheck
npm --prefix packages/react test
npm --prefix packages/react run build
cd packages/react
npx playwright install chromium
npm run test:browser
```

Component tests cover SSR, masked details and exact money formatting. Browser
tests check keyboard controls, accessibility and a narrow mobile layout. The
components have been checked with React 18.3.1 and 19.3.0.

## Release archives and documentation

After installing the development dependencies for both SDKs and React:

```sh
npm run build:artifacts
npm run check:artifacts
```

These checks install the actual npm tarballs into a temporary project and test
ESM, CommonJS, public declarations and React rendering. They also compile and run
the root and SDK README examples against mocked API responses. The Python wheel
and source distribution are each installed into a clean virtual environment and
checked with sync/async requests. Package contents, `py.typed` and archive
checksums are verified. These checks need registry access for dependencies but
make no requests to Starling.

## Sandbox checks

Set `STARLING_SANDBOX_ACCESS_TOKEN` to a sandbox token with the required read
scopes, then run:

```sh
node scripts/sandbox-typescript.mjs
python scripts/sandbox-python.py
```

Node can also read a local env file with `node --env-file=.starling-sandbox.env
scripts/sandbox-typescript.mjs`. Keep credentials out of Git and logs.

The checks cover account lists, balances, identifiers, token identity, paginated
feed reads and CSV downloads. The Python check also exercises its async client.
For signed sandbox payments and attachment round trips, add `--write` and set
`STARLING_SANDBOX_API_KEY_UID` and `STARLING_SANDBOX_API_PRIVATE_KEY_PATH`.
Each write run sends one penny to an existing sandbox payee and attaches a tiny
PNG to a sandbox feed item. Both scripts hard-code the sandbox environment.

OAuth refresh has also been exercised in the sandbox in both languages; automated
OAuth tests use isolated transports and verified mutual TLS. Refreshing a token
rotates credentials, so live OAuth persistence belongs to the application rather
than these smoke scripts.

These checks verify representative API behavior and the callable surface of all
87 generated operations. They do not exercise every operation against every
account type or establish production onboarding/permissions.
