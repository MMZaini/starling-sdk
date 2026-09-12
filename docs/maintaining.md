# Maintaining the SDKs

Ordinary API changes follow this workflow:

```sh
npm ci
npm run spec:update
npm run generate
```

`spec:update` downloads the official OpenAPI bytes and updates their provenance
only when the content changes. Review the diff, run the [checks](testing.md), and
commit the spec, overrides, generated code and metadata together. Update the
version and changelog when releasing.

Do not edit generated files directly. Keep language helpers outside `generated/`;
put naming and schema corrections in `fern/overrides.yml`. `spec:check` regenerates
the endpoint map and signing routes and detects missing or obsolete mappings.

The weekly `Check upstream specification` workflow performs the same comparison
and, when changed, regenerates and tests the SDKs. It uploads a patch for review
and never publishes packages. Download the `starling-spec-update` artifact, create
a local branch, and apply `git apply --index starling-spec-update.patch`. Check the
workflow's test results and review the diff before committing. If generation fails,
the patch still contains the updated spec so missing mappings can be resolved.

New endpoints need readable names in the overrides. Removed endpoints need their
overrides removed. Changes to authentication or behavior absent from the OpenAPI
spec need separate helper updates and tests. Most schema changes require only
regeneration, but a spec update is still a code change to review.

## Generator upgrades

The CLI version is pinned in `fern/fern.config.json` and the root package manifest;
each language generator is pinned in `fern/generators.yml`. Update one layer at a
time and inspect generated differences. The checked patches in
`scripts/postprocess.mjs` deliberately fail when their expected output changes.
Review or remove a patch when its upstream defect is fixed.

CI regenerates both SDKs and requires a clean diff. It also checks the public
TypeScript declarations, Python's supported versions, React behavior and actual
package archives. The `Generate SDKs` workflow provides a manual generation run
and downloadable source artifacts. Docker is needed only for generation.

## Release checks

Confirm endpoint coverage, scopes and signing metadata, then run representative
sandbox checks. Check both npm exports and the installed Python distributions, rather than
relying only on tests that import source files. Never include credentials, private
keys, local env files or development artifacts in a package.

See [release setup](releasing.md) for npm/PyPI trusted publishing and version tags.
