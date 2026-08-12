import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { evaluateDataRequestOperatorAccess } from "../lib/data-request-operator-access.ts";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const pepper = "synthetic-data-request-operator-access-test-pepper-2026";
const allowedEmail = "Operator@example.test";
const allowedDigest = createHmac("sha256", pepper)
  .update(allowedEmail.trim().toLowerCase())
  .digest("hex");

test("data-request operator authorization is independent and fails closed", async () => {
  for (const environment of [
    {},
    { DATA_REQUEST_OPERATOR_ACCESS_PEPPER: pepper },
    { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: allowedDigest },
    {
      DATA_REQUEST_OPERATOR_ACCESS_PEPPER: "short",
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: allowedDigest,
    },
    {
      DATA_REQUEST_OPERATOR_ACCESS_PEPPER: pepper,
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: "not-a-digest",
    },
    {
      DATA_REQUEST_OPERATOR_ACCESS_PEPPER: pepper,
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: `${allowedDigest},${allowedDigest}`,
    },
  ]) {
    assert.deepEqual(
      await evaluateDataRequestOperatorAccess({
        authenticatedEmail: allowedEmail,
        environment,
      }),
      { decision: "unavailable" },
    );
  }

  const granted = await evaluateDataRequestOperatorAccess({
    authenticatedEmail: `  ${allowedEmail.toUpperCase()}  `,
    environment: {
      DATA_REQUEST_OPERATOR_ACCESS_PEPPER: pepper,
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: allowedDigest.toUpperCase(),
    },
  });
  assert.equal(granted.decision, "granted");
  assert.equal(granted.operatorDigest, allowedDigest);
  assert.equal(JSON.stringify(granted).includes(allowedEmail), false);

  for (const authenticatedEmail of [
    "someone.else@example.test",
    "not-an-email",
    "lookalike＠example.test",
  ]) {
    assert.deepEqual(
      await evaluateDataRequestOperatorAccess({
        authenticatedEmail,
        environment: {
          DATA_REQUEST_OPERATOR_ACCESS_PEPPER: pepper,
          DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: allowedDigest,
        },
      }),
      { decision: "forbidden" },
    );
  }
});

test("operator route sources preserve the non-destructive boundary", async () => {
  const [queueRoute, detailRoute, sharedRoute, operations] = await Promise.all([
    readFile(
      new URL("../app/api/operations/data-requests/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/operations/data-requests/[requestId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/operations/data-requests/_shared.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/data-request-operations.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(queueRoute, /export async function GET/);
  assert.match(detailRoute, /export async function GET/);
  assert.match(detailRoute, /export async function PATCH/);
  assert.doesNotMatch(queueRoute + detailRoute, /export async function DELETE/);
  assert.doesNotMatch(queueRoute + detailRoute, /export async function POST/);
  assert.match(detailRoute, /assertSameOrigin\(request\)/);
  assert.match(detailRoute, /assertExactObjectKeys\(payload,/);
  assert.match(detailRoute, /validatedOperatorIdempotencyKey\(request\)/);
  assert.match(
    detailRoute,
    /dataRequestOperatorTransitionExpectedStatuses/,
  );
  assert.match(detailRoute, /dataRequestOperatorTransitionTargetStatuses/);
  assert.match(sharedRoute, /identity\.source !== "siwc"/);
  assert.match(sharedRoute, /DATA_REQUEST_OPERATOR_ACCESS_PEPPER/);
  assert.match(sharedRoute, /DATA_REQUEST_OPERATOR_EMAIL_DIGESTS/);
  assert.match(operations, /data_request\.operator_status_transitioned/);
  assert.match(operations, /fulfillmentAvailable: false/);
  assert.match(operations, /deletionAvailable: false/);
  assert.match(operations, /destructiveActionsPerformed: false/);
  assert.match(
    operations,
    /dataRequestOperatorTransitionExpectedStatuses\s*=\s*\[\s*"submitted"/,
  );
  assert.match(
    operations,
    /dataRequestOperatorTransitionTargetStatuses\s*=\s*\[\s*"identity_verification_required"/,
  );
  assert.doesNotMatch(operations, /input\.targetStatus === "verified"/);
  assert.doesNotMatch(operations, /identityVerifiedAt:\s*input\./);
  assert.doesNotMatch(
    operations,
    /primaryEmail:\s*accounts\.|normalizedEmail:\s*accounts\.|requesterContactHash:\s*dataRequests\.|objectKey:\s*mediaAssets\.|exportSha256:\s*dataRequests\./,
  );
});

test("operator queue and detail stay in account-control scope before role authorization", async () => {
  const { instructorAccessScopeForPath } = await import(
    "../lib/product-access.ts"
  );
  assert.equal(
    instructorAccessScopeForPath("/api/operations/data-requests"),
    "account",
  );
  assert.equal(
    instructorAccessScopeForPath(
      "/api/operations/data-requests/request_opaque_123",
    ),
    "account",
  );
});
