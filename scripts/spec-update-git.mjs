import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { compareSpecs } from "./spec-diff.mjs";
import { nextVersion, specReleaseSummary } from "./bump-version.mjs";

const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env: {
  ...process.env, GIT_AUTHOR_NAME: "MMZaini", GIT_AUTHOR_EMAIL: "mahdizainipro@gmail.com",
  GIT_COMMITTER_NAME: "MMZaini", GIT_COMMITTER_EMAIL: "mahdizainipro@gmail.com",
} }).trim();
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);
const output = async (name, value) => appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
const report = JSON.parse(await readFile("artifacts/spec-update/report.json", "utf8"));
assert(/^[a-f0-9]{40}$/.test(report.base));
assert(/^[a-f0-9]{64}$/.test(report.specSha));
assert(process.env.GITHUB_REPOSITORY === "MMZaini/starling-sdk", "Configure the repository and commit identity before using this workflow in a fork");
const branch = `automation/spec-${report.specSha.slice(0, 12)}-${report.base.slice(0, 7)}`;
const permitted = (path) => /^(openapi\/(starling\.json|source\.json|operations\.json)|docs\/naming-map\.md|CHANGELOG\.md|sdks\/typescript\/(package(-lock)?\.json|src\/generated\/.+|src\/metadata\/signed-routes\.ts)|sdks\/python\/(pyproject\.toml|src\/starling_bank\/generated\/.+|src\/starling_bank\/metadata\/(__init__|signed_routes)\.py)|packages\/react\/package(-lock)?\.json)$/.test(path);

function checkChanges(args) {
  const paths = git("diff", ...args, "--name-only", "-z").split("\0").filter(Boolean);
  assert(paths.length && paths.every(permitted), "The generated update changed files outside its allowed paths");
  for (const path of paths) {
    const entry = git("ls-files", "--stage", "--", path);
    assert(!entry || entry.startsWith("100644 ") || entry.startsWith("100755 "), "Unexpected symlink or submodule in generated output");
  }
}

async function checkVersionChanges(version) {
  for (const directory of ["sdks/typescript", "packages/react"]) {
    for (const name of ["package.json", "package-lock.json"]) {
      const path = `${directory}/${name}`;
      const before = JSON.parse(git("show", `${report.base}:${path}`));
      const after = JSON.parse(await readFile(path, "utf8"));
      assert.equal(after.version, version);
      after.version = before.version;
      if (after.packages?.[""]) {
        assert.equal(after.packages[""].version, version);
        after.packages[""].version = before.packages[""].version;
      }
      assert.deepEqual(after, before, "Automatic releases may only change package versions, not dependencies or configuration");
    }
  }
  const path = "sdks/python/pyproject.toml";
  const before = git("show", `${report.base}:${path}`);
  const after = (await readFile(path, "utf8")).trim();
  assert.equal(after, before.replace(/^version = "[^"]+"$/m, `version = "${version}"`));
  const changelog = git("show", `${report.base}:CHANGELOG.md`);
  const expected = report.version ? changelog.replace(/^# Changelog\n+/, `# Changelog\n\n## ${version}\n\n- ${specReleaseSummary(report.kind)}\n\n`) : changelog;
  assert.equal((await readFile("CHANGELOG.md", "utf8")).trim(), expected.trim());
}

if (process.argv[2] === "propose") {
  assert.equal(git("rev-parse", "HEAD"), report.base);
  const existing = JSON.parse(gh("pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName,headRefOid,isDraft,url"));
  const draft = existing.find((pr) => pr.isDraft && pr.headRefName.startsWith(`automation/spec-${report.specSha.slice(0, 12)}-`));
  if (draft) {
    console.log(`This snapshot already needs review: ${draft.url}`);
    await output("head", "");
  } else {
    let pr = existing.find((entry) => entry.headRefName === branch);
    let head;
    if (pr) {
      git("fetch", "origin", `refs/heads/${branch}`);
      head = git("rev-parse", "FETCH_HEAD");
      assert.equal(head, pr.headRefOid, "The update branch changed; retry the workflow");
      // Never reset or overwrite an existing branch, including a contributor's edits.
    } else {
      assert.equal(git("status", "--porcelain"), "", "Expected a clean checkout");
      const remote = git("ls-remote", "--heads", "origin", `refs/heads/${branch}`);
      if (remote) {
        // Resume a run that pushed its branch but failed before creating the PR.
        git("fetch", "origin", `refs/heads/${branch}`);
        head = git("rev-parse", "FETCH_HEAD");
        git("switch", "--detach", head);
        checkChanges([`${report.base}...HEAD`]);
      } else {
        git("switch", "-c", branch);
        git("apply", "--index", "artifacts/spec-update/update.patch");
        checkChanges(["--cached"]);
        git("diff", "--cached", "--check");
        git("commit", "--quiet", "-m", "Update the Starling API specification");
        head = git("rev-parse", "HEAD");
        git("push", "origin", `HEAD:refs/heads/${branch}`);
      }
      const detail = report.changes.slice(0, 30).map((change) => `- ${change.reason}: ${JSON.stringify(change.path)}`).join("\n");
      const body = `Update the official Starling OpenAPI snapshot and regenerate both clients.\n\n${report.automatic
        ? `Classified as ${report.kind}. The full CI matrix must pass before this workflow merges the update${report.version ? ` and publishes ${report.version}` : ""}.`
        : "This change requires manual review. Resolve the reported compatibility or generation failures before preparing a release."}\n\n${detail}\n\n[Workflow checks](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})\n`;
      await writeFile("artifacts/spec-update/pr-body.md", body);
      const url = gh("pr", "create", "--base", "main", "--head", branch, "--title", "Update the Starling API specification", "--body-file", "artifacts/spec-update/pr-body.md", ...(report.automatic ? [] : ["--draft"]));
      pr = JSON.parse(gh("pr", "view", url, "--json", "number,url"));
    }
    await output("head", head);
    await output("pull_request", pr.number);
    console.log(pr.url);
  }
} else if (process.argv[2] === "merge") {
  assert(report.automatic === true, "Only compatible, generated updates may merge automatically");
  const head = process.env.UPDATE_HEAD;
  assert(/^[a-f0-9]{40}$/.test(head));
  const pr = JSON.parse(gh("pr", "view", process.env.UPDATE_PR, "--json", "state,isDraft,headRefOid,baseRefName,mergeCommit"));
  assert.equal(pr.baseRefName, "main");
  assert.equal(pr.headRefOid, head, "The tested PR changed; refusing to merge it");
  assert(!pr.isDraft);
  git("fetch", "origin", "main", "--tags");
  git("fetch", "origin", `refs/heads/${branch}`);
  let merge;
  if (pr.state === "MERGED") {
    merge = pr.mergeCommit.oid;
    git("merge-base", "--is-ancestor", head, merge);
    git("merge-base", "--is-ancestor", merge, "origin/main");
    git("diff", "--exit-code", head, merge);
  } else {
    assert.equal(pr.state, "OPEN");
    assert.equal(git("rev-parse", "origin/main"), report.base, "Main changed during CI; the next run will prepare an update against the new base");
    assert.equal(git("rev-parse", "FETCH_HEAD"), head);
    git("switch", "--detach", head);
    checkChanges([`${report.base}...HEAD`]);
    assert.equal(git("rev-list", "--count", `${report.base}..HEAD`), "1", "Additional commits on the update branch require manual review");
    assert.equal(git("show", "-s", "--format=%an <%ae>|%cn <%ce>"), "MMZaini <mahdizainipro@gmail.com>|MMZaini <mahdizainipro@gmail.com>");
    const before = JSON.parse(git("show", `${report.base}:openapi/starling.json`));
    const after = JSON.parse(await readFile("openapi/starling.json", "utf8"));
    assert.equal(createHash("sha256").update(await readFile("openapi/starling.json")).digest("hex"), report.specSha);
    const compared = compareSpecs(before, after);
    assert(compared.compatible && compared.kind === report.kind, "Compatibility changed after preparing the update");
    const current = JSON.parse(git("show", `${report.base}:sdks/typescript/package.json`)).version;
    const version = JSON.parse(await readFile("sdks/typescript/package.json", "utf8")).version;
    assert.equal(version, report.version || current);
    if (report.version) assert.equal(version, nextVersion(current, compared.bump));
    await checkVersionChanges(version);
    git("switch", "-C", "main", "origin/main");
    git("merge", "--no-ff", head, "-m", "Merge the Starling specification update");
    git("diff", "--exit-code", head, "HEAD");
    merge = git("rev-parse", "HEAD");
    git("push", "origin", "HEAD:refs/heads/main");
  }
  if (report.version) {
    const tag = `v${report.version}`;
    const existing = git("tag", "--list", tag);
    if (existing) assert.equal(git("rev-parse", `${tag}^{commit}`), merge, "The version tag already points to a different commit");
    else {
      git("tag", "-a", tag, merge, "-m", `Release ${tag}`);
      git("push", "origin", `refs/tags/${tag}`);
    }
    // GITHUB_TOKEN pushes do not trigger another workflow; dispatch the tagged release explicitly.
    gh("workflow", "run", "release.yml", "--ref", tag);
    console.log(`Merged the tested update and dispatched ${tag}.`);
  } else console.log("Merged the formatting-only update; no package release is needed.");
} else throw new Error("Expected propose or merge");
