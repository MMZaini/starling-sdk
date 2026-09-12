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

## Automatic updates

`Update the Starling specification` checks the official spec daily at 08:17 UTC
and can also run manually from Actions. It classifies changes, regenerates both
clients and opens a pull request. Compatible updates pass the full CI matrix
against the proposed commit before being merged and released automatically.

| Upstream change | Action |
| --- | --- |
| Formatting only | Test and merge; no new package version |
| Recognized documentation changes | Test, merge and publish a patch version |
| New schemas or optional response model fields | Test, merge and publish a minor version |
| Request schemas, endpoints, scopes, signing, required fields, enums or existing types | Open a draft PR for review |
| Unknown changes or failed generation | Open a draft PR for review |

Compatibility is deliberately conservative. Field-name collisions and schemas
also used in requests require review. Generator versions and dependencies remain
pinned; their upgrades are separate changes. Tests cannot establish every
application's compatibility, so inspect release notes when updating a consumer.

Automatic commits and merge commits use `MMZaini <mahdizainipro@gmail.com>`.
GitHub Actions appears as the workflow actor. The updater never force-pushes a
branch, and additional commits on an update branch require manual review. If
`main` changes during CI, the merge stops and the next run prepares a new candidate.

Generation and tests run with read-only repository access. Separate jobs can
create PRs and merge only allowed generated files and version changes. Publishing
uses the existing trusted-publisher environments. The updater explicitly dispatches
the release workflow because pushes made with `GITHUB_TOKEN` do not trigger it.

For a draft update, use its branch or download the `starling-spec-update` artifact
and apply `git apply --index update.patch` on a branch from the recorded base.
The artifact includes the compatibility report and any generated changes. Review
the failed checks, resolve mappings or helpers, and prepare a versioned release.
Repeated runs leave an existing draft for the same upstream snapshot alone.

The repository allows Actions to create pull requests; the default token remains
read-only. Disable this workflow in Actions to pause automatic updates. Forks need
their own repository identity, workflow permission and publisher configuration.

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
