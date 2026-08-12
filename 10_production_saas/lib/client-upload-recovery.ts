import {
  CLIENT_MUTATION_MAX_RESPONSE_BYTES,
  CLIENT_MUTATION_TIMEOUT_MS,
  ClientMutationOutcomeUnknownError,
} from "./client-mutation-recovery.ts";
import { MEDIA_UPLOAD_CONTENT_TYPE } from "./media-upload-protocol.ts";

type UploadRequestFactory = () => XMLHttpRequest;

const RETRYABLE_UPLOAD_STATUSES = new Set([408, 425, 429]);

// Private-media uploads may legitimately approach 50 MB. Budget their total
// XHR lifetime at a conservative 1 Mbit/s transfer floor, add explicit server
// verification/commit overhead, and retain a hard upper bound so a stalled
// request still becomes outcome-unknown instead of waiting indefinitely.
export const CLIENT_UPLOAD_THROUGHPUT_FLOOR_BYTES_PER_SECOND = 128 * 1024;
export const CLIENT_UPLOAD_SERVER_OVERHEAD_MS = 30_000;
export const CLIENT_UPLOAD_MAX_TIMEOUT_MS = 8 * 60_000;

export function clientMediaUploadTimeoutMs(bodyBytes: number): number {
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 1) {
    throw new RangeError("Client upload size must be a positive safe integer.");
  }
  const transferMs = Math.ceil(
    (bodyBytes * 1_000) /
      CLIENT_UPLOAD_THROUGHPUT_FLOOR_BYTES_PER_SECOND,
  );
  return Math.min(
    CLIENT_UPLOAD_MAX_TIMEOUT_MS,
    CLIENT_UPLOAD_SERVER_OVERHEAD_MS + transferMs,
  );
}

/**
 * Performs one bounded, non-replayed private-media mutation while exposing native
 * upload progress. Any interruption or retryable acknowledgement is treated as
 * outcome-unknown because the server may already have persisted the file.
 */
export function requestClientUpload(
  input: string,
  body: Blob,
  options: {
    onProgress?: (value: number) => void;
    timeoutMs?: number;
    signal?: AbortSignal;
    requestFactory?: UploadRequestFactory;
  } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? CLIENT_MUTATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Client upload timeout must be a positive number.");
  }
  if (!input.startsWith("/")) {
    throw new TypeError("Client uploads require a same-origin absolute path.");
  }
  if (body.type !== MEDIA_UPLOAD_CONTENT_TYPE) {
    throw new TypeError("Client uploads require the Roadmap media envelope.");
  }

  return new Promise((resolve, reject) => {
    const request = (options.requestFactory ?? browserUploadRequest)();
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abortForCaller);
      callback();
    };
    const requestId = () => request.getResponseHeader("x-request-id");
    const rejectUnknown = (
      reason: "timeout" | "transport" | "retryable_response" | "redirected_response" | "response_too_large",
      status: number | null = null,
    ) => {
      settle(() =>
        reject(
          new ClientMutationOutcomeUnknownError(reason, status, requestId()),
        ),
      );
    };
    const abortForCaller = () => {
      request.abort();
      rejectUnknown("transport");
    };

    request.open("POST", input, true);
    request.setRequestHeader("Content-Type", MEDIA_UPLOAD_CONTENT_TYPE);
    request.responseType = "arraybuffer";
    request.timeout = timeoutMs;
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || settled) return;
      options.onProgress?.(
        Math.min(99, Math.max(0, Math.round((event.loaded / event.total) * 100))),
      );
    };
    request.onerror = () => rejectUnknown("transport");
    request.onabort = () => rejectUnknown("transport");
    request.ontimeout = () => rejectUnknown("timeout");
    request.onload = () => {
      const status = request.status;
      if (request.responseURL && request.responseURL !== expectedResponseUrl(input)) {
        rejectUnknown("redirected_response", status || null);
        return;
      }
      if (status === 0) {
        rejectUnknown("transport");
        return;
      }
      if (status >= 500 || RETRYABLE_UPLOAD_STATUSES.has(status)) {
        rejectUnknown("retryable_response", status);
        return;
      }
      const responseBody =
        request.response instanceof ArrayBuffer ? request.response : null;
      if (
        responseBody !== null &&
        responseBody.byteLength > CLIENT_MUTATION_MAX_RESPONSE_BYTES
      ) {
        rejectUnknown("response_too_large", status);
        return;
      }
      const headers = parseResponseHeaders(request.getAllResponseHeaders());
      settle(() =>
        resolve(
          new Response(responseBody, {
            status,
            statusText: request.statusText,
            headers,
          }),
        ),
      );
    };

    if (options.signal?.aborted) {
      abortForCaller();
      return;
    }
    options.signal?.addEventListener("abort", abortForCaller, { once: true });
    request.send(body);
  });
}

function browserUploadRequest(): XMLHttpRequest {
  return new XMLHttpRequest();
}

function expectedResponseUrl(input: string): string {
  const base =
    typeof globalThis.location?.href === "string"
      ? globalThis.location.href
      : "http://client.invalid/";
  return new URL(input, base).href;
}

function parseResponseHeaders(value: string): Headers {
  const headers = new Headers();
  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}
