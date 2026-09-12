import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

/** Publication must use archives built from the checked-out, committed source. */
export function checkPublishSource(manifest) {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  assert.equal(manifest.commit, git("rev-parse", "HEAD"), "Release artifacts were built from a different commit");
  assert.equal(git("status", "--porcelain"), "", "Commit source changes before publishing release artifacts");
  const version = JSON.parse(git("show", "HEAD:sdks/typescript/package.json")).version;
  assert.equal(manifest.version, version, "Release artifact version does not match the source");
}
