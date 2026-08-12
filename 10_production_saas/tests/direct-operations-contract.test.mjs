import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES,
  PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS,
  PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES,
  PRIVATE_SUCCESSOR_NON_SECRET_VARIABLES,
  PREFLIGHT_BLOCKER_IDS,
  assertLocalOnlyPreflightInvocation,
  assertManifestHashChain,
  buildPrivateSuccessorManifest,
  buildPrivateSuccessorReadiness,
  loadVerifiedPrivateSuccessorManifest,
  sha256,
  validatePrivateSuccessorNonSecretVariables,
  validateRequiredConsentPolicyRegistryJson,
  writePrivateSuccessorManifest,
} from "../scripts/direct-operations-contract.mjs";
import {
  loadExactPackagedMigrationBundle,
  runIsolatedDirectD1Preflight,
  validateMigration0011Inspection,
} from "../scripts/preflight-direct-d1.mjs";

const repositoryRoot = new URL("../", import.meta.url);

const validConsentPolicyRegistry = JSON.stringify({
  golfer_record: {
    version: "golfer-record-v1",
    purposeDescription: "Approved synthetic golfer-record policy text.",
    subjectTypes: ["account"],
  },
  roadmap_sharing: {
    version: "roadmap-sharing-v1",
    purposeDescription: "Approved synthetic roadmap-sharing policy text.",
    subjectTypes: ["golfer"],
  },
});

const validNonSecretVariables = Object.freeze({
  APP_URL: "https://app.example.ca",
  APPLICATION_WRITE_MODE: "frozen",
  AUTH_SESSION_LIFETIME_SECONDS: "3600",
  BILLING_CHECKOUT_ENABLED: "false",
  CONSENT_POLICY_REGISTRY_JSON: validConsentPolicyRegistry,
  INSTRUCTOR_ACCESS_MODE: "owner_private",
  INSTRUCTOR_AUTH_MODE: "oidc_v1",
  OIDC_CLIENT_ID: "roadmap-public-client",
  OIDC_ID_TOKEN_SIGNING_ALG: "RS256",
  OIDC_ISSUER: "https://identity.example.ca",
  OIDC_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_basic",
  RELEASE_ID: "0123456789abcdef0123456789abcdef01234567",
});

test("consent configuration exactly mirrors runtime shape and required policies", () => {
  const evidence = validateRequiredConsentPolicyRegistryJson(
    validConsentPolicyRegistry,
  );
  assert.deepEqual(evidence.configuredPurposes, [
    "golfer_record",
    "roadmap_sharing",
  ]);
  assert.equal(evidence.requiredPoliciesReady, true);
  assert.match(evidence.registrySha256, /^[0-9a-f]{64}$/);
  assert.equal(
    JSON.stringify(evidence).includes("Approved synthetic"),
    false,
  );

  const invalidRegistries = [
    "{}",
    JSON.stringify({
      golfer_record: {
        version: "v1",
        purposeDescription: "Missing required roadmap-sharing policy.",
        subjectTypes: ["account"],
      },
    }),
    JSON.stringify({
      API_TOKEN: {
        version: "v1",
        purposeDescription: "Synthetic secret-shaped field.",
        subjectTypes: ["account"],
      },
    }),
    JSON.stringify({
      ...JSON.parse(validConsentPolicyRegistry),
      golfer_record: {
        ...JSON.parse(validConsentPolicyRegistry).golfer_record,
        unexpected: "field",
      },
    }),
    JSON.stringify({
      ...JSON.parse(validConsentPolicyRegistry),
      roadmap_sharing: {
        ...JSON.parse(validConsentPolicyRegistry).roadmap_sharing,
        subjectTypes: ["account"],
      },
    }),
    JSON.stringify({
      ...JSON.parse(validConsentPolicyRegistry),
      golfer_record: {
        ...JSON.parse(validConsentPolicyRegistry).golfer_record,
        subjectTypes: ["account", "account"],
      },
    }),
  ];
  for (const registry of invalidRegistries) {
    assert.throws(
      () => validateRequiredConsentPolicyRegistryJson(registry),
      (error) =>
        error.blockerId ===
        PREFLIGHT_BLOCKER_IDS.containment.configurationShape,
    );
  }
});

test("private-successor configuration and secret-name inventories are exact", () => {
  assert.deepEqual(
    PRIVATE_SUCCESSOR_NON_SECRET_VARIABLES.map(({ name }) => name),
    Object.keys(validNonSecretVariables).sort(),
  );
  assert.deepEqual(PRIVATE_SUCCESSOR_EXPECTED_SECRET_NAMES, [
    "ABUSE_LIMIT_PEPPER",
    "AUTH_SESSION_PEPPER",
    "AUTH_TRANSACTION_ENCRYPTION_KEY",
    "DATA_REQUEST_OPERATOR_ACCESS_PEPPER",
    "DATA_REQUEST_OPERATOR_EMAIL_DIGESTS",
    "OIDC_CLIENT_SECRET",
    "OWNER_PRIVATE_ACCESS_PEPPER",
    "OWNER_PRIVATE_EMAIL_DIGESTS",
    "SHARE_TOKEN_PEPPER",
  ]);
  assert.deepEqual(PRIVATE_SUCCESSOR_FORBIDDEN_SECRET_NAMES, [
    "SITES_BYPASS_BEARER",
    "SIWC_BYPASS_BEARER",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]);

  const result = validatePrivateSuccessorNonSecretVariables(validNonSecretVariables);
  assert.equal(result.fixedValues.APPLICATION_WRITE_MODE, "frozen");
  assert.equal(result.fixedValues.BILLING_CHECKOUT_ENABLED, "false");
  assert.match(result.configurationSha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result).includes(validNonSecretVariables.APP_URL), false);
  assert.equal(JSON.stringify(result).includes(validNonSecretVariables.OIDC_CLIENT_ID), false);
});

test("non-secret configuration fails closed without reflecting supplied values", () => {
  const secretSentinel = "sensitive-sentinel-must-not-be-reflected";
  for (const variables of [
    { ...validNonSecretVariables, APP_URL: "https://app.example.ca/" },
    { ...validNonSecretVariables, OIDC_ISSUER: "https://identity.example.ca/" },
    { ...validNonSecretVariables, APPLICATION_WRITE_MODE: "enabled" },
    { ...validNonSecretVariables, STRIPE_SECRET_KEY: secretSentinel },
    Object.fromEntries(
      Object.entries(validNonSecretVariables).filter(([name]) => name !== "RELEASE_ID"),
    ),
  ]) {
    assert.throws(
      () => validatePrivateSuccessorNonSecretVariables(variables),
      (error) => {
        assert.equal(
          error.blockerId,
          PREFLIGHT_BLOCKER_IDS.containment.configurationShape,
        );
        assert.equal(error.message.includes(secretSentinel), false);
        return true;
      },
    );
  }

  assert.doesNotThrow(() =>
    validatePrivateSuccessorNonSecretVariables({
      ...validNonSecretVariables,
      OIDC_ISSUER: "https://identity.example.ca/tenant",
    }),
  );
});

test("local-only invocation rejects every CLI input and credential-bearing environment name", () => {
  assert.deepEqual(
    assertLocalOnlyPreflightInvocation({ argumentsList: [], environmentNames: [] }),
    { localOnly: true, acceptedCliInputs: 0 },
  );
  assert.throws(
    () =>
      assertLocalOnlyPreflightInvocation({
        argumentsList: ["--remote", "credential-value-must-not-leak"],
        environmentNames: [],
      }),
    (error) => {
      assert.equal(error.blockerId, PREFLIGHT_BLOCKER_IDS.containment.cliInput);
      assert.equal(error.message.includes("credential-value-must-not-leak"), false);
      return true;
    },
  );
  for (const name of [
    "CLOUDFLARE_API_TOKEN",
    "CF_API_KEY",
    "WRANGLER_REMOTE",
    "OIDC_CLIENT_SECRET",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    assert.throws(
      () =>
        assertLocalOnlyPreflightInvocation({
          argumentsList: [],
          environmentNames: [name],
        }),
      (error) =>
        error.blockerId ===
        PREFLIGHT_BLOCKER_IDS.containment.credentialEnvironment,
    );
  }
});

test("manifest hash chain preserves separate readiness stages and no runtime values", async (context) => {
  const readiness = buildPrivateSuccessorReadiness();
  assert.equal(readiness.containment.ready, true);
  assert.equal(readiness.local.ready, true);
  assert.equal(readiness.provider.ready, false);
  assert.equal(readiness.release.ready, false);
  assert.deepEqual(readiness.release.dependsOn, ["containment", "local", "provider"]);
  assert.equal(
    readiness.provider.blockerIds.some((id) => id.startsWith("RELEASE_")),
    false,
  );
  assert.equal(
    readiness.release.blockerIds.some((id) => id.startsWith("PROVIDER_")),
    false,
  );

  const inventoryPaths = [
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map((tag) => `${tag}.sql`),
    ...PRIVATE_SUCCESSOR_EXPECTED_MIGRATION_TAGS.map(
      (_tag, index) => `meta/${String(index).padStart(4, "0")}_snapshot.json`,
    ),
    "meta/_journal.json",
  ].sort();
  const migrationInventory = inventoryPaths.map((relativePath) => {
    const contents = `fixture:${relativePath}`;
    return {
      relativePath,
      bytes: Buffer.byteLength(contents),
      sha256: sha256(contents),
    };
  });
  const manifest = buildPrivateSuccessorManifest({ migrationInventory, readiness });
  assert.equal(assertManifestHashChain(manifest), true);
  const serialized = JSON.stringify(manifest);
  for (const name of [
    "APP_URL",
    "AUTH_SESSION_LIFETIME_SECONDS",
    "CONSENT_POLICY_REGISTRY_JSON",
    "OIDC_CLIENT_ID",
    "OIDC_ISSUER",
    "RELEASE_ID",
  ]) {
    const value = validNonSecretVariables[name];
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(serialized.includes("credential-value"), false);

  const tampered = structuredClone(manifest);
  tampered.readiness.stages.release.ready = true;
  assert.throws(
    () => assertManifestHashChain(tampered),
    (error) => error.blockerId === PREFLIGHT_BLOCKER_IDS.containment.outputBoundary,
  );
  const selfConsistentButArbitrary = structuredClone(manifest);
  selfConsistentButArbitrary.contract.descriptor.expectedSecretNames.push(
    "ARBITRARY_SECRET",
  );
  assert.throws(
    () => assertManifestHashChain(selfConsistentButArbitrary),
    (error) => error.blockerId === PREFLIGHT_BLOCKER_IDS.containment.outputBoundary,
  );

  const root = await mkdtemp(path.join(tmpdir(), "roadmap-manifest-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, ".gitignore"), "/.work/\n");
  for (const migrationRoot of [
    path.join(root, "drizzle"),
    path.join(root, "dist", ".openai", "drizzle"),
  ]) {
    await mkdir(path.join(migrationRoot, "meta"), { recursive: true });
    await Promise.all(
      inventoryPaths.map((relativePath) =>
        writeFile(
          path.join(migrationRoot, ...relativePath.split("/")),
          `fixture:${relativePath}`,
        ),
      ),
    );
  }
  const outputPath = await writePrivateSuccessorManifest({
    projectRoot: root,
    manifest,
  });
  assert.equal(
    outputPath,
    path.join(root, ".work", "private-successor-preflight", "manifest.json"),
  );
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), manifest);
});

test(
  "exact packaged migrations apply through 0016 and preserve the migration-0011 auth contract",
  { timeout: 60_000 },
  async (context) => {
    const root = await mkdtemp(path.join(tmpdir(), "roadmap-d1-preflight-test-"));
    context.after(() => rm(root, { recursive: true, force: true }));
    await Promise.all([
      cp(new URL("../drizzle/", import.meta.url), path.join(root, "drizzle"), {
        recursive: true,
      }),
      cp(
        new URL("../drizzle/", import.meta.url),
        path.join(root, "dist", ".openai", "drizzle"),
        { recursive: true },
      ),
    ]);

    const bundle = await loadExactPackagedMigrationBundle(root);
    assert.equal(bundle.migrations.at(-1).tag, "0016_handy_green_goblin");
    assert.ok(
      bundle.migrationInventory.some(
        ({ relativePath }) => relativePath === "0011_stormy_shard.sql",
      ),
    );
    assert.ok(
      bundle.migrationInventory.some(
        ({ relativePath }) => relativePath === "0016_handy_green_goblin.sql",
      ),
    );
    const result = await runIsolatedDirectD1Preflight({ projectRoot: root });
    assert.deepEqual(result.localBlockers, []);
    assert.equal(result.inspectedLatestMigration, "0016_handy_green_goblin");
    await writeFile(path.join(root, ".gitignore"), "/.work/\n");
    const exactManifest = buildPrivateSuccessorManifest({
      migrationInventory: result.migrationInventory,
      readiness: buildPrivateSuccessorReadiness({
        containmentBlockers: [],
        localBlockers: result.localBlockers,
      }),
    });
    const exactManifestPath = await writePrivateSuccessorManifest({
      projectRoot: root,
      manifest: exactManifest,
    });
    assert.equal(assertManifestHashChain(exactManifest), true);
    assert.equal(
      exactManifestPath,
      path.join(root, ".work", "private-successor-preflight", "manifest.json"),
    );
    const verifiedManifest = await loadVerifiedPrivateSuccessorManifest({
      projectRoot: root,
    });
    assert.equal(verifiedManifest.containmentReady, true);
    assert.equal(verifiedManifest.localReady, true);
    assert.equal(verifiedManifest.operationsProfileReady, true);
    assert.equal(
      verifiedManifest.manifestSha256,
      exactManifest.manifestSha256,
    );

    const packagedLatest = path.join(
      root,
      "dist",
      ".openai",
      "drizzle",
      "0016_handy_green_goblin.sql",
    );
    const original = await readFile(packagedLatest, "utf8");
    await writeFile(packagedLatest, `${original}\n-- packaged drift\n`);
    await assert.rejects(
      loadExactPackagedMigrationBundle(root),
      (error) => error.blockerId === PREFLIGHT_BLOCKER_IDS.local.migrationParity,
    );
  },
);

test("pure migration inspection validation separates structure and foreign-key blockers", () => {
  assert.deepEqual(validateMigration0011Inspection({}), [
    PREFLIGHT_BLOCKER_IDS.local.foreignKeys,
    PREFLIGHT_BLOCKER_IDS.local.migration0011,
  ].sort());
});

test("the repository source used by the isolated fixture is local", () => {
  assert.equal(repositoryRoot.protocol, "file:");
});
