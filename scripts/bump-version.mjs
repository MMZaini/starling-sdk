import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function nextVersion(version, bump) {
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), "Expected a stable semantic version");
  assert(["patch", "minor"].includes(bump), "Expected patch or minor");
  const [major, minor, patch] = version.split(".").map(Number);
  return bump === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

export function specReleaseSummary(kind) {
  return kind === "additive" ? "Update Starling's specification with compatible response model additions."
    : "Regenerate clients from Starling's updated API documentation.";
}

export async function bumpVersion(bump, summary) {
  assert(summary && !summary.includes("\n"), "Provide one release-note line");
  const sdk = JSON.parse(await readFile("sdks/typescript/package.json", "utf8"));
  const version = nextVersion(sdk.version, bump);
  const writes = [];
  for (const directory of ["sdks/typescript", "packages/react"]) {
    for (const name of ["package.json", "package-lock.json"]) {
      const path = `${directory}/${name}`;
      const data = JSON.parse(await readFile(path, "utf8"));
      assert.equal(data.version, sdk.version, "Package versions must match before releasing");
      data.version = version;
      if (data.packages?.[""]) data.packages[""].version = version;
      writes.push([path, JSON.stringify(data, null, 2) + "\n"]);
    }
  }
  const project = await readFile("sdks/python/pyproject.toml", "utf8");
  assert.equal(/^version = "([^"]+)"$/m.exec(project)?.[1], sdk.version, "Python version must match");
  writes.push(["sdks/python/pyproject.toml", project.replace(/^version = "[^"]+"$/m, `version = "${version}"`)]);
  const changelog = await readFile("CHANGELOG.md", "utf8");
  assert(changelog.startsWith("# Changelog\n"), "Unexpected changelog format");
  writes.push(["CHANGELOG.md", changelog.replace(/^# Changelog\n+/, `# Changelog\n\n## ${version}\n\n- ${summary}\n\n`)]);
  for (const [path, value] of writes) await writeFile(path, value);
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await bumpVersion(process.argv[2], process.argv[3]));
}
