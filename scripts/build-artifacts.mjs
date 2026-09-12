import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const npmCli = process.env.npm_execpath;
assert(npmCli, "Run npm run build:artifacts");
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", ...options });
const npm = (args, options) => run(process.execPath, [npmCli, ...args], options);
const localPython = resolve(`.venv/${process.platform === "win32" ? "Scripts/python.exe" : "bin/python"}`);
const python = process.env.BUILD_PYTHON ?? (existsSync(localPython) ? localPython : "python");
const sdk = JSON.parse(await readFile("sdks/typescript/package.json", "utf8"));
const react = JSON.parse(await readFile("packages/react/package.json", "utf8"));
const pyproject = await readFile("sdks/python/pyproject.toml", "utf8");
const pythonVersion = /^version = "([^"]+)"$/m.exec(pyproject)?.[1];
assert.equal(sdk.version, react.version);
assert.equal(sdk.version, pythonVersion);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const epoch = execFileSync("git", ["log", "-1", "--format=%ct"], { encoding: "utf8" }).trim();
await mkdir("artifacts/npm", { recursive: true });
await mkdir("artifacts/pypi", { recursive: true });
const files = [];
for (const [directory, metadata] of [["sdks/typescript", sdk], ["packages/react", react]]) {
  npm(["--prefix", directory, "run", "build"]);
  const result = JSON.parse(npm(["pack", "--json", "--ignore-scripts", "--pack-destination", resolve("artifacts/npm")], { cwd: directory, encoding: "utf8", stdio: "pipe" }))[0];
  assert.equal(result.name, metadata.name);
  assert.equal(result.version, sdk.version);
  for (const entry of result.files) {
    assert(/^(dist\/|README\.md$|LICENSE$|package\.json$|styles\.css$)/.test(entry.path), `Unexpected npm file: ${entry.path}`);
    assert(!/(^|\/)(\.env|PLAN\.md|node_modules|tests)(\/|$)/i.test(entry.path), `Unexpected npm file: ${entry.path}`);
  }
  files.push({ registry: "npm", name: metadata.name, version: metadata.version, path: `npm/${result.filename}`, integrity: result.integrity });
}
run(python, ["-m", "build", "sdks/python"], { env: { ...process.env, SOURCE_DATE_EPOCH: epoch } });
for (const suffix of ["tar.gz", "whl"]) {
  const filename = `starling_bank_sdk-${sdk.version}${suffix === "whl" ? "-py3-none-any" : ""}.${suffix}`;
  await copyFile(`sdks/python/dist/${filename}`, `artifacts/pypi/${filename}`);
  files.push({ registry: "pypi", name: "starling-bank-sdk", version: sdk.version, path: `pypi/${filename}` });
}
run(python, ["-m", "twine", "check", ...files.filter((file) => file.registry === "pypi").map((file) => `artifacts/${file.path}`)]);
for (const file of files) {
  const bytes = await readFile(`artifacts/${file.path}`);
  file.sha256 = createHash("sha256").update(bytes).digest("hex");
  file.size = bytes.length;
}
await writeFile("artifacts/manifest.json", JSON.stringify({ version: sdk.version, commit, files }, null, 2) + "\n");
await writeFile("artifacts/SHA256SUMS", files.map((file) => `${file.sha256}  ${file.path}`).join("\n") + "\n");
console.log(`Built ${files.length} release files for ${sdk.version}.`);
