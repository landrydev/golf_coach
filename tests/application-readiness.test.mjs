import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const VALID_OPERATOR_DIGEST = "ab".repeat(32);
const VALID_CONSENT_POLICY_REGISTRY = JSON.stringify({
  golfer_record: policyEntry("account"),
  roadmap_sharing: policyEntry("golfer"),
});

const READY_ENVIRONMENT = {
  ABUSE_LIMIT_PEPPER: "synthetic-abuse-pepper-for-readiness-tests",
  APP_URL: "https://roadmap.example",
  BILLING_CHECKOUT_ENABLED: "false",
  CONSENT_POLICY_REGISTRY_JSON: VALID_CONSENT_POLICY_REGISTRY,
  DATA_REQUEST_OPERATOR_ACCESS_PEPPER:
    "synthetic-data-request-operator-pepper-for-readiness-tests",
  DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: VALID_OPERATOR_DIGEST,
  INSTRUCTOR_ACCESS_MODE: "owner_private",
  OWNER_PRIVATE_ACCESS_PEPPER:
    "synthetic-owner-access-pepper-for-readiness-tests",
  OWNER_PRIVATE_EMAIL_DIGESTS: "0".repeat(64),
  SHARE_TOKEN_PEPPER: "synthetic-share-pepper-for-readiness-tests",
};

test("application readiness marks reachable D1 and R2 dependencies ready", async () => {
  await withReadyEnvironment(async () => {
    const { loadApplicationReadiness } = await import(
      "../lib/application-readiness.ts"
    );
    const readiness = await loadApplicationReadiness({
      database: databaseReturning({ healthy: 1 }),
      media: mediaReturning(null),
      dependencyTimeoutMs: 25,
    });

    assert.equal(readiness.status, "ready");
    assert.deepEqual(readiness.checks, {
      database: true,
      media: true,
      applicationOrigin: true,
      shareCapabilitySigning: true,
      abuseProtection: true,
      billingCheckoutPolicy: true,
      instructorAccessPolicy: true,
      consentPolicy: true,
      dataRequestOperatorAccessPolicy: true,
    });
    assert.ok(
      Object.values(readiness.checks).every(
        (check) => typeof check === "boolean",
      ),
    );
    const serialized = JSON.stringify(readiness);
    for (const privateValue of [
      VALID_OPERATOR_DIGEST,
      READY_ENVIRONMENT.DATA_REQUEST_OPERATOR_ACCESS_PEPPER,
      "Synthetic account-scoped readiness policy.",
      "Synthetic golfer-scoped readiness policy.",
      "synthetic-v1",
    ]) {
      assert.equal(serialized.includes(privateValue), false);
    }
  });
});

test("application readiness converts dependency exceptions into a private degraded result", async () => {
  await withReadyEnvironment(async () => {
    const { loadApplicationReadiness } = await import(
      "../lib/application-readiness.ts"
    );
    const readiness = await loadApplicationReadiness({
      database: databaseRejecting(),
      media: mediaRejecting(),
      dependencyTimeoutMs: 25,
    });

    assert.equal(readiness.status, "degraded");
    assert.equal(readiness.checks.database, false);
    assert.equal(readiness.checks.media, false);
    assert.doesNotMatch(JSON.stringify(readiness), /synthetic private failure/i);
  });
});

test("D1 and R2 readiness deadlines run concurrently and fail closed", async () => {
  await withReadyEnvironment(async () => {
    const { loadApplicationReadiness } = await import(
      "../lib/application-readiness.ts"
    );
    const startedAt = performance.now();
    const readiness = await loadApplicationReadiness({
      database: databaseHanging(),
      media: mediaHanging(),
      dependencyTimeoutMs: 20,
    });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(readiness.status, "degraded");
    assert.equal(readiness.checks.database, false);
    assert.equal(readiness.checks.media, false);
    assert.ok(elapsedMs < 500, `readiness took ${elapsedMs}ms`);
  });
});

test("application readiness requires both V1 consent purposes with their correct subjects", async () => {
  const invalidRegistries = [
    undefined,
    "",
    "not-json",
    "{}",
    JSON.stringify({ golfer_record: policyEntry("account") }),
    JSON.stringify({ roadmap_sharing: policyEntry("golfer") }),
    JSON.stringify({
      golfer_record: policyEntry("golfer"),
      roadmap_sharing: policyEntry("golfer"),
    }),
    JSON.stringify({
      golfer_record: policyEntry("account"),
      roadmap_sharing: policyEntry("account"),
    }),
  ];

  for (const registry of invalidRegistries) {
    await withReadyEnvironment(
      async () => {
        const readiness = await readyApplicationReadiness();
        assert.equal(readiness.status, "degraded");
        assert.equal(readiness.checks.consentPolicy, false);
        assert.equal(readiness.checks.dataRequestOperatorAccessPolicy, true);
      },
      { CONSENT_POLICY_REGISTRY_JSON: registry },
    );
  }
});

test("application readiness requires a strong operator pepper and a unique digest allowlist", async () => {
  const invalidOperatorConfigurations = [
    { DATA_REQUEST_OPERATOR_ACCESS_PEPPER: undefined },
    { DATA_REQUEST_OPERATOR_ACCESS_PEPPER: "short" },
    { DATA_REQUEST_OPERATOR_ACCESS_PEPPER: `  ${"x".repeat(31)}  ` },
    { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: undefined },
    { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: "" },
    { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: "a".repeat(63) },
    {
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS:
        `${VALID_OPERATOR_DIGEST},${VALID_OPERATOR_DIGEST.toUpperCase()}`,
    },
    { DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: `${VALID_OPERATOR_DIGEST},` },
  ];

  for (const configuration of invalidOperatorConfigurations) {
    await withReadyEnvironment(
      async () => {
        const readiness = await readyApplicationReadiness();
        assert.equal(readiness.status, "degraded");
        assert.equal(readiness.checks.dataRequestOperatorAccessPolicy, false);
        assert.equal(readiness.checks.consentPolicy, true);
      },
      configuration,
    );
  }
});

test("application readiness accepts normalized unique operator digests without testing membership", async () => {
  await withReadyEnvironment(
    async () => {
      const readiness = await readyApplicationReadiness();
      assert.equal(readiness.status, "ready");
      assert.equal(readiness.checks.dataRequestOperatorAccessPolicy, true);
    },
    {
      DATA_REQUEST_OPERATOR_EMAIL_DIGESTS:
        ` ${VALID_OPERATOR_DIGEST.toUpperCase()} , ${"cd".repeat(32)} `,
    },
  );
});

function databaseReturning(result) {
  return {
    prepare() {
      return { first: async () => result };
    },
  };
}

function databaseRejecting() {
  return {
    prepare() {
      return {
        first: async () => {
          throw new Error("synthetic private failure");
        },
      };
    },
  };
}

function databaseHanging() {
  return {
    prepare() {
      return { first: () => new Promise(() => undefined) };
    },
  };
}

function mediaReturning(result) {
  return { head: async () => result };
}

function mediaRejecting() {
  return {
    head: async () => {
      throw new Error("synthetic private failure");
    },
  };
}

function mediaHanging() {
  return { head: () => new Promise(() => undefined) };
}

async function readyApplicationReadiness() {
  const { loadApplicationReadiness } = await import(
    "../lib/application-readiness.ts"
  );
  return loadApplicationReadiness({
    database: databaseReturning({ healthy: 1 }),
    media: mediaReturning(null),
    dependencyTimeoutMs: 25,
  });
}

function policyEntry(subjectType) {
  return {
    version: "synthetic-v1",
    purposeDescription:
      subjectType === "account"
        ? "Synthetic account-scoped readiness policy."
        : "Synthetic golfer-scoped readiness policy.",
    subjectTypes: [subjectType],
  };
}

async function withReadyEnvironment(run, overrides = {}) {
  const managedKeys = new Set([
    ...Object.keys(READY_ENVIRONMENT),
    ...Object.keys(overrides),
  ]);
  const previous = Object.fromEntries(
    [...managedKeys].map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, READY_ENVIRONMENT);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
