import { setTimeout as delay } from "node:timers/promises";
import { fetcher, unknownRawResponse, type FetchFunction, type Fetcher } from "./generated/core/fetcher/index.js";

function retryDelay(headers: Headers, attempt: number): number {
  const value = headers.get("Retry-After");
  if (value) {
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.min(1000 * 2 ** attempt, 60000) * (0.9 + Math.random() * 0.2);
}

/** One deadline covers retries and buffered responses. Only reads retry. */
export const requestWithDeadline: FetchFunction = async <R>(args: Fetcher.Args) => {
  const retries = ["GET", "HEAD", "OPTIONS"].includes(args.method.toUpperCase()) ? (args.maxRetries ?? 2) : 0;
  if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("maxRetries must be a non-negative integer");
  const milliseconds = args.timeoutMs ?? 60000;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 2147483647) throw new RangeError("Request timeout must be positive and at most 2147483647 milliseconds");
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DOMException("Request deadline exceeded", "TimeoutError")), milliseconds);
  const signal = args.abortSignal ? AbortSignal.any([args.abortSignal, deadline.signal]) : deadline.signal;
  const aborted = () => ({ ok: false as const, error: args.abortSignal?.aborted
    ? { reason: "unknown" as const, errorMessage: "The user aborted a request", cause: args.abortSignal.reason }
    : { reason: "timeout" as const, cause: deadline.signal.reason }, rawResponse: unknownRawResponse });
  try {
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) return aborted();
      const response = await fetcher<R>({ ...args, timeoutMs: undefined, maxRetries: 0, abortSignal: signal });
      if (signal.aborted) return aborted();
      if (response.ok || response.error.reason !== "status-code" || attempt >= retries ||
          !([408, 429].includes(response.error.statusCode) || response.error.statusCode >= 500)) return response;
      const wait = retryDelay(response.rawResponse.headers, attempt);
      // A Retry-After beyond the remaining deadline is interrupted by that deadline.
      await delay(Math.min(wait, 2147483647), undefined, { signal });
    }
  } catch (error) {
    if (signal.aborted) return aborted();
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
