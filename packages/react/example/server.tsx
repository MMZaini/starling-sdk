import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { StarlingClient, StarlingEnvironment } from "../../../sdks/typescript/dist/index.js";
import { AccountCard } from "../src/index.js";

// Local server example. Add application session authorization before deploying it.
if (!process.env.STARLING_ACCESS_TOKEN) throw new Error("Set STARLING_ACCESS_TOKEN to a sandbox token");
const client = new StarlingClient({ environment: StarlingEnvironment.Sandbox });
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if (!["localhost:3001", "127.0.0.1:3001"].includes(request.headers.host ?? "") || request.url !== "/" || request.method !== "GET") {
    response.writeHead(404).end();
    return;
  }
  try {
    const account = (await client.accounts.list()).accounts?.[0];
    if (!account?.accountUid) throw new Error("No account available");
    const [balance, identifiers] = await Promise.all([
      client.accounts.getBalance({ accountUid: account.accountUid }),
      client.accounts.getIdentifiers({ accountUid: account.accountUid }),
    ]);
    // Only display data reaches React. Tokens and signing credentials stay here.
    const card = renderToStaticMarkup(<AccountCard account={account} balance={balance} identifiers={identifiers} />);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox account</title><style>${styles}body{margin:0;padding:24px;background:#f5f8f8}main{max-width:480px;margin:32px auto;font-family:system-ui}</style></head><body><main><h1>Sandbox account</h1>${card}</main></body></html>`);
  } catch {
    response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load the sandbox account.");
  }
});
server.listen(3001, "127.0.0.1", () => console.log("Sandbox account example: http://127.0.0.1:3001"));
