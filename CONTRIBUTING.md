# Contributing

Open an issue for a reproducible bug or a proposed API change, or send a focused
pull request. Include the package version, environment and expected behavior.
Use sandbox examples and remove tokens, private keys and personal account data.

## Where changes belong

| Change | Location |
| --- | --- |
| Upstream API update | `npm run spec:update`; keep `openapi/starling.json` unmodified |
| SDK names, schema corrections or retry metadata | `fern/overrides.yml` |
| Authentication, signing or pagination behavior | Helpers outside each SDK's `generated/` directory |
| Demonstrated generator defect | A checked patch in `scripts/postprocess.mjs` and a regression test |
| Account display or formatting | `packages/react/src/` |
| Usage or API explanation | Package READMEs or `docs/` |

Do not edit generated source directly. Regenerate both languages after changing
the spec or overrides, and include the resulting source and metadata in the same
pull request. See [generation](docs/how-it-works.md) and [maintenance](docs/maintaining.md).

## Checks

Follow the [development setup](README.md#development). Run the tests and type checks
for the affected packages; behavioral fixes should include a test that reproduces
the bug. For changes that affect public types or packaging, build and install the
release archives with `npm run build:artifacts` and `npm run check:artifacts`.

[Testing](docs/testing.md) lists the complete commands, including browser and
optional sandbox checks. CI also checks that regeneration leaves no source drift.
Describe what changed, why, and how you checked it in the pull request.
