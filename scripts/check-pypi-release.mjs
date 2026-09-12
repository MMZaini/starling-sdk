import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const manifest = JSON.parse(await readFile("artifacts/manifest.json", "utf8"));
const response = await fetch(`https://pypi.org/pypi/starling-bank-sdk/${manifest.version}/json`);
assert(response.ok || response.status === 404, "Could not check PyPI");
const published = response.ok ? await response.json() : undefined;
for (const file of manifest.files.filter((entry) => entry.registry === "pypi")) {
  const path = resolve("artifacts", file.path);
  assert(path.startsWith(resolve("artifacts/pypi") + sep));
  assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), file.sha256);
  const existing = published?.urls?.find((entry) => entry.filename === basename(file.path));
  if (existing) assert.equal(existing.digests?.sha256, file.sha256, "Published PyPI bytes differ");
}
console.log("PyPI artifact checksums verified.");
