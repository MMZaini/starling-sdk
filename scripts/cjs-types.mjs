import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packagePath = process.argv[2];
if (packagePath !== "sdks/typescript") throw new Error("Expected the TypeScript SDK package path");
const directory = resolve(root, packagePath, "dist");
for (const entry of await readdir(directory, { recursive: true })) {
  if (!entry.endsWith(".d.ts")) continue;
  const source = resolve(directory, entry);
  const destination = source.replace(/\.d\.ts$/, ".d.cts");
  if (!source.startsWith(directory + sep) || !destination.startsWith(directory + sep)) throw new Error("Declaration output escaped dist");
  const content = await readFile(source, "utf8");
  const commonjs = content.replace(/(from\s+["']|import\s*\(\s*["'])(\.[^"']+)\.js(?=["'])/g, "$1$2.cjs");
  await writeFile(destination, commonjs);
}
