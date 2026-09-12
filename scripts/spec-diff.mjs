import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const key = (path) => JSON.stringify(path);
const canonical = (name) => name.replace(/[^a-z0-9]/gi, "").toLowerCase();

function schemaLocations(spec) {
  const locations = new Map();
  function visit(schema, path) {
    if (!object(schema)) return;
    locations.set(key(path), schema);
    for (const [name, child] of Object.entries(schema.properties ?? {})) visit(child, [...path, "properties", name]);
    for (const name of ["items", "additionalProperties", "not"]) visit(schema[name], [...path, name]);
    for (const name of ["allOf", "oneOf", "anyOf"]) {
      if (Array.isArray(schema[name])) schema[name].forEach((child, index) => visit(child, [...path, name, String(index)]));
    }
  }
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) visit(schema, ["components", "schemas", name]);
  return locations;
}

function inputSchemas(spec) {
  const names = new Set();
  const visited = new Set();
  function scan(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/") && !visited.has(value.$ref)) {
      visited.add(value.$ref);
      const path = value.$ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
      if (path[0] === "components" && path[1] === "schemas") names.add(path[2]);
      scan(path.reduce((parent, part) => parent?.[part], spec));
    }
    for (const child of Object.values(value)) scan(child);
  }
  for (const path of Object.values(spec.paths ?? {})) {
    scan(path.parameters);
    for (const operation of Object.values(path)) {
      scan(operation?.parameters);
      scan(operation?.requestBody);
    }
  }
  scan(spec.components?.parameters);
  scan(spec.components?.requestBodies);
  return names;
}

/** Deliberately conservative: unrecognized changes require review. */
export function compareSpecs(before, after) {
  const oldSchemas = schemaLocations(before);
  const newSchemas = schemaLocations(after);
  const inputs = new Set([...inputSchemas(before), ...inputSchemas(after)]);
  const changes = [];
  const record = (kind, path, reason) => changes.push({ kind, path: "/" + path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/"), reason });
  function documentation(path) {
    const name = path.at(-1);
    const parent = path.slice(0, -1);
    if (path[0] === "info" && path.length === 2) return ["title", "description", "version", "termsOfService", "contact", "license"].includes(name);
    if (path.length === 1 && name === "externalDocs") return true;
    if (oldSchemas.has(key(parent)) || newSchemas.has(key(parent))) return ["description", "title", "example", "examples", "externalDocs"].includes(name);
    const operation = parent[0] === "paths" && /^(get|put|post|delete|patch|head|options)$/.test(parent[2] ?? "");
    if (operation && parent.length === 3) return ["description", "summary", "externalDocs"].includes(name);
    if (operation && parent.length === 5 && parent[3] === "responses") return name === "description";
    return false;
  }
  function walk(oldValue, newValue, path) {
    if (isDeepStrictEqual(oldValue, newValue)) return;
    if (documentation(path)) return record("documentation", path, "Documentation changed");
    if (oldValue === undefined && path.length === 3 && path[0] === "components" && path[1] === "schemas" &&
        /^[A-Za-z][A-Za-z0-9]*$/.test(path[2]) && !Object.keys(after.components?.schemas ?? {}).some((name) => name !== path[2] && canonical(name) === canonical(path[2]))) {
      return record("additive", path, "New schema");
    }
    const parent = path.slice(0, -2);
    const oldSchema = oldSchemas.get(key(parent));
    const newSchema = newSchemas.get(key(parent));
    if (oldValue === undefined && path.at(-2) === "properties" && oldSchema?.properties && newSchema &&
        !inputs.has(parent[2]) && /^[a-z][A-Za-z0-9]*$/.test(path.at(-1)) &&
        !newSchema.required?.includes(path.at(-1)) &&
        !Object.keys(newSchema.properties).some((name) => name !== path.at(-1) && canonical(name) === canonical(path.at(-1)))) {
      return record("additive", path, "New optional response field");
    }
    if (object(oldValue) && object(newValue)) {
      for (const name of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) walk(oldValue[name], newValue[name], [...path, name]);
    } else record("manual", path, "Existing API contract changed or compatibility is unknown");
  }
  walk(before, after, []);
  const kind = changes.some((change) => change.kind === "manual") ? "manual"
    : changes.some((change) => change.kind === "additive") ? "additive" : changes.length ? "documentation" : "none";
  return { kind, compatible: kind !== "manual", bump: kind === "additive" ? "minor" : "patch", changes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, after, output] = process.argv.slice(2);
  const report = compareSpecs(JSON.parse(await readFile(before, "utf8")), JSON.parse(await readFile(after, "utf8")));
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`${report.kind}: ${report.changes.length} specification changes`);
}
