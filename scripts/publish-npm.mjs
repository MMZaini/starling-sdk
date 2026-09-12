import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

assert(process.env.npm_execpath, "Run npm run publish:npm");
const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
for (const file of manifest.files.filter((entry) => entry.registry === "npm")) {
  const artifact = resolve("artifacts", file.path);
  assert(artifact.startsWith(resolve("artifacts/npm") + sep));
  const bytes = await readFile(artifact);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, "Artifact checksum changed");
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(file.name)}/${file.version}`);
  if (response.ok) {
    const published = await response.json();
    assert.equal(published.dist?.integrity, file.integrity, `Published bytes differ for ${file.name}@${file.version}`);
    console.log(`${file.name}@${file.version} already exists with matching integrity.`);
    continue;
  }
  assert.equal(response.status, 404, "Could not check the npm registry");
  const provenance = process.env.GITHUB_ACTIONS === "true" ? ["--provenance"] : [];
  execFileSync(process.execPath, [process.env.npm_execpath, "publish", artifact, "--access", "public", "--ignore-scripts", ...provenance], { stdio: "inherit" });
}
