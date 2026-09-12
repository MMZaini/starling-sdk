import { spawnSync } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { postprocess } from "./postprocess.mjs";

const groups = process.argv.slice(2);
if (!groups.length) groups.push("typescript", "python");
if (groups.some((group) => !["typescript", "python"].includes(group))) throw new Error("Expected typescript or python");
const version = JSON.parse(await readFile("fern/fern.config.json", "utf8")).version;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result;
};
run(process.execPath, ["scripts/check-spec.mjs"], { stdio: "inherit" });
run("docker", ["info"], { stdio: "ignore" });
const cli = resolve("node_modules/fern-api/cli.cjs");
for (const group of groups) {
  console.log(`Generating ${group} with Fern ${version}`);
  const result = run(process.execPath, [cli, "generate", "--local", "--force", "--group", group], {
    env: { ...process.env, FERN_NO_VERSION_REDIRECTION: "true" },
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (/Failed|Generator failed/i.test(result.stdout + result.stderr)) throw new Error("Fern reported a generator failure");
  const path = group === "typescript" ? "sdks/typescript/src/generated" : "sdks/python/src/starling_bank/generated";
  const files = await readdir(path);
  if (!files.length) throw new Error(`Fern produced no source in ${path}`);
  await rm(`${path}/.fern-metadata.json`, { force: true });
  for (const name of ["README.md", "CONTRIBUTING.md", "reference.md", "tests", ".fern"]) {
    const target = resolve(path, name);
    if (!target.startsWith(resolve(path) + (process.platform === "win32" ? "\\" : "/"))) {
      throw new Error("Generation cleanup escaped the output directory");
    }
    await rm(target, { recursive: true, force: true });
  }
  await postprocess(group);
}
