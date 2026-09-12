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

  // Compile the actual README examples against the installed packages.
  const examples = async (path, language) => [...(await readFile(path, "utf8")).matchAll(/^```([^\r\n]+)\r?\n([\s\S]*?)^```/gm)]
    .filter((match) => language.test(match[1])).map((match) => match[2]).join("\n");
  const docsFixture = {
    "/api/v2/accounts": { accounts: [{ accountUid: "00000000-0000-4000-8000-000000000001", defaultCategory: "00000000-0000-4000-8000-000000000002", currency: "GBP" }] },
    "/api/v2/accounts/00000000-0000-4000-8000-000000000001/balance": { effectiveBalance: { currency: "GBP", minorUnits: 12345 } },
    "/api/v2/feed/account/00000000-0000-4000-8000-000000000001/category/00000000-0000-4000-8000-000000000002/paginated-transactions": { feedItems: [{ feedItemUid: "00000000-0000-4000-8000-000000000003" }], links: {} },
  };
  await writeFile(join(temporary, "docs-fixture.json"), JSON.stringify(docsFixture));
  await writeFile(join(temporary, "docs-bootstrap.mjs"), `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("./docs-fixture.json", import.meta.url), "utf8"));
process.env.STARLING_ACCESS_TOKEN = "documentation-fixture";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://api-sandbox.starlingbank.com");
  assert.equal(init.method, "GET");
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer documentation-fixture");
  assert(fixture[url.pathname], "Unexpected documentation request: " + url.pathname);
  return Response.json(fixture[url.pathname]);
};\n`);
  for (const [name, path] of [["root", "README.md"], ["typescript", "sdks/typescript/README.md"]]) {
    const source = await examples(path, /^(ts|typescript)$/);
    assert(source.includes("StarlingClient"), `No TypeScript quick start found in ${path}`);
    await writeFile(join(temporary, `${name}.mts`), source);
    run(process.execPath, [resolve("sdks/typescript/node_modules/typescript/bin/tsc"), "--strict", "--skipLibCheck", "false", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--outDir", "docs-out", `${name}.mts`]);
    run(process.execPath, ["--import", "./docs-bootstrap.mjs", `docs-out/${name}.mjs`]);
  }

  const localPython = resolve(`.venv/${process.platform === "win32" ? "Scripts/python.exe" : "bin/python"}`);
  const python = process.env.BUILD_PYTHON ?? (existsSync(localPython) ? localPython : "python");
  run(python, [resolve("scripts/check-python-archives.py"), resolve("artifacts/manifest.json")]);
  run(python, ["-m", "venv", join(temporary, "venv")]);
  const isolated = join(temporary, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const wheel = manifest.files.find((file) => file.path.endsWith(".whl"));
  run(isolated, ["-m", "pip", "install", "--disable-pip-version-check", resolve("artifacts", wheel.path)]);
  run(isolated, ["-m", "pip", "check"]);
  run(isolated, [resolve("scripts/check-wheel.py")], { env: { ...process.env, PYTHONPATH: "", PYTHONNOUSERSITE: "1" } });
  const pythonBootstrap = `import json, os, httpx
from pathlib import Path
fixture = json.loads(Path("docs-fixture.json").read_text(encoding="utf-8"))
os.environ["STARLING_ACCESS_TOKEN"] = "documentation-fixture"
def send(self, request, **kwargs):
    assert request.url.scheme == "https" and request.url.host == "api-sandbox.starlingbank.com"
    assert request.method == "GET"
    assert request.headers["Authorization"] == "Bearer documentation-fixture"
    return httpx.Response(200, json=fixture[request.url.path], request=request)
async def async_send(self, request, **kwargs):
    return send(self, request, **kwargs)
httpx.Client.send = send
httpx.AsyncClient.send = async_send
`;
  for (const [name, path] of [["root", "README.md"], ["python", "sdks/python/README.md"]]) {
    const source = await examples(path, /^python$/);
    assert(source.includes("StarlingClient"), `No Python quick start found in ${path}`);
    await writeFile(join(temporary, `${name}.py`), pythonBootstrap + "\n" + source);
    run(isolated, [`${name}.py`], { env: { ...process.env, PYTHONPATH: "", PYTHONNOUSERSITE: "1" } });
  }
  const sdist = manifest.files.find((file) => file.registry === "pypi" && file.path.endsWith(".tar.gz"));
  run(python, ["-m", "venv", join(temporary, "sdist-venv")]);
  const sdistPython = join(temporary, "sdist-venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  run(sdistPython, ["-m", "pip", "install", "--disable-pip-version-check", resolve("artifacts", sdist.path)]);
  run(sdistPython, ["-m", "pip", "check"]);
  run(sdistPython, [resolve("scripts/check-wheel.py")], { env: { ...process.env, PYTHONPATH: "", PYTHONNOUSERSITE: "1" } });
} finally {
  const target = resolve(temporary);
  assert(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1).startsWith("starling-package-check-"));
  await rm(target, { recursive: true, force: true });
}
console.log("Release artifacts passed isolated installation checks.");
