import { readFile, writeFile, readdir } from "node:fs/promises";

// Small, checked patches for generator defects. Fail when upstream output changes
// so an upgrade cannot silently leave a partially applied fix.
export async function postprocess(group) {
  if (group === "python") {
    const directory = "sdks/python/src/starling_bank/generated";
    for (const entry of await readdir(directory, { recursive: true })) {
      if (!entry.endsWith(".py")) continue;
      const path = `${directory}/${entry}`;
      const source = await readFile(path, "utf8");
      await writeFile(path, source.trimEnd() + "\n");
    }
    return;
  }
  const path = "sdks/typescript/src/generated/core/fetcher/makeRequest.ts";
  let source = await readFile(path, "utf8");
  const marker = "// Always release the timeout, including when fetch rejects.";
  if (!source.includes(marker)) {
    const start = "    const response = await fetchFn(url, {";
    const end = "    if (timeoutAbortId != null) {\n        clearTimeout(timeoutAbortId);\n    }\n\n    return response;";
    if (source.split(start).length !== 2 || source.split(end).length !== 2) {
      throw new Error("Review the TypeScript fetch timeout patch after upgrading Fern");
    }
    source = source.replace(start, `${marker}\n    try {\n    const response = await fetchFn(url, {`)
      .replace(end, "    return response;\n    } finally {\n        if (timeoutAbortId != null) clearTimeout(timeoutAbortId);\n    }");
    await writeFile(path, source);
  }
  const requestPath = "sdks/typescript/src/generated/api/resources/payees/client/requests/AddAccountPayeesRequest.ts";
  const requestSource = await readFile(requestPath, "utf8");
  const importLine = 'import type * as Starling from "../../../../index.js";';
  if (!requestSource.includes(importLine)) {
    if (!requestSource.includes("Starling.PayeeAccountCreationRequest.BankIdentifierType")) {
      throw new Error("Review the flattened payee-account enum import patch after upgrading Fern");
    }
    await writeFile(requestPath, importLine + "\n\n" + requestSource);
  }
}
