import type { WithRawResponse } from "./generated/core/fetcher/index.js";

/** Read the UUID from a 200 JSON body or an empty 202 response's Location header. */
export function getUploadedAttachmentUid(upload: WithRawResponse<string | null | undefined>): string {
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (![200, 202].includes(upload.rawResponse.status)) throw new Error("Expected a successful attachment upload response");
  if (typeof upload.data === "string" && uuid.test(upload.data)) return upload.data;
  const location = upload.rawResponse.headers.get("Location");
  if (location) {
    const match = /\/attachments\/([^/?#]+)$/.exec(location);
    if (match && uuid.test(match[1])) return match[1];
  }
  throw new Error("The upload response did not contain a valid attachment UUID in its body or Location header");
}
