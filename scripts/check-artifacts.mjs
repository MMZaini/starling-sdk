import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";

const npmCli = process.env.npm_execpath;
assert(npmCli, "Run npm run check:artifacts");
const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
for (const file of manifest.files) {
  const path = resolve("artifacts", file.path);
  assert(path.startsWith(resolve("artifacts") + sep));
  assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), file.sha256);
}
const temporary = await mkdtemp(join(tmpdir(), "starling-package-check-"));
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: temporary, stdio: "inherit", ...options });
try {
  const dependencies = Object.fromEntries(manifest.files.filter((file) => file.registry === "npm").map((file) => [file.name, `file:${resolve("artifacts", file.path).replaceAll("\\", "/")}`]));
  await writeFile(join(temporary, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { ...dependencies, react: "19.3.0", "react-dom": "19.3.0", "@types/react": "19.3.0", "@types/node": "22.20.2" } }));
  run(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const types = `import { Starling, StarlingClient } from "@mmzaini/starling-sdk";
import { AccountCard, formatMoney } from "@mmzaini/starling-react";
const currency: Starling.AccountV2.Currency = Starling.AccountV2.Currency.Gbp;
const account: Starling.AccountV2 = { currency };
const client = new StarlingClient({ accessToken: "test" });
const response: Promise<Starling.Accounts> = client.accounts.list();
void [account, response, AccountCard, formatMoney];\n`;
  await writeFile(join(temporary, "consumer.mts"), types);
  await writeFile(join(temporary, "consumer.cts"), types);
  run(process.execPath, [resolve("sdks/typescript/node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "false", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.mts", "consumer.cts"]);
  const runtime = `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { StarlingClient, Starling, createOAuthState } from "@mmzaini/starling-sdk";
import { AccountCard } from "@mmzaini/starling-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
assert.equal(typeof require("@mmzaini/starling-sdk").StarlingClient, "function");
assert.equal(typeof require("@mmzaini/starling-react").AccountCard, "function");
assert.equal(Starling.AccountV2.Currency.Gbp, "GBP");
assert.equal(createOAuthState().length, 43);
const client = new StarlingClient({ accessToken: "fixture", fetch: async () => Response.json({ accounts: [] }) });
assert.deepEqual((await client.accounts.list()).accounts, []);
assert(renderToStaticMarkup(createElement(AccountCard, { account: {name: "Fixture"} })).includes("Fixture"));
console.log("Installed npm artifacts passed ESM, CommonJS, public types and rendering checks.");\n`;
  await writeFile(join(temporary, "runtime.mjs"), runtime);
  run(process.execPath, ["runtime.mjs"]);

  const localPython = resolve(`.venv/${process.platform === "win32" ? "Scripts/python.exe" : "bin/python"}`);
  const python = process.env.BUILD_PYTHON ?? (existsSync(localPython) ? localPython : "python");
  run(python, ["-m", "venv", join(temporary, "venv")]);
  const isolated = join(temporary, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const wheel = manifest.files.find((file) => file.path.endsWith(".whl"));
  run(isolated, ["-m", "pip", "install", "--disable-pip-version-check", resolve("artifacts", wheel.path)]);
  run(isolated, ["-m", "pip", "check"]);
  run(isolated, [resolve("scripts/check-wheel.py")], { env: { ...process.env, PYTHONPATH: "", PYTHONNOUSERSITE: "1" } });
} finally {
  const target = resolve(temporary);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1).startsWith("starling-package-check-"));
  await rm(target, { recursive: true, force: true });
}
console.log("Release artifacts passed isolated installation checks.");
