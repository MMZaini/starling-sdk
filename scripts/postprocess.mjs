import { readFile, writeFile, readdir } from "node:fs/promises";

// Small, checked patches for generator defects. Fail when upstream output changes
// so an upgrade cannot silently leave a partially applied fix.
export async function postprocess(group) {
  if (group === "python") {
    const directory = "sdks/python/src/starling_bank/generated";
    let optionalResponses = 0;
    const unsafeEmpty = "if _response is None or not _response.text.strip():";
    const safeEmpty = "if 200 <= _response.status_code < 300 and not _response.text.strip():";
    for (const entry of await readdir(directory, { recursive: true })) {
      if (!entry.endsWith(".py")) continue;
      const path = `${directory}/${entry}`;
      let source = await readFile(path, "utf8");
      if (source.includes(unsafeEmpty)) source = source.replaceAll(unsafeEmpty, safeEmpty);
      optionalResponses += source.split(safeEmpty).length - 1;
      await writeFile(path, source.trimEnd() + "\n");
    }
    if (optionalResponses !== 2) throw new Error("Review the Python optional-body status patch after changing Fern or response schemas");
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
  const parserPath = "sdks/typescript/src/generated/core/fetcher/getResponseBody.ts";
  let parser = await readFile(parserPath, "utf8");
  const invalidJson = "export class InvalidJsonResponseError";
  if (!parser.includes(invalidJson)) {
    const before = `        } catch (_err) {
            return {
                ok: false,
                error: {
                    reason: "non-json",
                    statusCode: response.status,
                    rawBody: text,
                },
            };
        }`;
    if (parser.split(before).length !== 2) throw new Error("Review the invalid JSON response patch after upgrading Fern");
    parser = parser.replace(before, `        } catch (_err) {
            throw new InvalidJsonResponseError(response, text);
        }`);
    parser += `\nexport class InvalidJsonResponseError extends Error {
    constructor(public readonly response: Response, public readonly rawBody: string) {
        super("Starling returned invalid JSON");
    }
}\n`;
    await writeFile(parserPath, parser);
  }
  const fetcherPath = "sdks/typescript/src/generated/core/fetcher/Fetcher.ts";
  let fetcher = await readFile(fetcherPath, "utf8");
  if (!fetcher.includes("error instanceof InvalidJsonResponseError")) {
    const status = "response.status >= 200 && response.status < 400";
    const caught = "    } catch (error) {\n        if (args.abortSignal?.aborted) {";
    const imported = 'import { getResponseBody } from "./getResponseBody.js";';
    for (const marker of [status, caught, imported]) {
      if (fetcher.split(marker).length !== 2) throw new Error("Review the response status/parser patch after upgrading Fern");
    }
    fetcher = fetcher.replace(status, "response.status >= 200 && response.status < 300")
      .replace(imported, 'import { getResponseBody, InvalidJsonResponseError } from "./getResponseBody.js";')
      .replace(caught, `    } catch (error) {
        if (error instanceof InvalidJsonResponseError) {
            return {
                ok: false,
                error: { reason: "non-json", statusCode: error.response.status, rawBody: error.rawBody },
                rawResponse: toRawResponse(error.response),
            };
        }
        if (args.abortSignal?.aborted) {`);
    await writeFile(fetcherPath, fetcher);
  }
  const feedPath = "sdks/typescript/src/generated/api/resources/feed/client/Client.ts";
  let feed = await readFile(feedPath, "utf8");
  const emptyBody = "data: _response.body as string | null";
  const normalizedBody = "data: (_response.body ?? null) as string | null";
  if (!feed.includes(normalizedBody)) {
    if (feed.split(emptyBody).length !== 2) throw new Error("Review the TypeScript nullable upload response patch after changing Fern or response schemas");
    feed = feed.replace(emptyBody, normalizedBody);
    await writeFile(feedPath, feed);
  }
}
