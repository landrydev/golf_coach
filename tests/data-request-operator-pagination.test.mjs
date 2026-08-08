import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const {
  encodeDataRequestOperatorCursor,
  parseDataRequestOperatorPage,
} = await import("../lib/data-request-operator-pagination.ts");

const now = 2_000_000_000_000;

test("operator queue cursors round-trip with strict, bounded page sizes", () => {
  const cursor = encodeDataRequestOperatorCursor({
    createdAt: now - 1,
    id: "request_opaque.123:abc",
  });
  assert.ok(cursor.length <= 512);
  assert.deepEqual(
    parseDataRequestOperatorPage(
      request(`cursor=${cursor}&limit=100`),
      now,
    ),
    {
      cursor: { createdAt: now - 1, id: "request_opaque.123:abc" },
      limit: 100,
    },
  );
  assert.deepEqual(parseDataRequestOperatorPage(request(""), now), {
    cursor: null,
    limit: 50,
  });
  assert.deepEqual(parseDataRequestOperatorPage(request("limit=1"), now), {
    cursor: null,
    limit: 1,
  });

  const maximumId = `r${"a".repeat(127)}`;
  assert.ok(
    encodeDataRequestOperatorCursor({ createdAt: now, id: maximumId }).length <=
      512,
  );
});

test("operator queue pagination rejects ambiguous or non-canonical queries", () => {
  for (const query of [
    "unexpected=1",
    "limit=1&limit=2",
    "cursor=abcd&cursor=efgh",
    "limit=",
    "limit=0",
    "limit=-1",
    "limit=01",
    "limit=1.5",
    "limit=101",
    "limit=1000",
  ]) {
    assertRequestError(
      () => parseDataRequestOperatorPage(request(query), now),
      "invalid_operator_queue_query",
    );
  }
});

test("operator queue pagination rejects malformed, future, and non-canonical cursors", () => {
  const cursorCases = [
    "",
    "abc=",
    "a".repeat(513),
    "aaaaa",
    encodePayload([2, now - 1, "request_1"]),
    encodePayload([1, now - 1]),
    encodePayload([1, now - 1, "request_1", "extra"]),
    encodePayload([1, 0, "request_1"]),
    encodePayload([1, now + 1, "request_1"]),
    encodePayload([1, now - 1, "bad/request"]),
    encodePayload([1, now - 1, `r${"a".repeat(128)}`]),
    Buffer.from(`[1, ${now - 1}, "request_1"]`, "utf8").toString(
      "base64url",
    ),
    Buffer.from([0xff]).toString("base64url"),
  ];

  for (const cursor of cursorCases) {
    assertRequestError(
      () =>
        parseDataRequestOperatorPage(
          request(`cursor=${encodeURIComponent(cursor)}`),
          now,
        ),
      "invalid_operator_queue_cursor",
    );
  }
});

function request(query) {
  return new Request(
    `https://roadmap.test/api/operations/data-requests${query ? `?${query}` : ""}`,
  );
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function assertRequestError(callback, code) {
  assert.throws(
    callback,
    (error) =>
      error instanceof Error && error.status === 400 && error.code === code,
  );
}
