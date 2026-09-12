# Releasing

The packages share a version: `@mmzaini/starling-sdk`, `@mmzaini/starling-react` and
`starling-bank-sdk`. Update their manifests and the changelog together. Keep the
npm lockfiles current when changing versions or dependencies.

For a manual release, `node scripts/bump-version.mjs patch "Describe the change."`
updates all package versions, lockfiles and the changelog. Use `minor` for additive
features. Edit the release notes before committing. Compatible spec updates use
this same versioning helper through the [automatic updater](maintaining.md#automatic-updates).

## Registry setup

For PyPI, add a [pending GitHub publisher](https://pypi.org/manage/account/publishing/)
under the `mmzaini` account:

| Field | Value |
| --- | --- |
| PyPI project | `starling-bank-sdk` |
| Owner | `MMZaini` |
| Repository | `starling-sdk` |
| Workflow | `release.yml` |
| Environment | `pypi` |

The first trusted publication creates the project. No PyPI API token is needed.
See [PyPI's pending publisher guide](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

npm trusted publishing requires the package to exist first. For the initial
publication, sign in with `npm login` as `mmzaini` and publish the verified CI
artifacts using `npm run publish:npm`. Complete npm's account/2FA prompts locally.
Then add a GitHub trusted publisher for **each** npm package:

| Field | Value |
| --- | --- |
| Owner | `MMZaini` |
| Repository | `starling-sdk` |
| Workflow | `release.yml` |
| Environment | `npm` |
| Allowed action | Direct publishing (`npm publish`) |

The release workflow uses npm 11.16.0 and Node 24 for OIDC and provenance. Initial
local publications do not have GitHub provenance; subsequent trusted publications
do. See [npm's trusted publisher documentation](https://docs.npmjs.com/trusted-publishers/).

## Build and publish

CI checks Node 22/24, Python 3.11–3.14, React 18/19, browser accessibility, generation
drift and installation of the actual release archives. Its `release-artifacts`
artifact contains both npm tarballs, the Python wheel/sdist and SHA-256 checksums.

For local artifact checks after installing the development dependencies:

```sh
npm run build:artifacts
npm run check:artifacts
```

Use artifacts from a passing CI run of the exact commit being released. Tag that
commit on `main` as `v0.1.0` (or the new matching version) and push the tag. The
`Release` workflow reruns CI, publishes the tested archives, and creates the GitHub
release after both registries succeed. A manual dispatch must select a version tag.

The workflow can resume a partial publication: an existing npm version must have
matching integrity, and existing PyPI files must have matching SHA-256 checksums.
GitHub releases stay in draft until every archive and checksum is uploaded. A
retry verifies existing assets and uploads missing ones; it refuses to replace
different bytes. Release notes include only the version being published.
Never move a released tag or reuse a version for different contents. Fix a published
problem with a new version; do not overwrite release history.

Publishing scripts also reject archives from a different commit, a mismatched
version or a checkout with uncommitted files.

All publishing jobs use registry-specific GitHub environments and short-lived OIDC
credentials. PR tests receive no banking or publishing credentials.
