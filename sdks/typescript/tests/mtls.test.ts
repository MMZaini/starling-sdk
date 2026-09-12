import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import test from "node:test";
import { StarlingEnvironment, StarlingOAuth, OAuthError } from "../src/index.js";

test("exchanges over verified HTTPS with a required client certificate", { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const localPython = `${root}.venv/${process.platform === "win32" ? "Scripts/python.exe" : "bin/python"}`;
  const python = process.env.TEST_PYTHON ?? (existsSync(localPython) ? localPython : "python");
  const server = spawn(python, [`${root}tests/support/tls_server.py`], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = once(server, "exit");
  const lines = createInterface({ input: server.stdout });
  try {
    const first = await Promise.race([once(lines, "line"), exited.then(() => { throw new Error("TLS fixture exited before startup"); })]);
    const config = JSON.parse(first[0]);
    const options = {
      clientId: "client", clientSecret: "secret&=+", redirectUri: "https://localhost/callback",
      environment: StarlingEnvironment.Production, tokenUrl: config.url,
      tls: { cert: readFileSync(config.cert), key: readFileSync(config.key), ca: readFileSync(config.ca) },
    };
    const oauth = new StarlingOAuth(options);
    assert.equal((await oauth.exchangeCode("code")).accessToken, "access-new");
    assert.equal((await oauth.refreshToken("old")).refreshToken, "refresh-new");
    const untrusted = new StarlingOAuth({ ...options, tls: { cert: options.tls.cert, key: options.tls.key } });
    await assert.rejects(untrusted.exchangeCode("code"), (error: unknown) => error instanceof OAuthError && error.code === "network_error");
  } finally {
    lines.close();
    server.stdin.end();
    await exited;
  }
});
