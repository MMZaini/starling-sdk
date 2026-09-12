import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sdk = JSON.parse(await readFile("sdks/typescript/package.json", "utf8"));
const react = JSON.parse(await readFile("packages/react/package.json", "utf8"));
const python = await readFile("sdks/python/pyproject.toml", "utf8");
assert.equal(react.version, sdk.version, "Package versions must match");
assert.equal(/^version = "([^"]+)"$/m.exec(python)?.[1], sdk.version, "Python version must match");
assert(/^\d+\.\d+\.\d+$/.test(sdk.version), "Release version must be stable semver");
assert.equal(process.env.RELEASE_REF_TYPE, "tag", "Run this workflow from a version tag");
assert.equal(process.env.RELEASE_TAG, `v${sdk.version}`, "Tag must match package versions");
console.log(`Validated release v${sdk.version}`);
