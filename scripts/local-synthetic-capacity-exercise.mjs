import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  identityHeaders,
  startD1Worker,
  testOrigin,
  writeHeaders,
} from "../tests/support/d1-worker.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceLabel =
  "LOCAL SYNTHETIC CAPACITY EVIDENCE — NOT HOSTED PERFORMANCE EVIDENCE";
const exerciseStartedAt = performance.now();
const EXERCISE_RUNTIME_GUARD_MS = 60_000;
const MAX_CONCURRENCY = 4;
const LARGE_TENANT_BULK_ROWS = 120;
const LIST_LIMIT = 50;
const MAX_WORKSPACE_RESPONSE_BYTES = 1_000_000;
const MAX_EXPORT_RESPONSE_BYTES = 6 * 1024 * 1024;
const CRITICAL_FLOW_COUNT = 4;
const measurements = [];
const observedBounds = {
  exportResponseBytes: [],
  listItemCounts: [],
  workspaceResponseBytes: [],
};
const identities = {
  small: {
    email: "coach.a@example.test",
    name: "Coach Synthetic Small",
  },
  large: {
    email: "coach.b@example.test",
    name: "Coach Synthetic Large",
  },
};

let worker;
let evidenceInputs;
try {
  worker = await startD1Worker();
  evidenceInputs = await runExercise(worker);
} finally {
  await worker?.dispose();
}

const totalDurationMs = performance.now() - exerciseStartedAt;
assert.ok(
  totalDurationMs < EXERCISE_RUNTIME_GUARD_MS,
  "local synthetic exercise exceeded its 60-second harness guard",
);
const evidenceRecord = await buildEvidenceRecord({
  ...evidenceInputs,
  totalDurationMs,
});
assertEvidenceIsPrivacySafe(evidenceRecord);
assertEvidenceIsBounded(evidenceRecord);

console.log(evidenceLabel);
console.log(
  `PASS isolated production Worker: ${evidenceRecord.workload.syntheticTenants} synthetic tenants, ${evidenceRecord.workload.measuredRequestCount} measured requests, maximum concurrency ${evidenceRecord.workload.concurrency.maximum}.`,
);
console.log(
  `PASS representative tenant shapes: small=${evidenceRecord.workload.finalTenantRows.small.golfers} golfers, large=${evidenceRecord.workload.finalTenantRows.large.golfers} golfers; all list responses remained at or below ${LIST_LIMIT} items.`,
);
console.log(
  `PASS critical mix: ${CRITICAL_FLOW_COUNT} author/edit/publish/share flows and ${evidenceRecord.workload.criticalMix.export} bounded exports completed with ${evidenceRecord.failures.count} failures.`,
);
console.log(
  `Observed local request latency: p50=${evidenceRecord.latencyMs.overall.p50}, p95=${evidenceRecord.latencyMs.overall.p95}, max=${evidenceRecord.latencyMs.overall.max} ms. These are local observations, not approved targets or SLOs.`,
);
console.log(
  "The disposable Worker/D1 runtime was removed. No hosted resource, real identity, provider performance, capacity limit, or business threshold is established.",
);
console.log(`CAPACITY_EVIDENCE_JSON ${JSON.stringify(evidenceRecord)}`);

async function runExercise(runtime) {
  const workloadStartedAt = performance.now();

  await runBounded(
    Object.values(identities).map((identity) => () =>
      measuredJsonRequest({
        operation: "setup_profile",
        expectedStatus: 200,
        request: () =>
          runtime.dispatch("/api/profile", {
            method: "PUT",
            headers: writeHeaders(identity.email, identity.name),
            body: JSON.stringify({
              displayName: identity.name,
              contactEmail: identity.email,
            }),
          }),
        validate(body) {
          assert.ok(body.profile);
        },
      }),
    ),
    2,
  );

  await Promise.all(
    Object.values(identities).map((identity) =>
      grantSyntheticGolferRecordConsent(runtime, identity),
    ),
  );

  await runBounded(
    Object.values(identities).map((identity, index) => () =>
      measuredJsonRequest({
        operation: "setup_package",
        expectedStatus: 201,
        request: () =>
          runtime.dispatch("/api/packages", {
            method: "POST",
            headers: {
              ...writeHeaders(identity.email, identity.name),
              "idempotency-key": `capacity-package-setup-${index + 1}-20260808`,
            },
            body: JSON.stringify(packagePayload(index + 1)),
          }),
        validate(body) {
          assert.ok(body.package?.id);
          assert.equal(body.package.status, "active");
        },
      }),
    ),
    2,
  );

  await seedLargeTenant(runtime);

  const flows = Array.from({ length: CRITICAL_FLOW_COUNT }, (_, index) => () =>
    runCriticalFlow(
      runtime,
      index % 2 === 0 ? identities.small : identities.large,
      index + 1,
    ),
  );
  await runBounded(flows, MAX_CONCURRENCY);

  await runBounded(
    Object.values(identities).map((identity) => () =>
      measuredBinaryRequest({
        operation: "export",
        expectedStatus: 200,
        request: () =>
          runtime.dispatch("/api/data-export", {
            method: "POST",
            headers: writeHeaders(identity.email, identity.name),
            body: "{}",
          }),
        validate(response, byteLength) {
          assert.match(
            response.headers.get("content-type") ?? "",
            /^application\/json\b/iu,
          );
          assert.ok(byteLength > 0 && byteLength <= MAX_EXPORT_RESPONSE_BYTES);
          observedBounds.exportResponseBytes.push(byteLength);
        },
      }),
    ),
    2,
  );

  await runBounded(buildBoundedReadTasks(runtime), MAX_CONCURRENCY);

  const finalTenantRows = await inspectTenantRows(runtime);
  assert.deepEqual(finalTenantRows.small, {
    coachingPackages: 1,
    developmentPlans: 2,
    golfers: 2,
  });
  assert.deepEqual(finalTenantRows.large, {
    coachingPackages: LARGE_TENANT_BULK_ROWS + 1,
    developmentPlans: LARGE_TENANT_BULK_ROWS + 2,
    golfers: LARGE_TENANT_BULK_ROWS + 2,
  });
  assert.equal(
    measurements.filter((measurement) => measurement.failed).length,
    0,
    "one or more measured requests failed",
  );

  return {
    finalTenantRows,
    workloadDurationMs: performance.now() - workloadStartedAt,
  };
}

async function runCriticalFlow(runtime, identity, flowNumber) {
  const authored = await measuredJsonRequest({
    operation: "author",
    expectedStatus: 201,
    request: () =>
      runtime.dispatch("/api/golfers", {
        method: "POST",
        headers: {
          ...writeHeaders(identity.email, identity.name),
          "idempotency-key": `capacity-author-flow-${flowNumber}-20260808`,
        },
        body: JSON.stringify(authorPayload(flowNumber)),
      }),
    validate(body) {
      assert.ok(body.golfer?.id);
      assert.ok(body.plan?.id);
      assert.equal(body.plan.revision, 1);
      assert.equal(body.phases?.length, 3);
    },
  });
  await grantSyntheticRoadmapSharingConsent(
    runtime,
    identity,
    authored.golfer.id,
  );

  const edited = await measuredJsonRequest({
    operation: "edit",
    expectedStatus: 200,
    request: () =>
      runtime.dispatch(`/api/plans/${authored.plan.id}`, {
        method: "PUT",
        headers: writeHeaders(identity.email, identity.name),
        body: JSON.stringify(editPayload(flowNumber)),
      }),
    validate(body) {
      assert.equal(body.plan?.revision, 2);
    },
  });
  assert.equal(edited.plan.id, authored.plan.id);

  const published = await measuredJsonRequest({
    operation: "publish",
    expectedStatus: 201,
    request: () =>
      runtime.dispatch(`/api/plans/${authored.plan.id}/publish`, {
        method: "POST",
        headers: writeHeaders(identity.email, identity.name),
        body: JSON.stringify({
          confirmation: "reviewed_exact_golfer_view",
          expectedRevision: 2,
          expiresInDays: 7,
          intendedRecipientContext: `Synthetic capacity recipient ${flowNumber}`,
        }),
      }),
    validate(body) {
      assert.ok(body.share?.id);
      const shareUrl = new URL(body.share.url);
      assert.equal(shareUrl.origin, testOrigin);
      assert.match(shareUrl.hash, /^#token=[A-Za-z0-9_-]{40,64}$/u);
    },
  });
  const rawToken = new URLSearchParams(
    new URL(published.share.url).hash.slice(1),
  ).get("token");
  assert.ok(rawToken);

  await measuredJsonRequest({
    operation: "share_exchange",
    expectedStatus: 200,
    request: () =>
      runtime.dispatch("/r/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: testOrigin,
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ token: rawToken }),
      }),
    validate(body, response) {
      assert.equal(body.redirectTo, "/r/plan");
      assert.match(
        response.headers.get("set-cookie") ?? "",
        /^roadmap_share=[A-Za-z0-9_-]{40,64};/u,
      );
    },
  });
}

function buildBoundedReadTasks(runtime) {
  const tasks = [];
  for (const [shape, identity] of Object.entries(identities)) {
    const golferOffsets =
      shape === "small" ? [0, 0, 0, 0, 0, 0] : [0, 50, 100, 0, 50, 100];
    const packageOffsets = golferOffsets;
    for (const offset of golferOffsets) {
      tasks.push(() =>
        measuredJsonRequest({
          operation: `read_golfers_${shape}`,
          expectedStatus: 200,
          request: () =>
            runtime.dispatch(
              `/api/golfers?limit=${LIST_LIMIT}&offset=${offset}`,
              { headers: identityHeaders(identity.email, identity.name) },
            ),
          validate(body) {
            assert.ok(Array.isArray(body.golfers));
            assert.ok(body.golfers.length <= LIST_LIMIT);
            if (shape === "small") assert.equal(body.golfers.length, 2);
            observedBounds.listItemCounts.push(body.golfers.length);
          },
        }),
      );
    }
    for (const offset of packageOffsets) {
      tasks.push(() =>
        measuredJsonRequest({
          operation: `read_packages_${shape}`,
          expectedStatus: 200,
          request: () =>
            runtime.dispatch(
              `/api/packages?limit=${LIST_LIMIT}&offset=${offset}`,
              { headers: identityHeaders(identity.email, identity.name) },
            ),
          validate(body) {
            assert.ok(Array.isArray(body.packages));
            assert.ok(body.packages.length <= LIST_LIMIT);
            if (shape === "small") assert.equal(body.packages.length, 1);
            observedBounds.listItemCounts.push(body.packages.length);
          },
        }),
      );
    }
    for (let index = 0; index < 4; index += 1) {
      tasks.push(() =>
        measuredBinaryRequest({
          operation: `read_workspace_${shape}`,
          expectedStatus: 200,
          request: () =>
            runtime.dispatch("/app", {
              headers: identityHeaders(identity.email, identity.name),
            }),
          validate(response, byteLength) {
            assert.match(
              response.headers.get("content-type") ?? "",
              /^text\/html\b/iu,
            );
            assert.ok(
              byteLength > 0 && byteLength <= MAX_WORKSPACE_RESPONSE_BYTES,
            );
            observedBounds.workspaceResponseBytes.push(byteLength);
          },
        }),
      );
    }
  }
  assert.equal(tasks.length, 32);
  return tasks;
}

async function seedLargeTenant(runtime) {
  const timestamp = Date.UTC(2026, 7, 8, 12, 0, 0);
  const results = await runtime.inspect([
    {
      sql: `with recursive seq(n) as (
              select 1 union all select n + 1 from seq where n < ?
            )
            insert into golfers (
              id, account_id, display_name, status, eligibility_status,
              eligibility_confirmed_at, last_activity_at, created_at, updated_at
            )
            select 'capacity_bulk_golfer_' || printf('%03d', seq.n),
                   accounts.id,
                   'Synthetic Bulk Golfer ' || printf('%03d', seq.n),
                   'active', 'adult_confirmed', ?, ?, ?, ?
              from seq cross join accounts
             where accounts.normalized_email = ?`,
      params: [
        LARGE_TENANT_BULK_ROWS,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
        identities.large.email,
      ],
    },
    {
      sql: `with recursive seq(n) as (
              select 1 union all select n + 1 from seq where n < ?
            )
            insert into development_plans (
              id, account_id, golfer_id, title, status, revision,
              created_at, updated_at
            )
            select 'capacity_bulk_plan_' || printf('%03d', seq.n),
                   accounts.id,
                   'capacity_bulk_golfer_' || printf('%03d', seq.n),
                   'Synthetic Bulk Plan ' || printf('%03d', seq.n),
                   'draft', 1, ?, ?
              from seq cross join accounts
             where accounts.normalized_email = ?`,
      params: [
        LARGE_TENANT_BULK_ROWS,
        timestamp,
        timestamp,
        identities.large.email,
      ],
    },
    {
      sql: `with recursive seq(n) as (
              select 1 union all select n + 1 from seq where n < ?
            )
            insert into coaching_packages (
              id, account_id, name, purpose, fit_description, status,
              current_details_text, inclusions, terms_summary,
              external_action_type, external_action_label, external_action_url,
              is_default, created_at, updated_at
            )
            select 'capacity_bulk_package_' || printf('%03d', seq.n),
                   accounts.id,
                   'Synthetic Bulk Package ' || printf('%03d', seq.n),
                   'Synthetic local capacity purpose.',
                   'Synthetic local capacity fit.',
                   'active',
                   'Contact the synthetic instructor for current details.',
                   '[]',
                   'Synthetic local terms.',
                   'contact',
                   'Contact synthetic instructor',
                   'https://capacity.example.test/contact',
                   0, ?, ?
              from seq cross join accounts
             where accounts.normalized_email = ?`,
      params: [
        LARGE_TENANT_BULK_ROWS,
        timestamp,
        timestamp,
        identities.large.email,
      ],
    },
  ]);
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.success === true));
}

async function inspectTenantRows(runtime) {
  const inspections = await runtime.inspect(
    Object.values(identities).flatMap((identity) => [
      {
        sql: `select
                (select count(*) from golfers where account_id = accounts.id) as golfers,
                (select count(*) from development_plans where account_id = accounts.id) as developmentPlans,
                (select count(*) from coaching_packages where account_id = accounts.id) as coachingPackages
                from accounts where normalized_email = ?`,
        params: [identity.email],
      },
    ]),
  );
  const [small, large] = inspections.map((inspection) => inspection.results[0]);
  return { large, small };
}

async function measuredJsonRequest({
  expectedStatus,
  operation,
  request,
  validate,
}) {
  return measuredRequest({
    expectedStatus,
    operation,
    request,
    async consume(response) {
      const body = await response.json();
      validate(body, response);
      return body;
    },
  });
}

async function measuredBinaryRequest({
  expectedStatus,
  operation,
  request,
  validate,
}) {
  return measuredRequest({
    expectedStatus,
    operation,
    request,
    async consume(response) {
      const body = await response.arrayBuffer();
      validate(response, body.byteLength);
      return body.byteLength;
    },
  });
}

async function measuredRequest({
  consume,
  expectedStatus,
  operation,
  request,
}) {
  const startedAt = performance.now();
  let response;
  try {
    response = await request();
    const value = await consume(response);
    const latencyMs = performance.now() - startedAt;
    const failed = response.status !== expectedStatus;
    measurements.push({
      failed,
      failureCategory: failed ? "unexpected_status" : null,
      latencyMs,
      operation,
      startedAt,
      status: response.status,
    });
    assert.equal(
      response.status,
      expectedStatus,
      `${operation} returned an unexpected status`,
    );
    return value;
  } catch (error) {
    if (
      !measurements.some(
        (measurement) =>
          measurement.operation === operation &&
          measurement.startedAt === startedAt,
      )
    ) {
      measurements.push({
        failed: true,
        failureCategory: response ? "response_validation" : "dispatch_error",
        latencyMs: performance.now() - startedAt,
        operation,
        startedAt,
        status: response?.status ?? "dispatch_error",
      });
    }
    throw error;
  }
}

async function runBounded(tasks, concurrency) {
  assert.ok(
    Number.isSafeInteger(concurrency) &&
      concurrency >= 1 &&
      concurrency <= MAX_CONCURRENCY,
  );
  let nextTask = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, tasks.length) },
      async () => {
        while (nextTask < tasks.length) {
          const taskIndex = nextTask;
          nextTask += 1;
          await tasks[taskIndex]();
        }
      },
    ),
  );
}

async function buildEvidenceRecord({
  finalTenantRows,
  totalDurationMs,
  workloadDurationMs,
}) {
  const [applicationPackage, miniflarePackage, vinextPackage, wranglerPackage] =
    await Promise.all([
      readJson(resolve(projectRoot, "package.json")),
      readJson(resolve(projectRoot, "node_modules/miniflare/package.json")),
      readJson(resolve(projectRoot, "node_modules/vinext/package.json")),
      readJson(resolve(projectRoot, "node_modules/wrangler/package.json")),
    ]);
  assert.equal(
    miniflarePackage.version,
    applicationPackage.devDependencies.miniflare,
  );
  assert.equal(vinextPackage.version, applicationPackage.devDependencies.vinext);
  assert.equal(
    wranglerPackage.version,
    applicationPackage.devDependencies.wrangler,
  );
  const journal = await readJson(
    resolve(projectRoot, "drizzle/meta/_journal.json"),
  );
  const migrationEntries = [...journal.entries].sort(
    (left, right) => left.idx - right.idx,
  );
  const workerBundle = await readFile(
    resolve(projectRoot, "dist/server/index.js"),
  );
  const statusDistribution = countBy(
    measurements,
    (measurement) => String(measurement.status),
  );
  const failureMeasurements = measurements.filter(
    (measurement) => measurement.failed,
  );
  const requestsByOperation = countBy(
    measurements,
    (measurement) => measurement.operation,
  );
  const latencyByOperation = Object.fromEntries(
    [...new Set(measurements.map(({ operation }) => operation))]
      .sort()
      .map((operation) => [
        operation,
        latencySummary(
          measurements
            .filter((measurement) => measurement.operation === operation)
            .map((measurement) => measurement.latencyMs),
        ),
      ]),
  );
  return {
    evidenceClass: evidenceLabel,
    status: failureMeasurements.length === 0 ? "pass" : "fail",
    versions: {
      application: applicationPackage.version,
      miniflare: miniflarePackage.version,
      migrationCount: migrationEntries.length,
      migrationJournal: String(journal.version),
      migrationTip: migrationEntries.at(-1).tag,
      node: process.version,
      npm: npmVersion(),
      vinext: vinextPackage.version,
      workerBundleSha256: sha256(workerBundle),
      wrangler: wranglerPackage.version,
    },
    durationMs: {
      runtimeInitializationWorkloadAndCleanup: round(totalDurationMs),
      workload: round(workloadDurationMs),
    },
    workload: {
      bulkSeedRows: {
        coachingPackages: LARGE_TENANT_BULK_ROWS,
        developmentPlans: LARGE_TENANT_BULK_ROWS,
        golfers: LARGE_TENANT_BULK_ROWS,
      },
      boundedReads: {
        golferLists: 12,
        packageLists: 12,
        workspacePages: 8,
      },
      concurrency: {
        criticalFlows: MAX_CONCURRENCY,
        exports: 2,
        maximum: MAX_CONCURRENCY,
        reads: MAX_CONCURRENCY,
        setup: 2,
      },
      criticalMix: {
        author: CRITICAL_FLOW_COUNT,
        edit: CRITICAL_FLOW_COUNT,
        export: Object.keys(identities).length,
        publish: CRITICAL_FLOW_COUNT,
        shareExchange: CRITICAL_FLOW_COUNT,
      },
      finalTenantRows,
      measuredRequestCount: measurements.length,
      measuredRequestsByOperation: requestsByOperation,
      syntheticTenants: Object.keys(identities).length,
    },
    latencyMs: {
      byOperation: latencyByOperation,
      overall: latencySummary(
        measurements.map((measurement) => measurement.latencyMs),
      ),
    },
    statusDistribution,
    failures: {
      byCategory: countBy(
        failureMeasurements,
        (measurement) => measurement.failureCategory,
      ),
      count: failureMeasurements.length,
    },
    boundedOutputs: {
      exerciseSafetyCapsNotApprovedBusinessThresholds: true,
      exportResponseBytesMaxObserved: Math.max(
        ...observedBounds.exportResponseBytes,
      ),
      exportResponseExerciseCapBytes: MAX_EXPORT_RESPONSE_BYTES,
      listItemsMaxObserved: Math.max(...observedBounds.listItemCounts),
      listRequestLimit: LIST_LIMIT,
      workspaceResponseBytesMaxObserved: Math.max(
        ...observedBounds.workspaceResponseBytes,
      ),
      workspaceResponseExerciseCapBytes: MAX_WORKSPACE_RESPONSE_BYTES,
    },
    limitations: [
      "Local synthetic production-bundle and Miniflare D1 observations only.",
      "No Sites deployment, hosted D1/R2, provider network, Stripe, SIWC session, real identity, customer data, or production credential was used.",
      "One disposable process on one development machine is not representative capacity, sustained load, soak, contention, geography, cold-start, or provider-performance evidence.",
      "No latency, throughput, concurrency, tenant-size, capacity, SLO, SLA, or business threshold is approved or established by these observations.",
      "The 60-second runtime guard and response-size caps are harness safety bounds, not service commitments.",
    ],
  };
}

function assertEvidenceIsBounded(evidence) {
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.failures.count, 0);
  assert.equal(evidence.workload.measuredRequestCount, 54);
  assert.equal(evidence.workload.concurrency.maximum, MAX_CONCURRENCY);
  assert.deepEqual(evidence.statusDistribution, { 200: 44, 201: 10 });
  assert.equal(evidence.boundedOutputs.listItemsMaxObserved, LIST_LIMIT);
  assert.ok(
    evidence.boundedOutputs.workspaceResponseBytesMaxObserved <=
      MAX_WORKSPACE_RESPONSE_BYTES,
  );
  assert.ok(
    evidence.boundedOutputs.exportResponseBytesMaxObserved <=
      MAX_EXPORT_RESPONSE_BYTES,
  );
  assert.ok(
    evidence.durationMs.runtimeInitializationWorkloadAndCleanup <
      EXERCISE_RUNTIME_GUARD_MS,
  );
  for (const summary of [
    evidence.latencyMs.overall,
    ...Object.values(evidence.latencyMs.byOperation),
  ]) {
    assert.ok(summary.sampleCount > 0);
    assert.ok(summary.p50 >= 0);
    assert.ok(summary.p95 >= summary.p50);
    assert.ok(summary.max >= summary.p95);
  }
}

function assertEvidenceIsPrivacySafe(evidence) {
  const serialized = JSON.stringify(evidence);
  const forbiddenValues = [
    ...Object.values(identities).flatMap(({ email, name }) => [email, name]),
    "@example.test",
    "capacity_bulk_golfer_",
    "capacity_bulk_plan_",
    "capacity_bulk_package_",
    "roadmap_share=",
    "#token=",
  ];
  for (const value of forbiddenValues) {
    assert.equal(
      serialized.includes(value),
      false,
      "capacity JSON evidence contains a synthetic private fixture value",
    );
  }
}

function latencySummary(samples) {
  assert.ok(samples.length > 0);
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    sampleCount: sorted.length,
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
}

function percentile(sortedSamples, percentileValue) {
  const index = Math.max(
    0,
    Math.ceil(sortedSamples.length * percentileValue) - 1,
  );
  return sortedSamples[index];
}

function countBy(items, keyForItem) {
  const counts = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function npmVersion() {
  const match = /(?:^|\s)npm\/([^\s]+)/u.exec(
    process.env.npm_config_user_agent ?? "",
  );
  assert.ok(match, "run the capacity exercise through its npm script");
  return match[1];
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function packagePayload(sequence) {
  return {
    currency: "CAD",
    description: "Synthetic local capacity package.",
    externalActionUrl: "https://booking.example.ca/capacity-exercise",
    inclusions: ["Synthetic local session"],
    isDefault: true,
    priceCents: 10_000 + sequence,
    status: "active",
    terms: "Synthetic local exercise only; no purchase occurs.",
    title: `Synthetic Capacity Package ${sequence}`,
  };
}

function authorPayload(flowNumber) {
  return {
    adultEligibilityConfirmed: true,
    assessment: {
      limitations: "One synthetic local observation is not predictive.",
      primaryPattern: "Synthetic contact varies as tempo increases.",
      strengths: "Synthetic strike feedback is noticed.",
      summary: "Synthetic contact varies under a constrained task.",
    },
    displayName: `Synthetic Capacity Golfer ${flowNumber}`,
    email: `capacity.golfer.${flowNumber}@example.test`,
    goal: {
      context: "Synthetic local capacity exercise only.",
      statement: "Build a repeatable synthetic contact pattern.",
      why: "Use bounded evidence for the next synthetic decision.",
    },
    phases: phasePayloads(flowNumber, "authored"),
    planTitle: `Synthetic Capacity Roadmap ${flowNumber}`,
    priority: {
      rationale: "Synthetic contact is the narrowest observable priority.",
      title: "Synthetic centred contact",
    },
  };
}

function editPayload(flowNumber) {
  return {
    assessment: {
      limitations: "One revised synthetic observation is not predictive.",
      primaryPattern: "Synthetic heel contact varies with transition tempo.",
      strengths: "Synthetic strike feedback remains noticeable.",
      summary: "Synthetic contact was revised after local review.",
    },
    expectedRevision: 1,
    goal: {
      context: "Revised synthetic local capacity exercise only.",
      statement: "Build repeatable synthetic contact at playing tempo.",
      why: "Use revised bounded evidence for the next decision.",
    },
    phases: phasePayloads(flowNumber, "edited"),
    priority: {
      rationale: "Revised synthetic contact remains the observable priority.",
      title: "Synthetic contact at playing tempo",
    },
    title: `Edited Synthetic Capacity Roadmap ${flowNumber}`,
  };
}

function phasePayloads(flowNumber, state) {
  return Array.from({ length: 3 }, (_, index) => ({
    number: index + 1,
    progressSignals:
      index === 0
        ? [`Synthetic signal ${flowNumber} for the ${state} first phase.`]
        : [],
    purpose: `Synthetic ${state} purpose ${index + 1} for flow ${flowNumber}.`,
    rationale:
      index === 0
        ? `Synthetic ${state} rationale for flow ${flowNumber}.`
        : null,
    title: `Synthetic ${state} phase ${index + 1}`,
  }));
}
