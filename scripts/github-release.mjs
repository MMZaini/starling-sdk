import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { releaseNotes } from "./release-notes.mjs";
import { checkPublishSource } from "./check-publish-source.mjs";

const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
checkPublishSource(manifest);
const tag = process.env.RELEASE_TAG;
assert.equal(tag, `v${manifest.version}`);
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const files = [];
for (const entry of manifest.files) {
  const path = resolve("artifacts", entry.path);
  assert(path.startsWith(resolve("artifacts") + sep));
  assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), entry.sha256);
  files.push({ path, name: basename(path), sha256: entry.sha256 });
}
await mkdir("artifacts/release", { recursive: true });
const sums = files.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n";
await writeFile("artifacts/release/SHA256SUMS", sums);
files.push({ path: "artifacts/release/SHA256SUMS", name: "SHA256SUMS", sha256: createHash("sha256").update(sums).digest("hex") });
await writeFile("artifacts/release/notes.md", releaseNotes(await readFile("CHANGELOG.md", "utf8"), manifest.version));
const endpoint = `repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${tag}`;
const existing = spawnSync("gh", ["api", endpoint], { encoding: "utf8" });
if (existing.status !== 0) {
  assert(existing.stderr.includes("HTTP 404"), "Could not check the existing GitHub release");
  gh("release", "create", tag, "--verify-tag", "--title", tag, "--notes-file", "artifacts/release/notes.md", "--draft");
}
const release = JSON.parse(gh("api", endpoint));
assert.equal(release.tag_name, tag);
for (const file of files) {
  const asset = release.assets.find((entry) => entry.name === file.name);
  if (asset) {
    let digest = asset.digest;
    if (!digest) {
      const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(30_000) });
      assert(response.ok, "Could not verify an existing release asset");
      digest = "sha256:" + createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    }
    assert.equal(digest, `sha256:${file.sha256}`, `Existing release asset differs: ${file.name}`);
  } else gh("release", "upload", tag, file.path);
}
if (release.draft) gh("release", "edit", tag, "--draft=false");
console.log(`GitHub release ${tag} has all verified archives and checksums.`);
