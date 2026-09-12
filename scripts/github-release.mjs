import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
// Listing with write access includes drafts; the tag endpoint documents published releases only.
const endpoint = `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`;
const findRelease = () => JSON.parse(gh("api", "--paginate", "--slurp", endpoint)).flat().find((entry) => entry.tag_name === tag);
let release = findRelease();
if (!release) {
  execFileSync("git", ["ls-remote", "--exit-code", "origin", `refs/tags/${tag}`], { stdio: "pipe" });
  await writeFile("artifacts/release/payload.json", JSON.stringify({
    tag_name: tag, target_commitish: manifest.commit, name: tag,
    body: await readFile("artifacts/release/notes.md", "utf8"), draft: true,
  }));
  // Use the creation response: a new draft can take time to appear in the release index.
  release = JSON.parse(gh("api", "--method", "POST", `repos/${process.env.GITHUB_REPOSITORY}/releases`, "--input", "artifacts/release/payload.json"));
}
assert(Number.isSafeInteger(release.id), "Expected a GitHub release ID");
assert.equal(release.tag_name, tag);
for (const file of files) {
  const asset = release.assets.find((entry) => entry.name === file.name);
  if (asset) {
    let digest = asset.digest;
    if (!digest) {
      const bytes = execFileSync("gh", ["api", "--header", "Accept: application/octet-stream", `repos/${process.env.GITHUB_REPOSITORY}/releases/assets/${asset.id}`], { maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
      digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    }
    assert.equal(digest, `sha256:${file.sha256}`, `Existing release asset differs: ${file.name}`);
  } else gh("api", "--method", "POST", `https://uploads.github.com/repos/${process.env.GITHUB_REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`,
    "--header", "Content-Type: application/octet-stream", "--input", file.path);
}
if (release.draft) gh("api", "--method", "PATCH", `repos/${process.env.GITHUB_REPOSITORY}/releases/${release.id}`, "--field", "draft=false");
console.log(`GitHub release ${tag} has all verified archives and checksums.`);
