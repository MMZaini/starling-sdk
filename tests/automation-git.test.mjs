import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compareSpecs } from "../scripts/spec-diff.mjs";
import { specReleaseSummary } from "../scripts/bump-version.mjs";
import { checkPublishSource } from "../scripts/check-publish-source.mjs";

const script = fileURLToPath(new URL("../scripts/spec-update-git.mjs", import.meta.url));
const bump = fileURLToPath(new URL("../scripts/bump-version.mjs", import.meta.url));
const releaseScript = fileURLToPath(new URL("../scripts/github-release.mjs", import.meta.url));
const options = { skip: process.platform === "win32" ? "Exercises the Linux GitHub runner; run through WSL locally" : false };

async function fixture(t, unexpected = false) {
  const directory = await mkdtemp(join(tmpdir(), "starling-automation-test-"));
  t.after(async () => {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes("starling-automation-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  const checkout = join(directory, "checkout");
  const bin = join(directory, "bin");
  await mkdir(checkout);
  await mkdir(bin);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: "", GITHUB_TOKEN: "",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "MMZaini", GIT_COMMITTER_NAME: "MMZaini",
    GIT_AUTHOR_EMAIL: "mahdizainipro@gmail.com", GIT_COMMITTER_EMAIL: "mahdizainipro@gmail.com",
    GITHUB_REPOSITORY: "MMZaini/starling-sdk", GITHUB_RUN_ID: "fixture", GITHUB_OUTPUT: join(checkout, "artifacts/output"),
    STARLING_TEST_STATE: join(directory, "github.json"),
  };
  const run = (command, args) => execFileSync(command, args, { cwd: checkout, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const git = (...args) => run("git", args);
  const put = async (path, value) => { const file = join(checkout, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, value); };
  await writeFile(join(bin, "gh"), `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
const path = process.env.STARLING_TEST_STATE;
const args = process.argv.slice(2);
const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const git = (...values) => execFileSync("git", values, { encoding: "utf8" }).trim();
if (args[0] === "pr" && args[1] === "list") console.log(JSON.stringify(state.pr ? [state.pr] : []));
else if (args[0] === "pr" && args[1] === "create") {
  state.pr = { number: 1, url: "https://github.com/MMZaini/starling-sdk/pull/1", state: "OPEN", baseRefName: "main", isDraft: args.includes("--draft"), headRefName: args[args.indexOf("--head") + 1], headRefOid: git("rev-parse", "HEAD") };
  writeFileSync(path, JSON.stringify(state));
  console.log(state.pr.url);
} else if (args[0] === "pr" && args[1] === "view") console.log(JSON.stringify(state.pr));
else if (args[0] === "workflow" && args[1] === "run") { state.dispatch = args; writeFileSync(path, JSON.stringify(state)); }
else if (args[0] === "api" && args.at(-1).includes("/releases?")) {
  state.listRequests = (state.listRequests ?? 0) + 1; writeFileSync(path, JSON.stringify(state));
  console.log(JSON.stringify([state.release ? [state.release] : []]));
} else if (args[0] === "api" && args.includes("POST") && args.some((value) => value.endsWith("/releases"))) {
  const payload = JSON.parse(readFileSync(args[args.indexOf("--input") + 1], "utf8"));
  state.release = { id: 1, tag_name: payload.tag_name, draft: true, assets: [] }; writeFileSync(path, JSON.stringify(state));
  console.log(JSON.stringify(state.release));
} else if (args[0] === "api" && args.some((value) => value.startsWith("https://uploads.github.com/"))) {
  const file = args[args.indexOf("--input") + 1];
  state.release.assets.push({ name: basename(file), digest: "sha256:" + createHash("sha256").update(readFileSync(file)).digest("hex") });
  state.uploads = (state.uploads ?? 0) + 1; writeFileSync(path, JSON.stringify(state));
} else if (args[0] === "api" && args.includes("PATCH")) {
  state.release.draft = false; writeFileSync(path, JSON.stringify(state));
}
else { console.error("Unexpected GitHub command", args); process.exit(1); }
`);
  await chmod(join(bin, "gh"), 0o755);
  git("init", "--quiet", "--initial-branch=main");
  git("init", "--bare", "--quiet", join(directory, "remote.git"));
  git("remote", "add", "origin", join(directory, "remote.git"));
  const before = { openapi: "3.0.1", info: { title: "Fixture", version: "1" }, paths: {}, components: { schemas: {} } };
  await put(".gitignore", "artifacts/\n");
  await put("openapi/starling.json", JSON.stringify(before));
  for (const path of ["sdks/typescript", "packages/react"]) {
    await put(`${path}/package.json`, JSON.stringify({ version: "0.1.0" }));
    await put(`${path}/package-lock.json`, JSON.stringify({ version: "0.1.0", packages: { "": { version: "0.1.0" } } }));
  }
  await put("sdks/python/pyproject.toml", '[project]\nversion = "0.1.0"\n');
  await put("CHANGELOG.md", "# Changelog\n\n## 0.1.0\n\n- Initial version.\n");
  await put("scripts/untouched.mjs", "// Original helper.\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Create the fixture");
  git("push", "--quiet", "origin", "main");
  const base = git("rev-parse", "HEAD");
  const after = structuredClone(before);
  after.info.description = "Updated documentation";
  await put("openapi/starling.json", JSON.stringify(after));
  run(process.execPath, [bump, "patch", specReleaseSummary("documentation")]);
  if (unexpected) await put("scripts/untouched.mjs", "// A change outside generated output.\n");
  const report = { ...compareSpecs(before, after), base, automatic: true, version: "0.1.1",
    specSha: createHash("sha256").update(JSON.stringify(after)).digest("hex") };
  await put("artifacts/spec-update/report.json", JSON.stringify(report));
  // Keep the exact patch newline; run() intentionally trims normal command output.
  await put("artifacts/spec-update/update.patch", execFileSync("git", ["diff", "--binary"], { cwd: checkout, env }));
  git("restore", ".");
  return { checkout, env, git, run, put, base };
}

test("proposes, tests an exact head, merges as the owner and dispatches the version tag", options, async (t) => {
  const f = await fixture(t);
  f.run(process.execPath, [script, "propose"]);
  const { pr } = JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8"));
  assert(!pr.isDraft);
  assert.equal(f.git("show", "-s", "--format=%an <%ae>|%cn <%ce>", pr.headRefOid), "MMZaini <mahdizainipro@gmail.com>|MMZaini <mahdizainipro@gmail.com>");
  f.env.UPDATE_PR = "1";
  f.env.UPDATE_HEAD = "0".repeat(40);
  const stale = spawnSync(process.execPath, [script, "merge"], { cwd: f.checkout, env: f.env, encoding: "utf8" });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /tested PR changed/);
  assert.equal(f.git("rev-parse", "origin/main"), f.base);
  f.env.UPDATE_HEAD = pr.headRefOid;
  f.run(process.execPath, [script, "merge"]);
  assert.equal(f.git("rev-parse", "v0.1.1^{commit}"), f.git("rev-parse", "origin/main"));
  assert.equal(f.git("diff", pr.headRefOid, "origin/main"), "");
  assert.equal(f.git("show", "-s", "--format=%an|%cn", "origin/main"), "MMZaini|MMZaini");
  const state = JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8"));
  assert.deepEqual(state.dispatch, ["workflow", "run", "release.yml", "--ref", "v0.1.1"]);
});

test("never merges a tested update over a newer main commit", options, async (t) => {
  const f = await fixture(t);
  f.run(process.execPath, [script, "propose"]);
  const { pr } = JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8"));
  f.git("switch", "main");
  await f.put("README.md", "A separate improvement.\n");
  f.git("add", "README.md");
  f.git("commit", "--quiet", "-m", "Improve the fixture");
  f.git("push", "origin", "main");
  const current = f.git("rev-parse", "HEAD");
  const result = spawnSync(process.execPath, [script, "merge"], { cwd: f.checkout, env: { ...f.env, UPDATE_PR: "1", UPDATE_HEAD: pr.headRefOid }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Main changed during CI/);
  assert.equal(f.git("rev-parse", "origin/main"), current);
  assert.equal(f.git("tag", "--list"), "");
});

test("refuses generated patches that touch helpers or workflow code", options, async (t) => {
  const f = await fixture(t, true);
  const result = spawnSync(process.execPath, [script, "propose"], { cwd: f.checkout, env: f.env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside its allowed paths/);
  assert.equal(f.git("ls-remote", "--heads", "origin").split("\n").length, 1);
});

test("publication rejects stale archives and uncommitted source", options, async (t) => {
  const f = await fixture(t);
  const previous = process.cwd();
  try {
    process.chdir(f.checkout);
    checkPublishSource({ commit: f.base, version: "0.1.0" });
    assert.throws(() => checkPublishSource({ commit: "0".repeat(40), version: "0.1.0" }), /different commit/);
    assert.throws(() => checkPublishSource({ commit: f.base, version: "0.1.1" }), /version/);
    await f.put("uncommitted.txt", "A local change.\n");
    assert.throws(() => checkPublishSource({ commit: f.base, version: "0.1.0" }), /Commit source changes/);
  } finally { process.chdir(previous); }
});

test("release uploads resume missing files and refuse different existing bytes", options, async (t) => {
  const f = await fixture(t);
  f.env.RELEASE_TAG = "v0.1.0";
  f.git("tag", "v0.1.0");
  f.git("push", "origin", "v0.1.0");
  const archive = "Fixture archive bytes";
  await f.put("artifacts/npm/fixture.tgz", archive);
  await f.put("artifacts/manifest.json", JSON.stringify({ commit: f.base, version: "0.1.0", files: [{ path: "npm/fixture.tgz", sha256: createHash("sha256").update(archive).digest("hex") }] }));
  f.run(process.execPath, [releaseScript]);
  let state = JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8"));
  assert.equal(state.release.draft, false);
  assert.equal(state.uploads, 2);
  assert.equal(state.listRequests, 1, "Creation must not depend on the release index updating immediately");
  state.release.assets = state.release.assets.filter((asset) => asset.name !== "SHA256SUMS");
  state.release.draft = true;
  await writeFile(f.env.STARLING_TEST_STATE, JSON.stringify(state));
  f.run(process.execPath, [releaseScript]);
  state = JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8"));
  assert.equal(state.uploads, 3);
  assert.equal(state.release.draft, false);
  state.release.assets[0].digest = "sha256:" + "0".repeat(64);
  await writeFile(f.env.STARLING_TEST_STATE, JSON.stringify(state));
  const result = spawnSync(process.execPath, [releaseScript], { cwd: f.checkout, env: f.env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Existing release asset differs/);
  assert.equal(JSON.parse(await readFile(f.env.STARLING_TEST_STATE, "utf8")).uploads, 3);
});
