import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BROWSER_SHARE_EXCHANGE_MEDIA_TYPE,
  browserUnavailableShareExchangeResponse,
  isUnavailableShareExchangePayload,
} from "../lib/share-exchange-browser-contract.ts";

const REQUEST_ID = "c7f54b95-6ab1-4a22-a0d4-f17ca6c03a7d";

test("browser unavailable envelope is a clean 200 response with no session cookie", async () => {
  const response = browserUnavailableShareExchangeResponse(
    new Headers({ Accept: BROWSER_SHARE_EXCHANGE_MEDIA_TYPE }),
    REQUEST_ID,
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { outcome: "unavailable" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-request-id"), REQUEST_ID);
  assert.equal(response.headers.get("vary"), "Accept");
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private.*no-store.*max-age=0/,
  );
});

test("browser envelope negotiation is exact and legacy callers remain non-negotiated", () => {
  for (const accept of [
    "",
    "application/json",
    `${BROWSER_SHARE_EXCHANGE_MEDIA_TYPE}; q=0`,
    "application/vnd.roadmap.share-exchange-v2+json",
  ]) {
    assert.equal(
      browserUnavailableShareExchangeResponse(
        new Headers({ Accept: accept }),
        REQUEST_ID,
      ),
      null,
    );
  }

  assert.ok(
    browserUnavailableShareExchangeResponse(
      new Headers({
        Accept: `application/json, ${BROWSER_SHARE_EXCHANGE_MEDIA_TYPE}; q=1`,
      }),
      REQUEST_ID,
    ),
  );
});

test("client accepts only the exact sanitized unavailable payload", () => {
  assert.equal(
    isUnavailableShareExchangePayload({ outcome: "unavailable" }),
    true,
  );
  for (const value of [
    null,
    { outcome: "expired" },
    { outcome: "unavailable", detail: "private" },
  ]) {
    assert.equal(isUnavailableShareExchangePayload(value), false);
  }
});

test("route keeps programmatic 404 semantics after the browser-only branch", async () => {
  const route = await readFile(
    new URL("../app/r/session/route.ts", import.meta.url),
    "utf8",
  );
  const browserBranch = route.indexOf(
    "browserUnavailableShareExchangeResponse(",
  );
  const legacyNotFound = route.indexOf(
    'new RequestError(404, "plan_unavailable"',
  );

  assert.ok(browserBranch >= 0);
  assert.ok(legacyNotFound > browserBranch);
  assert.match(route, /if \(browserUnavailable\) return browserUnavailable;/);
});
