import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { startD1Worker } from "./support/d1-worker.mjs";

register(new URL("./support/cloudflare-loader.mjs", import.meta.url));

const VALID_OPERATOR_DIGEST = "ab".repeat(32);
const VALID_CONSENT_POLICY_REGISTRY = JSON.stringify({
  golfer_record: policyEntry("account"),
  roadmap_sharing: policyEntry("golfer"),
});

const READY_ENVIRONMENT = {
  ABUSE_LIMIT_PEPPER: "synthetic-abuse-pepper-for-readiness-tests",
  APPLICATION_WRITE_MODE: "enabled",
  APP_URL: "https://roadmap.example",
  BILLING_CHECKOUT_ENABLED: "false",
  CONSENT_POLICY_REGISTRY_JSON: VALID_CONSENT_POLICY_REGISTRY,
  DATA_REQUEST_OPERATOR_ACCESS_PEPPER:
    "synthetic-data-request-operator-pepper-for-readiness-tests",
  DATA_REQUEST_OPERATOR_EMAIL_DIGESTS: VALID_OPERATOR_DIGEST,
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_ISSUER: "https://issuer.roadmap.example",
  OIDC_CLIENT_ID: "synthetic-readiness-client",
  OIDC_CLIENT_SECRET: "synthetic-readiness-client-secret",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  AUTH_SESSION_LIFETIME_SECONDS: "3600",
  AUTH_SESSION_PEPPER:
    "synthetic-instructor-session-pepper-for-readiness-tests",
  AUTH_TRANSACTION_ENCRYPTION_KEY:
    "ERERERERERERERERERERERERERERERERERERERERERE",
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
    assert.deepEqual(readiness.writeControl, { state: "enabled" });
    assert.deepEqual(readiness.checks, {
      database: true,
      media: true,
      applicationOrigin: true,
      shareCapabilitySigning: true,
      abuseProtection: true,
      billingCheckoutPolicy: true,
      instructorAccessPolicy: true,
      instructorAuthentication: true,
      consentPolicy: true,
      dataRequestOperatorAccessPolicy: true,
      applicationWritesEnabled: true,
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

test(
  "D1 readiness requires migration 0011 auth semantics and the exact expiry index",
  { timeout: 60_000 },
  async () => {
    const { loadApplicationReadiness } = await import(
      "../lib/application-readiness.ts"
    );

    const beforeMigration0011 = await startD1Worker(
      {},
      { migrationThroughIndex: 10 },
    );
    try {
      const database = await beforeMigration0011.database();
      await withReadyEnvironment(async () => {
        const readiness = await loadApplicationReadiness({
          database,
          media: mediaReturning(null),
          dependencyTimeoutMs: 2_000,
        });
        assert.equal(readiness.status, "degraded");
        assert.equal(readiness.checks.database, false);
        assertSchemaDetailsPrivate(readiness);
      });
    } finally {
      await beforeMigration0011.dispose();
    }

    const currentSchema = await startD1Worker();
    try {
      const database = await currentSchema.database();
      await withReadyEnvironment(async () => {
        const ready = await loadApplicationReadiness({
          database,
          media: mediaReturning(null),
          dependencyTimeoutMs: 2_000,
        });
        assert.equal(ready.status, "ready");
        assert.equal(ready.checks.database, true);
      });

      await currentSchema.inspect([
        { sql: "drop index abuse_rate_limits_expires_idx" },
      ]);
      await withReadyEnvironment(async () => {
        const readiness = await loadApplicationReadiness({
          database: await currentSchema.database(),
          media: mediaReturning(null),
          dependencyTimeoutMs: 2_000,
        });
        assert.equal(readiness.status, "degraded");
        assert.equal(readiness.checks.database, false);
        assertSchemaDetailsPrivate(readiness);
      });
    } finally {
      await currentSchema.dispose();
    }
  },
);

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

test("application readiness exposes only a normalized fail-closed write state", async () => {
  for (const testCase of [
    { value: "frozen", expectedState: "frozen" },
    { value: undefined, expectedState: "invalid" },
    { value: "invalid", expectedState: "invalid" },
    { value: " enabled ", expectedState: "invalid" },
    { value: " frozen ", expectedState: "invalid" },
  ]) {
    await withReadyEnvironment(
      async () => {
        const readiness = await readyApplicationReadiness();
        assert.equal(readiness.status, "degraded");
        assert.equal(readiness.checks.applicationWritesEnabled, false);
        assert.deepEqual(readiness.writeControl, {
          state: testCase.expectedState,
        });
        assert.equal(
          JSON.stringify(readiness).includes(String(testCase.value)),
          testCase.value === testCase.expectedState,
        );
      },
      { APPLICATION_WRITE_MODE: testCase.value },
    );
  }
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

function assertSchemaDetailsPrivate(readiness) {
  const serialized = JSON.stringify(readiness);
  for (const detail of [
    "abuse_rate_limits",
    "share_close_network",
    "share_close_session",
    "auth_login_network",
    "oidc_login_transactions",
    "instructor_sessions",
    "window_expires_at",
  ]) {
    assert.equal(serialized.includes(detail), false);
  }
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
