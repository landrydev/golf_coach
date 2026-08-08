import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const SAFE_REQUEST_ID = "2d48a8b9-0777-4dd0-b36a-f2fe065e1e3c";

test("request telemetry emits only bounded, allowlisted dimensions", async () => {
  const { buildRequestTelemetry, requestRouteFamily } = await import(
    "../lib/request-telemetry.ts"
  );
  const secrets = [
    "golfer-record-7492",
    "share-token-value-very-secret",
    "coach.private@example.test",
    "Coach Private Name",
  ];
  const adversarialPath =
    `/api/golfers/${encodeURIComponent(secrets[0])}` +
    `/plans/${encodeURIComponent(secrets[1])}` +
    `/email/${encodeURIComponent(secrets[2])}` +
    `/name/${encodeURIComponent(secrets[3])}`;

  const telemetry = buildRequestTelemetry({
    requestId: SAFE_REQUEST_ID,
    rawPathname: adversarialPath,
    method: "POST",
    status: 422,
    durationMs: 127,
  });

  assert.deepEqual(telemetry, {
    event: "http_request",
    requestId: SAFE_REQUEST_ID,
    routeFamily: "golfers",
    method: "POST",
    status: 422,
    durationBucket: "100_to_499ms",
    outcome: "client_error",
  });
  assert.deepEqual(Object.keys(telemetry).sort(), [
    "durationBucket",
    "event",
    "method",
    "outcome",
    "requestId",
    "routeFamily",
    "status",
  ]);

  const serialized = JSON.stringify(telemetry);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false, secret);
    assert.equal(serialized.includes(encodeURIComponent(secret)), false, secret);
  }
  assert.equal(serialized.includes("/api/"), false);
  assert.equal(serialized.includes("?"), false);

  assert.equal(requestRouteFamily("/%61pi/packages/package-secret"), "packages");
  assert.equal(requestRouteFamily("/%72/share-token-secret"), "golfer_experience");
  assert.equal(requestRouteFamily("/%"), "api_other");
  assert.equal(requestRouteFamily("/unlisted/person-name"), "public_site");

  const untrustedMethod = buildRequestTelemetry({
    requestId: "coach.private@example.test",
    rawPathname: "/api/unknown/private-value",
    method: "coach.private@example.test",
    status: Number.NaN,
    durationMs: Number.NaN,
  });
  assert.equal(untrustedMethod.method, "OTHER");
  assert.equal(untrustedMethod.status, 500);
  assert.equal(untrustedMethod.durationBucket, "5s_or_more");
  assert.equal(JSON.stringify(untrustedMethod).includes("coach.private"), false);
  assert.match(untrustedMethod.requestId, /^[0-9a-f-]{36}$/i);
});

test("telemetry selection covers mutations, server failures, and slow requests only", async () => {
  const { buildRequestTelemetry, shouldLogRequestTelemetry } = await import(
    "../lib/request-telemetry.ts"
  );
  const scenario = (method, status, durationMs) =>
    shouldLogRequestTelemetry(
      buildRequestTelemetry({
        requestId: SAFE_REQUEST_ID,
        rawPathname: "/api/health",
        method,
        status,
        durationMs,
      }),
    );

  assert.equal(scenario("GET", 200, 999), false);
  assert.equal(scenario("HEAD", 404, 1), false);
  assert.equal(scenario("OPTIONS", 204, 1), false);
  assert.equal(scenario("POST", 201, 1), true);
  assert.equal(scenario("PUT", 409, 1), true);
  assert.equal(scenario("PATCH", 422, 1), true);
  assert.equal(scenario("DELETE", 204, 1), true);
  assert.equal(scenario("GET", 500, 1), true);
  assert.equal(scenario("GET", 503, 1), true);
  assert.equal(scenario("GET", 200, 1_000), true);
  assert.equal(scenario("GET", 200, 5_000), true);
});

test("Worker responses and structured logs share a generated safe request ID", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set(
    "telemetry-test",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  const { default: worker } = await import(workerUrl.href);
  const logs = [];
  const originalInfo = console.info;
  console.info = (...values) => logs.push(values);

  const entityId = "golfer-record-7492";
  const shareToken = "share-token-value-very-secret";
  const email = "coach.private@example.test";
  const name = "Coach Private Name";
  const suppliedRequestId = "attacker-request-id-containing-private-data";
  const suppliedRay = "attacker-ray-containing-private-data";

  try {
    const mutationResponse = await invokeWorker(
      worker,
      `/api/golfers/${encodeURIComponent(entityId)}?token=${encodeURIComponent(shareToken)}`,
      {
        method: "POST",
        headers: {
          "cf-ray": suppliedRay,
          "content-type": "application/json",
          "x-request-id": suppliedRequestId,
        },
        body: JSON.stringify({ email, name, token: shareToken }),
      },
    );
    assert.equal(mutationResponse.status, 401);

    const failureResponse = await invokeWorker(
      worker,
      `/api/plans/${encodeURIComponent(entityId)}?share=${encodeURIComponent(shareToken)}`,
      {
        headers: {
          "oai-authenticated-user-email": email,
          "oai-authenticated-user-full-name": encodeURIComponent(name),
        },
      },
    );
    assert.equal(failureResponse.status, 503);

    const ordinaryClientError = await invokeWorker(
      worker,
      `/api/packages/${encodeURIComponent(entityId)}`,
    );
    assert.equal(ordinaryClientError.status, 401);

    const mutationRequestId = mutationResponse.headers.get("x-request-id");
    const failureRequestId = failureResponse.headers.get("x-request-id");
    assert.match(mutationRequestId ?? "", /^[0-9a-f-]{36}$/i);
    assert.match(failureRequestId ?? "", /^[0-9a-f-]{36}$/i);
    assert.notEqual(mutationRequestId, suppliedRequestId);
    assert.notEqual(mutationRequestId, suppliedRay);
    assert.notEqual(mutationRequestId, failureRequestId);

    assert.equal(logs.length, 2);
    assert.equal(logs[0].length, 1);
    assert.equal(logs[1].length, 1);
    assert.equal(logs[0][0].requestId, mutationRequestId);
    assert.equal(logs[0][0].routeFamily, "golfers");
    assert.equal(logs[0][0].method, "POST");
    assert.equal(logs[0][0].status, 401);
    assert.equal(logs[0][0].outcome, "client_error");
    assert.equal(logs[1][0].requestId, failureRequestId);
    assert.equal(logs[1][0].routeFamily, "plans");
    assert.equal(logs[1][0].method, "GET");
    assert.equal(logs[1][0].status, 503);
    assert.equal(logs[1][0].outcome, "server_error");

    const serializedLogs = JSON.stringify(logs);
    for (const secret of [
      entityId,
      shareToken,
      email,
      name,
      suppliedRequestId,
      suppliedRay,
    ]) {
      assert.equal(serializedLogs.includes(secret), false, secret);
      assert.equal(
        serializedLogs.includes(encodeURIComponent(secret)),
        false,
        secret,
      );
    }
    assert.equal(serializedLogs.includes("/api/"), false);
    assert.equal(serializedLogs.includes("?"), false);
  } finally {
    console.info = originalInfo;
  }
});

function invokeWorker(worker, path, init) {
  return worker.fetch(
    new Request(new URL(path, "https://roadmap.example"), init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
