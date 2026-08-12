import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DIRECT_CLOUDFLARE_OUTPUT,
  EXPECTED_DIRECT_COMPATIBILITY_FLAGS,
  renderDirectCloudflareConfig,
} from "../scripts/render-direct-cloudflare-config.mjs";
import {
  PREFLIGHT_BLOCKER_IDS,
  PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES,
  PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES,
  PRIVATE_SUCCESSOR_MANIFEST_PATH,
} from "../scripts/direct-operations-contract.mjs";
import {
  inspectDirectCloudflareConfig,
  verifyDirectCloudflareConfig,
} from "../scripts/verify-direct-cloudflare-config.mjs";

const VALID_CONSENT_POLICY_REGISTRY = JSON.stringify({
  golfer_record: {
    version: "approved-golfer-record-v1",
    purposeDescription: "Approved synthetic fixture text.",
    subjectTypes: ["account"],
  },
  roadmap_sharing: {
    version: "approved-roadmap-sharing-v1",
    purposeDescription: "Approved synthetic fixture text.",
    subjectTypes: ["golfer"],
  },
});

const VALID_INPUTS = Object.freeze({
  accountId: "8f14e45fceea167a5a36dedd4bea2543",
  workerName: "roadmap-production",
  d1DatabaseName: "roadmap-production",
  d1DatabaseId: "9c104a63-f432-4cf5-9d79-3603c52d6ef2",
  r2Bucket: "roadmap-production-media",
  appUrl: "https://roadmap.example.ca",
  oidcIssuer: "https://identity.example.ca/roadmap",
  oidcClientId: "roadmap-production-client",
  authSessionLifetimeSeconds: "28800",
  releaseId: "roadmap-private-successor-v1",
  consentPolicyRegistryJson: VALID_CONSENT_POLICY_REGISTRY,
});

test("renders an exact contained direct-Cloudflare projection from fresh build output", async (context) => {
  const root = await createFixture(context);
  const result = await renderDirectCloudflareConfig({
    projectRoot: root,
    inputs: VALID_INPUTS,
  });
  const expectedOutput = path.join(root, ...DIRECT_CLOUDFLARE_OUTPUT.split("/"));
  assert.equal(result.outputPath, expectedOutput);
  assert.equal(result.releaseReady, false);

  const config = JSON.parse(await readFile(expectedOutput, "utf8"));
  assert.equal(config.account_id, VALID_INPUTS.accountId);
  assert.equal(config.name, VALID_INPUTS.workerName);
  assert.equal(config.main, "../../dist/server/index.js");
  assert.equal(config.assets.directory, "../../dist/client");
  assert.equal(
    config.d1_databases[0].migrations_dir,
    "../../dist/.openai/drizzle",
  );
  assert.equal(config.vars.APPLICATION_WRITE_MODE, "frozen");
  assert.equal(config.vars.BILLING_CHECKOUT_ENABLED, "false");
  assert.equal(config.vars.INSTRUCTOR_ACCESS_MODE, "owner_private");
  assert.equal(config.vars.RELEASE_ID, VALID_INPUTS.releaseId);
  assert.equal(
    config.vars.CONSENT_POLICY_REGISTRY_JSON,
    VALID_CONSENT_POLICY_REGISTRY,
  );
  assert.equal(config.d1_databases[0].database_id, VALID_INPUTS.d1DatabaseId);
  assert.equal(config.r2_buckets[0].bucket_name, VALID_INPUTS.r2Bucket);
  assert.equal(config.vars.APP_URL, VALID_INPUTS.appUrl);
  assert.equal(config.vars.INSTRUCTOR_AUTH_MODE, "oidc_v1");
  assert.equal(config.vars.OIDC_ISSUER, VALID_INPUTS.oidcIssuer);
  assert.equal(config.vars.OIDC_CLIENT_ID, VALID_INPUTS.oidcClientId);
  assert.equal(config.vars.OIDC_TOKEN_ENDPOINT_AUTH_METHOD, "client_secret_basic");
  assert.equal(config.vars.OIDC_ID_TOKEN_SIGNING_ALG, "RS256");
  assert.deepEqual(
    [...config.compatibility_flags].sort(),
    EXPECTED_DIRECT_COMPATIBILITY_FLAGS,
  );
  assert.equal(
    config.vars.AUTH_SESSION_LIFETIME_SECONDS,
    VALID_INPUTS.authSessionLifetimeSeconds,
  );
  assert.deepEqual(config.triggers.crons, ["*/5 * * * *"]);
  assert.deepEqual(config.observability, {
    enabled: false,
    logs: { enabled: false, invocation_logs: false },
  });
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(Object.hasOwn(config, "project_id"), false);
  assert.equal(Object.hasOwn(config, "topLevelName"), false);
  for (const secretName of [
    ...PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES,
    ...PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES,
  ]) {
    assert.equal(Object.hasOwn(config.vars, secretName), false);
  }

  const report = await inspectDirectCloudflareConfig({ projectRoot: root });
  assert.equal(report.structuralReady, true);
  assert.equal(report.authBoundaryReady, true);
  assert.equal(report.operationsProfileReady, false);
  assert.deepEqual(report.operationsBlockerIds, [
    PREFLIGHT_BLOCKER_IDS.local.preflightManifest,
  ]);
  assert.equal(report.providerEvidenceReady, false);
  assert.equal(report.hostedReleaseEvidenceReady, false);
  assert.equal(report.releaseReady, false);
  assert.doesNotMatch(report.blockers.join("\n"), /oidc_v1 runtime/i);
  assert.match(
    report.blockers.join("\n"),
    /LOCAL_PREFLIGHT_MANIFEST_MISSING_OR_INVALID/,
  );
  assert.match(report.blockers.join("\n"), /PROVIDER_ACCOUNT_BINDING_UNPROVEN/);
  assert.match(
    report.blockers.join("\n"),
    /RELEASE_OWNER_EXACT_VERSION_ACCEPTANCE_MISSING/,
  );
});

test("rejects missing, malformed, placeholder, and non-canonical explicit inputs", async (context) => {
  const cases = [
    [{ ...VALID_INPUTS, accountId: undefined }, /account ID is required/i],
    [{ ...VALID_INPUTS, accountId: "8F14E45FCEEA167A5A36DEDD4BEA2543" }, /32 lowercase hexadecimal/i],
    [{ ...VALID_INPUTS, accountId: "8f14e45fceea167a5a36dedd4bea254" }, /32 lowercase hexadecimal/i],
    [{ ...VALID_INPUTS, workerName: undefined }, /worker name is required/i],
    [{ ...VALID_INPUTS, workerName: "Unsafe_Name" }, /Worker name must be/i],
    [{ ...VALID_INPUTS, d1DatabaseName: "has spaces" }, /D1 database name/i],
    [{ ...VALID_INPUTS, d1DatabaseId: "not-a-uuid" }, /canonical lowercase UUID/i],
    [
      {
        ...VALID_INPUTS,
        d1DatabaseId: "00000000-0000-4000-8000-000000000000",
      },
      /placeholder UUID/i,
    ],
    [{ ...VALID_INPUTS, r2Bucket: "UPPERCASE" }, /R2 bucket must be/i],
    [{ ...VALID_INPUTS, appUrl: "http://roadmap.example.ca" }, /exact public HTTPS origin/i],
    [{ ...VALID_INPUTS, appUrl: "https://roadmap.example.ca/path" }, /exact public HTTPS origin/i],
    [{ ...VALID_INPUTS, appUrl: "https://roadmap.example.ca/" }, /exact public HTTPS origin/i],
    [{ ...VALID_INPUTS, appUrl: "https://roadmap.example.ca:8443" }, /exact public HTTPS origin/i],
    [{ ...VALID_INPUTS, oidcIssuer: "http://identity.example.ca" }, /public HTTPS URL/i],
    [{ ...VALID_INPUTS, oidcIssuer: "https://identity.example.ca?tenant=x" }, /public HTTPS URL/i],
    [{ ...VALID_INPUTS, oidcClientId: "contains whitespace" }, /visible ASCII/i],
    [{ ...VALID_INPUTS, authSessionLifetimeSeconds: "899" }, /900 through 86400/i],
    [{ ...VALID_INPUTS, authSessionLifetimeSeconds: "86401" }, /900 through 86400/i],
    [{ ...VALID_INPUTS, releaseId: "unversioned" }, /non-secret configuration is invalid/i],
    [{ ...VALID_INPUTS, consentPolicyRegistryJson: "[]" }, /non-secret configuration is invalid/i],
    [
      {
        ...VALID_INPUTS,
        consentPolicyRegistryJson: JSON.stringify({
          API_TOKEN: "synthetic-secret-sentinel",
        }),
      },
      /non-secret configuration is invalid/i,
    ],
    [
      {
        ...VALID_INPUTS,
        consentPolicyRegistryJson: JSON.stringify({
          golfer_record: JSON.parse(VALID_CONSENT_POLICY_REGISTRY).golfer_record,
        }),
      },
      /non-secret configuration is invalid/i,
    ],
    [
      {
        ...VALID_INPUTS,
        consentPolicyRegistryJson: JSON.stringify({
          ...JSON.parse(VALID_CONSENT_POLICY_REGISTRY),
          roadmap_sharing: {
            ...JSON.parse(VALID_CONSENT_POLICY_REGISTRY).roadmap_sharing,
            extra: "not-runtime-shape",
          },
        }),
      },
      /non-secret configuration is invalid/i,
    ],
  ];

  for (const [inputs, expected] of cases) {
    const root = await createFixture(context);
    await assert.rejects(
      renderDirectCloudflareConfig({ projectRoot: root, inputs }),
      expected,
    );
    await assert.rejects(
      readFile(path.join(root, ...DIRECT_CLOUDFLARE_OUTPUT.split("/"))),
      /ENOENT/,
    );
  }
});

test("rejects unsafe source drift, secrets, Sites metadata, and migration mismatch", async (context) => {
  const mutations = [
    [
      (config) => {
        config.compatibility_flags = ["nodejs_compat"];
      },
      /exactly nodejs_compat and global_fetch_strictly_public/i,
    ],
    [
      (config) => {
        config.triggers.crons = ["0 * * * *"];
      },
      /retain cron/i,
    ],
    [
      (config) => {
        config.observability.logs.invocation_logs = true;
      },
      /disable observability, logs, and invocation logs/i,
    ],
    [
      (config) => {
        config.project_id = "appgprj_synthetic";
      },
      /Sites project_id/i,
    ],
    [
      (config) => {
        config.vars = { API_TOKEN: "must-not-be-copied" };
      },
      /secrets or credentials/i,
    ],
  ];

  for (const [mutate, expected] of mutations) {
    const root = await createFixture(context);
    const configPath = path.join(root, "dist", "server", "wrangler.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    mutate(config);
    await writeFile(configPath, `${JSON.stringify(config)}\n`);
    await assert.rejects(
      renderDirectCloudflareConfig({ projectRoot: root, inputs: VALID_INPUTS }),
      expected,
    );
  }

  const mismatchRoot = await createFixture(context);
  await writeFile(
    path.join(
      mismatchRoot,
      "dist",
      ".openai",
      "drizzle",
      "0011_stormy_shard.sql",
    ),
    "CREATE TABLE changed (id TEXT PRIMARY KEY);\n",
  );
  await assert.rejects(
    renderDirectCloudflareConfig({
      projectRoot: mismatchRoot,
      inputs: VALID_INPUTS,
    }),
    /do not exactly match source drizzle migrations/i,
  );
});

test("release verification admits local auth and operations but fails closed on external evidence", async (context) => {
  const root = await createFixture(context);
  await renderDirectCloudflareConfig({ projectRoot: root, inputs: VALID_INPUTS });

  const beforePreflight = await inspectDirectCloudflareConfig({
    projectRoot: root,
  });
  assert.equal(beforePreflight.operationsProfileReady, false);
  assert.deepEqual(beforePreflight.operationsBlockerIds, [
    PREFLIGHT_BLOCKER_IDS.local.preflightManifest,
  ]);

  const structural = await verifyDirectCloudflareConfig({
    projectRoot: root,
    requireReleaseReady: false,
    refreshLocalPreflight: true,
    localPreflightEnvironmentNames: [],
  });
  assert.equal(structural.structuralReady, true);
  assert.equal(structural.authBoundaryReady, true);
  assert.equal(structural.operationsProfileReady, true);
  assert.match(structural.operationsManifestSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(structural.operationsBlockerIds, []);
  assert.equal(structural.providerEvidenceReady, false);
  assert.equal(structural.hostedReleaseEvidenceReady, false);
  assert.equal(structural.releaseReady, false);

  await assert.rejects(
    verifyDirectCloudflareConfig({ projectRoot: root }),
    /release readiness refused[\s\S]*PROVIDER_ACCOUNT_BINDING_UNPROVEN/i,
  );

  const manifestPath = path.join(
    root,
    ...PRIVATE_SUCCESSOR_MANIFEST_PATH.split("/"),
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.readiness.stages.local.ready = false;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const tamperedEvidence = await inspectDirectCloudflareConfig({
    projectRoot: root,
  });
  assert.equal(tamperedEvidence.operationsProfileReady, false);
  assert.deepEqual(tamperedEvidence.operationsBlockerIds, [
    PREFLIGHT_BLOCKER_IDS.containment.outputBoundary,
  ]);
  assert.equal(tamperedEvidence.releaseReady, false);

  const output = path.join(root, ...DIRECT_CLOUDFLARE_OUTPUT.split("/"));
  const config = JSON.parse(await readFile(output, "utf8"));
  config.vars.INSTRUCTOR_AUTH_MODE = "unreviewed-label";
  await writeFile(output, `${JSON.stringify(config, null, 2)}\n`);
  await assert.rejects(
    verifyDirectCloudflareConfig({
      projectRoot: root,
      requireReleaseReady: false,
    }),
    /differs from the reviewed projection/i,
  );
});

test("operations readiness refuses a package without the exact migration-0011 contract", async (context) => {
  const root = await createFixture(context);
  await renderDirectCloudflareConfig({ projectRoot: root, inputs: VALID_INPUTS });
  for (const relativePath of [
    "0011_stormy_shard.sql",
    "meta/0011_snapshot.json",
  ]) {
    await Promise.all([
      rm(path.join(root, "drizzle", ...relativePath.split("/"))),
      rm(
        path.join(
          root,
          "dist",
          ".openai",
          "drizzle",
          ...relativePath.split("/"),
        ),
      ),
    ]);
  }

  await assert.rejects(
    verifyDirectCloudflareConfig({
      projectRoot: root,
      requireReleaseReady: false,
      refreshLocalPreflight: true,
      localPreflightEnvironmentNames: [],
    }),
    /LOCAL_PACKAGED_MIGRATION_INVENTORY_INVALID/,
  );
  const report = await inspectDirectCloudflareConfig({ projectRoot: root });
  assert.equal(report.operationsProfileReady, false);
  assert.equal(report.providerEvidenceReady, false);
  assert.equal(report.hostedReleaseEvidenceReady, false);
  assert.equal(report.releaseReady, false);
});

async function createFixture(context) {
  const root = await mkdtemp(path.join(os.tmpdir(), "direct-cloudflare-readiness-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directories = [
    path.join(root, "dist", "server"),
    path.join(root, "dist", "client"),
    path.join(root, "dist", ".openai"),
  ];
  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));

  const workerConfig = {
    topLevelName: "roadmap-production-saas",
    name: "roadmap-production-saas",
    main: "index.js",
    compatibility_date: "2026-08-07",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    no_bundle: true,
    vars: {},
    d1_databases: [
      {
        binding: "DB",
        database_name: "site-creator-d1",
        database_id: "00000000-0000-4000-8000-000000000000",
        migrations_dir: "../../migrations",
      },
    ],
    r2_buckets: [{ binding: "MEDIA", bucket_name: "site-creator-r2" }],
    triggers: { crons: ["*/5 * * * *"] },
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    assets: { directory: "../client" },
    observability: {
      enabled: false,
      logs: { enabled: false, invocation_logs: false },
    },
    secrets_store_secrets: [],
  };

  await Promise.all([
    cp(new URL("../drizzle/", import.meta.url), path.join(root, "drizzle"), {
      recursive: true,
    }),
    cp(
      new URL("../drizzle/", import.meta.url),
      path.join(root, "dist", ".openai", "drizzle"),
      { recursive: true },
    ),
    writeFile(path.join(root, ".gitignore"), "/.work/\n"),
    writeFile(path.join(root, "dist", "server", "index.js"), "export default {};\n"),
    writeFile(
      path.join(root, "dist", "server", "wrangler.json"),
      `${JSON.stringify(workerConfig)}\n`,
    ),
  ]);
  return root;
}
