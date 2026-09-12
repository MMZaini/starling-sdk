import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const url = "https://developer.starlingbank.com/api/openapi.json";
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Spec download failed: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const spec = JSON.parse(bytes.toString("utf8"));
if (!spec.openapi?.startsWith("3.") || !spec.paths || !spec.components?.schemas) {
  throw new Error("The upstream response is not the expected OpenAPI document");
}
await mkdir("openapi", { recursive: true });
const previous = await readFile("openapi/starling.json").catch(() => null);
if (previous?.equals(bytes)) {
  console.log("The upstream specification is unchanged.");
} else {
  await writeFile("openapi/starling.json", bytes);
  await writeFile("openapi/source.json", JSON.stringify({
    url, retrievedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }, null, 2) + "\n");
  console.log("Updated the upstream specification. Run npm run spec:check before generation.");
}
