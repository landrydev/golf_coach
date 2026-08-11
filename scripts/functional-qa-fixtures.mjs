import { createHmac } from "node:crypto";
import {
  grantSyntheticGolferRecordConsent,
  grantSyntheticRoadmapSharingConsent,
  writeHeaders,
} from "../tests/support/d1-worker.mjs";
import { FUNCTIONAL_QA_RICH_FIXTURE_HOOKS } from "./functional-qa-rich-fixtures.mjs";

export const FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY = Object.freeze({
  version: "synthetic-functional-qa-v1",
  maxBytes: 50_000_000,
  maxVideoDurationMs: 180_000,
  allowedMimeTypes: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "text/csv",
  ]),
  // Synthetic QA may exercise private media without inventing owner-approved
  // consent wording. Production remains fail-closed and supplies its own policy.
  accountMediaConsentRequired: false,
  golferMediaConsentRequired: false,
});

export const FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY_JSON = JSON.stringify(
  FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY,
);

const FUNCTIONAL_QA_OWNER_ACCESS_PEPPER =
  "synthetic-functional-qa-owner-access-pepper-v1-2026-08-10";

export const FUNCTIONAL_QA_SCENARIOS = Object.freeze([
  scenario(
    "fresh",
    "Fresh empty coach",
    "A new synthetic instructor with no saved profile, package, or golfer state.",
    false,
  ),
  scenario(
    "standard",
    "Standard four-phase roadmap",
    "Coach Rowan, one package, and one published four-phase roadmap.",
    true,
  ),
  scenario(
    "three-phase",
    "Three phases without a package",
    "A published three-phase roadmap whose useful path does not depend on a package.",
    true,
  ),
  scenario(
    "mixed-30",
    "Thirty mixed-state golfers",
    "Thirty golfers across incomplete, draft, published, paused, completed, archived, and review-needed states.",
    true,
  ),
  scenario(
    "long-content",
    "Long-content roadmap",
    "Long but valid names and narrative fields plus lesson, practice, and evidence content.",
    true,
  ),
  scenario(
    "expired",
    "Expired private access",
    "A published roadmap whose synthetic capability has crossed its expiry boundary.",
    true,
  ),
  scenario(
    "revoked",
    "Revoked private access",
    "A published roadmap whose synthetic private share has been explicitly revoked.",
    true,
  ),
  Object.freeze({
    ...scenario(
      "republished",
      "Republished roadmap",
      "A changed roadmap with an unavailable predecessor capability and an active replacement.",
      true,
    ),
    hasOldGolferEntry: true,
  }),
]);

const scenarioById = new Map(
  FUNCTIONAL_QA_SCENARIOS.map((definition) => [definition.id, definition]),
);

const STANDARD_IDENTITY = Object.freeze({
  email: "visual.coach@example.test",
  name: "Coach Rowan",
});

export function functionalQaIdentity(scenarioId) {
  if (scenarioId === "standard") return STANDARD_IDENTITY;
  const definition = scenarioById.get(scenarioId);
  if (!definition) throw new Error(`Unknown functional QA scenario: ${scenarioId}`);
  const readableName = definition.label
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  return Object.freeze({
    email: `qa.${scenarioId}@example.test`,
    name: `Coach ${readableName}`.slice(0, 120),
  });
}

export function isFunctionalQaScenario(value) {
  return typeof value === "string" && scenarioById.has(value);
}

export function functionalQaWorkerBindings() {
  const ownerDigests = FUNCTIONAL_QA_SCENARIOS.map(({ id }) =>
    createHmac("sha256", FUNCTIONAL_QA_OWNER_ACCESS_PEPPER)
      .update(functionalQaIdentity(id).email.trim().toLowerCase())
      .digest("hex"),
  );
  return Object.freeze({
    OWNER_PRIVATE_ACCESS_PEPPER: FUNCTIONAL_QA_OWNER_ACCESS_PEPPER,
    OWNER_PRIVATE_EMAIL_DIGESTS: ownerDigests.join(","),
    MEDIA_UPLOAD_POLICY_JSON: FUNCTIONAL_QA_MEDIA_UPLOAD_POLICY_JSON,
  });
}

export function createFunctionalQaFixtureRegistry({
  worker,
  richFixtureHooks = [],
}) {
  if (!worker?.dispatch || !worker?.inspect) {
    throw new Error("The functional QA fixture registry requires a D1 worker harness.");
  }
  const hooks = normalizeRichFixtureHooks([
    ...richFixtureHooks,
    ...FUNCTIONAL_QA_RICH_FIXTURE_HOOKS,
  ]);
  const fixturePromises = new Map();

  return Object.freeze({
    definitions: FUNCTIONAL_QA_SCENARIOS,
    identityFor: functionalQaIdentity,
    async get(scenarioId) {
      if (!isFunctionalQaScenario(scenarioId)) {
        throw new Error(`Unknown functional QA scenario: ${scenarioId}`);
      }
      if (!fixturePromises.has(scenarioId)) {
        const fixturePromise = seedScenario(worker, scenarioId)
          .then(async (fixture) => {
            const context = Object.freeze({
              scenario: scenarioById.get(scenarioId),
              worker,
              identity: fixture.identity,
              fixture,
              helpers: fixtureHelpers(worker, fixture.identity),
            });
            for (const hook of hooks) {
              if (hook.scenarios && !hook.scenarios.has(scenarioId)) continue;
              await hook.seed(context);
            }
            return Object.freeze(fixture);
          })
          .catch((error) => {
            fixturePromises.delete(scenarioId);
            throw error;
          });
        fixturePromises.set(scenarioId, fixturePromise);
      }
      return fixturePromises.get(scenarioId);
    },
    seededScenarioIds() {
      return [...fixturePromises.keys()].sort();
    },
  });
}

function scenario(id, label, description, hasGolferEntry) {
  return Object.freeze({ id, label, description, hasGolferEntry });
}

function normalizeRichFixtureHooks(hooks) {
  if (!Array.isArray(hooks)) {
    throw new Error("richFixtureHooks must be an array.");
  }
  return hooks.map((hook, index) => {
    if (typeof hook === "function") {
      return Object.freeze({ name: hook.name || `hook-${index + 1}`, seed: hook });
    }
    if (!hook || typeof hook !== "object" || typeof hook.seed !== "function") {
      throw new Error(`Rich fixture hook ${index + 1} must be a function or { seed } object.`);
    }
    const scenarios = hook.scenarios === undefined
      ? null
      : new Set(hook.scenarios);
    if (scenarios && [...scenarios].some((id) => !isFunctionalQaScenario(id))) {
      throw new Error(`Rich fixture hook ${hook.name || index + 1} names an unknown scenario.`);
    }
    return Object.freeze({
      name: hook.name || `hook-${index + 1}`,
      seed: hook.seed,
      scenarios,
    });
  });
}

async function seedScenario(worker, scenarioId) {
  const identity = functionalQaIdentity(scenarioId);
  if (scenarioId === "fresh") {
    // Keep the account empty while granting the synthetic golfer-record scope
    // required to reach the real empty-state UI. This is test-only evidence;
    // no golfer, profile, package, or coaching record is created here.
    await grantSyntheticGolferRecordConsent(worker, identity);
    return { scenarioId, identity, state: "empty" };
  }
  if (scenarioId === "standard") {
    return seedStandard(worker, identity);
  }
  if (scenarioId === "three-phase") {
    return seedThreePhase(worker, identity);
  }
  if (scenarioId === "mixed-30") {
    return seedMixedThirty(worker, identity);
  }
  if (scenarioId === "long-content") {
    return seedLongContent(worker, identity);
  }
  if (scenarioId === "expired") {
    return seedUnavailableShare(worker, identity, "expired");
  }
  if (scenarioId === "revoked") {
    return seedUnavailableShare(worker, identity, "revoked");
  }
  if (scenarioId === "republished") {
    return seedRepublished(worker, identity);
  }
  throw new Error(`No fixture builder exists for ${scenarioId}.`);
}

async function seedStandard(worker, identity) {
  await seedProfile(worker, identity, {
    businessName: "Foothills Golf Studio",
    philosophy: "Clear priorities, honest evidence, and practical next steps.",
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const coachingPackage = await seedPackage(worker, identity, {
    title: "Four-session development phase",
    description: "Four focused sessions connected to the first roadmap phase.",
  });
  const workspace = await createWorkspace(worker, identity, {
    displayName: "Jordan Synthetic",
    planTitle: "Predictable contact roadmap",
    phaseCount: 4,
    coachingPackageId: coachingPackage.id,
  });
  const share = await publishWorkspace(worker, identity, workspace, {
    recipient: "Synthetic visual-review golfer",
    expiresInDays: 1,
  });
  return {
    scenarioId: "standard",
    identity,
    coachingPackage,
    workspace,
    token: share.token,
    share,
  };
}

async function seedThreePhase(worker, identity) {
  await seedProfile(worker, identity, {
    businessName: "Prairie Three Phase Golf",
    philosophy: "Use the smallest useful roadmap and add detail only when it helps.",
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const workspace = await createWorkspace(worker, identity, {
    displayName: "Taylor Three Phase",
    planTitle: "Three-phase contact roadmap",
    phaseCount: 3,
    coachingPackageId: null,
  });
  const share = await publishWorkspace(worker, identity, workspace, {
    recipient: "Synthetic three-phase golfer without a package",
    expiresInDays: 7,
  });
  return {
    scenarioId: "three-phase",
    identity,
    coachingPackage: null,
    workspace,
    token: share.token,
    share,
  };
}

async function seedMixedThirty(worker, identity) {
  await seedProfile(worker, identity, {
    businessName: "Thirty Golfer QA Studio",
    philosophy: "A bounded synthetic command-centre fixture for search and task-state review.",
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const coachingPackage = await seedPackage(worker, identity, {
    title: "Mixed-state coaching phase",
    description: "A synthetic package used only to make command-centre states realistic.",
  });

  const statePlan = [
    ...Array(5).fill("incomplete"),
    ...Array(5).fill("draft"),
    ...Array(5).fill("published"),
    ...Array(5).fill("paused"),
    ...Array(4).fill("completed"),
    ...Array(3).fill("archived"),
    ...Array(3).fill("review-needed"),
  ];
  const records = [];
  let golferToken = null;

  for (const [zeroIndex, targetState] of statePlan.entries()) {
    const number = zeroIndex + 1;
    if (targetState === "incomplete") {
      const staged = await createStagedWorkspace(worker, identity, number);
      records.push({ number, targetState, golferId: staged.golfer.id, planId: staged.plan.id });
      continue;
    }

    const workspace = await createWorkspace(worker, identity, {
      displayName: `Mixed State Golfer ${String(number).padStart(2, "0")}`,
      planTitle: `${titleCase(targetState)} workflow roadmap ${String(number).padStart(2, "0")}`,
      phaseCount: number % 2 === 0 ? 3 : 4,
      coachingPackageId: number % 3 === 0 ? null : coachingPackage.id,
      index: number,
    });
    let revision = workspace.plan.revision;
    let share = null;

    if (targetState === "published") {
      share = await publishWorkspace(worker, identity, workspace, {
        recipient: `Synthetic published golfer ${number}`,
      });
      golferToken ??= share.token;
    } else if (targetState === "paused") {
      revision = await addReview(worker, identity, workspace, revision, "pause", "paused");
    } else if (targetState === "completed") {
      revision = await addReview(
        worker,
        identity,
        workspace,
        revision,
        "complete_plan",
        "complete",
      );
    } else if (targetState === "archived") {
      await archiveGolfer(worker, identity, workspace.golfer.id);
    } else if (targetState === "review-needed") {
      await markPreviewReady(worker, workspace.plan.id, number);
    }

    records.push({
      number,
      targetState,
      golferId: workspace.golfer.id,
      planId: workspace.plan.id,
      revision,
      shareId: share?.id ?? null,
    });
  }

  if (!golferToken) {
    throw new Error("The mixed-state fixture did not produce a published golfer capability.");
  }
  return {
    scenarioId: "mixed-30",
    identity,
    coachingPackage,
    records,
    token: golferToken,
  };
}

async function seedLongContent(worker, identity) {
  await seedProfile(worker, identity, {
    businessName: boundedText(
      "Foothills Long-Form Independent Golf Coaching Studio",
      154,
    ),
    philosophy: boundedText(
      "Every recommendation stays connected to the observed pattern, the golfer's stated context, and the limits of the available synthetic evidence.",
      680,
    ),
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const coachingPackage = await seedPackage(worker, identity, {
    title: boundedText("Long-form four-session development and review phase", 116),
    description: boundedText(
      "A deliberately detailed synthetic package description used to inspect wrapping, hierarchy, and clear external-action boundaries.",
      1_450,
    ),
  });
  const workspace = await createWorkspace(worker, identity, {
    displayName: boundedText(
      "Alexandria Montgomery-Synthetic Extremely Long Golfer Name",
      116,
    ),
    planTitle: boundedText(
      "A deliberately long but valid development roadmap for contact, trajectory, target choice, and representative transfer",
      116,
    ),
    phaseCount: 4,
    coachingPackageId: coachingPackage.id,
    longContent: true,
  });
  let revision = workspace.plan.revision;
  revision = await addLesson(worker, identity, workspace, revision, true);
  revision = await addPractice(worker, identity, workspace, revision, true);
  revision = await addEvidence(worker, identity, workspace, revision, true);
  const share = await publishWorkspace(worker, identity, workspace, {
    recipient: "Synthetic long-content golfer for responsive review",
    expectedRevision: revision,
  });
  return {
    scenarioId: "long-content",
    identity,
    coachingPackage,
    workspace,
    token: share.token,
    share,
  };
}

async function seedUnavailableShare(worker, identity, state) {
  await seedProfile(worker, identity, {
    businessName: `${titleCase(state)} Access QA Golf`,
    philosophy: "Private access states must remain neutral and disclose no coaching content.",
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const workspace = await createWorkspace(worker, identity, {
    displayName: `${titleCase(state)} Access Golfer`,
    planTitle: `${titleCase(state)} private-access roadmap`,
    phaseCount: 4,
    coachingPackageId: null,
  });
  const share = await publishWorkspace(worker, identity, workspace, {
    recipient: `Synthetic ${state} private-access review`,
    expiresInDays: 1,
  });
  if (state === "revoked") {
    await revokeShare(worker, identity, share.id, "Synthetic QA revoked state");
  } else {
    await worker.inspect([
      {
        sql: "update share_links set expires_at = ?, updated_at = ? where id = ?",
        params: [Date.now() - 60_000, Date.now() - 60_000, share.id],
      },
    ]);
  }
  return {
    scenarioId: state,
    identity,
    workspace,
    token: share.token,
    share,
  };
}

async function seedRepublished(worker, identity) {
  await seedProfile(worker, identity, {
    businessName: "Republished Roadmap QA Golf",
    philosophy: "Changed coaching content invalidates prior access before a replacement is shared.",
  });
  await grantSyntheticGolferRecordConsent(worker, identity);
  const workspace = await createWorkspace(worker, identity, {
    displayName: "Morgan Republished",
    planTitle: "Republished contact roadmap",
    phaseCount: 4,
    coachingPackageId: null,
  });
  const oldShare = await publishWorkspace(worker, identity, workspace, {
    recipient: "Synthetic predecessor roadmap",
    expiresInDays: 7,
  });
  const revision = await addLesson(
    worker,
    identity,
    workspace,
    workspace.plan.revision,
    false,
  );
  const share = await publishWorkspace(worker, identity, workspace, {
    recipient: "Synthetic replacement roadmap",
    expiresInDays: 7,
    expectedRevision: revision,
  });
  return {
    scenarioId: "republished",
    identity,
    workspace,
    token: share.token,
    oldToken: oldShare.token,
    share,
    oldShare,
  };
}

async function seedProfile(worker, identity, overrides = {}) {
  const response = await jsonWrite(worker, identity, "/api/profile", "PUT", {
    displayName: identity.name,
    businessName: overrides.businessName ?? `${identity.name} Golf Coaching`,
    professionalTitle: "Independent golf instructor",
    philosophy:
      overrides.philosophy ??
      "Clear priorities, honest evidence, and practical next steps.",
    contactEmail: identity.email,
    contactPhone: null,
    websiteUrl: "https://coach.example.ca",
    city: "Calgary",
    provinceOrTerritory: "Alberta",
    accentColor: "#176b55",
  });
  return jsonResult(response, 200, "profile fixture");
}

async function seedPackage(worker, identity, overrides = {}) {
  const response = await jsonWrite(worker, identity, "/api/packages", "POST", {
    title: overrides.title ?? "Four-session development phase",
    description:
      overrides.description ??
      "Four focused sessions connected to the first roadmap phase.",
    priceCents: 48_000,
    currency: "CAD",
    terms: "Synthetic QA package. Confirm current terms with the coach.",
    inclusions: ["Four private lessons", "Coach-authored practice direction"],
    externalActionUrl: "https://booking.example.ca/functional-qa",
    status: "active",
    isDefault: true,
  });
  return (await jsonResult(response, 201, "package fixture")).package;
}

async function createWorkspace(worker, identity, options) {
  const phases = phaseFixture(options.phaseCount, options.longContent);
  const index = options.index ?? 1;
  const longContent = options.longContent === true;
  const response = await jsonWrite(worker, identity, "/api/golfers", "POST", {
    adultEligibilityConfirmed: true,
    displayName: options.displayName,
    email: `golfer.${options.phaseCount}.${index}.${identity.email}`,
    planTitle: options.planTitle,
    coachingPackageId: options.coachingPackageId,
    goal: {
      statement: longContent
        ? boundedText(
            "Build predictable contact and target decisions through a complete league round while preserving a comfortable, repeatable tempo.",
            580,
          )
        : "Build predictable contact through a full league round.",
      why: longContent
        ? boundedText(
            "Play with a clear decision process instead of guarding against a two-way miss, while keeping the golfer's own priorities visible.",
            950,
          )
        : "Play confidently without guarding against a two-way miss.",
      context: longContent
        ? boundedText(
            "Synthetic long-content context prepared to verify wrapping, reflow, navigation, and truthful evidence boundaries across narrow and wide layouts.",
            950,
          )
        : `Synthetic functional QA scenario for ${identity.name}.`,
    },
    assessment: {
      summary: longContent
        ? boundedText(
            "Strike location drifts toward the heel when transition tempo increases, especially when the target changes and the golfer tries to create speed too early.",
            1_900,
          )
        : "Strike drifts toward the heel when transition tempo increases.",
      strengths: longContent
        ? boundedText(
            "Athletic setup, useful strike awareness, thoughtful questions, and a willingness to reduce complexity when the observed pattern becomes unclear.",
            1_400,
          )
        : "Athletic setup and accurate awareness of strike location.",
      primaryPattern: longContent
        ? boundedText(
            "Heel contact appears as transition tempo increases; the observation is bounded to the synthetic indoor samples represented in this fixture.",
            1_900,
          )
        : "Heel contact appears as transition tempo increases.",
      limitations: longContent
        ? boundedText(
            "The sample is synthetic, indoor, short, and selected for interface review. It cannot establish on-course transfer, a score outcome, or a durable movement change.",
            1_400,
          )
        : "A small indoor sample does not prove transfer to the course.",
    },
    priority: {
      title: longContent
        ? boundedText("Centered contact at a representative playing tempo", 116)
        : "Centered contact at playing tempo",
      rationale: longContent
        ? boundedText(
            "Contact stability is the narrowest coach-observed foundation for later trajectory, speed, and target decisions, but the recommendation remains revisable as evidence changes.",
            1_400,
          )
        : "Contact stability supports later trajectory and speed decisions.",
    },
    phases,
  });
  return jsonResult(response, 201, `golfer fixture (${options.displayName})`);
}

async function createStagedWorkspace(worker, identity, number) {
  const response = await jsonWrite(worker, identity, "/api/golfers/staged", "POST", {
    adultEligibilityConfirmed: true,
    displayName: `Incomplete Golfer ${String(number).padStart(2, "0")}`,
    preferredName: null,
    email: `incomplete.${number}.${identity.email}`,
    planTitle: `Incomplete roadmap ${String(number).padStart(2, "0")}`,
    goal: {
      statement: "Create a clear starting direction.",
      why: "Resume this synthetic fixture through the real authoring UI.",
      context: "Purposefully incomplete functional QA state.",
    },
  });
  return jsonResult(response, 201, `staged golfer fixture ${number}`);
}

async function publishWorkspace(worker, identity, workspace, options = {}) {
  await grantSyntheticRoadmapSharingConsent(worker, identity, workspace.golfer.id);
  const response = await jsonWrite(
    worker,
    identity,
    `/api/plans/${workspace.plan.id}/publish`,
    "POST",
    {
      confirmation: "reviewed_exact_golfer_view",
      expectedRevision: options.expectedRevision ?? workspace.plan.revision,
      intendedRecipientContext:
        options.recipient ?? "Synthetic functional QA golfer",
      expiresInDays: options.expiresInDays ?? 7,
    },
  );
  const result = await jsonResult(response, 201, "publish fixture");
  const token = new URLSearchParams(new URL(result.share.url).hash.slice(1)).get("token");
  if (!token) throw new Error("Published functional QA fixture did not return a token.");
  return Object.freeze({ ...result.share, token });
}

async function addLesson(worker, identity, workspace, expectedRevision, longContent) {
  return addPlanContent(worker, identity, workspace.plan.id, {
    kind: "lesson",
    phaseId: workspace.phases[0].id,
    expectedRevision,
    title: longContent
      ? boundedText("Lesson chapter with a deliberately descriptive title", 156)
      : "Updated centered-contact lesson",
    purpose: longContent
      ? boundedText(
          "Review the representative contact window, distinguish observation from interpretation, and agree on the smallest useful next practice decision.",
          1_900,
        )
      : "Review the centered-contact pattern after publication.",
    coachObservation: boundedText(
      "Centered contact appeared more often in the final synthetic set, while higher tempo still widened the pattern.",
      longContent ? 1_900 : 400,
    ),
    takeaway: boundedText(
      "Preserve the comfortable tempo and use strike location as the immediate feedback signal.",
      longContent ? 950 : 300,
    ),
    nextCheck: "Repeat the representative set before changing the task.",
    phaseConnection: "This lesson remains connected to the current phase priority.",
    occurredAt: "2026-08-01",
  });
}

async function addPractice(worker, identity, workspace, expectedRevision, longContent) {
  return addPlanContent(worker, identity, workspace.plan.id, {
    kind: "practice",
    phaseId: workspace.phases[0].id,
    expectedRevision,
    title: longContent
      ? boundedText("Representative centered-contact practice window", 156)
      : "Centered-contact practice window",
    objective: boundedText(
      "Repeat a comfortable-tempo strike window without chasing speed or a promised result.",
      longContent ? 1_400 : 400,
    ),
    rationale: boundedText(
      "The task keeps attention on the narrowest observed priority and stops when the feedback becomes unclear.",
      longContent ? 1_400 : 400,
    ),
    instructions: [
      "Choose one representative target and a comfortable club.",
      "Complete three swings while observing strike location.",
      "Pause and reset before the next set.",
      "Stop if discomfort or uncertainty appears.",
    ].join("\n"),
    timeOrCadence: "Three short sets with a full reset between sets.",
    successCheck: boundedText(
      "The coach-defined strike window repeats without adding speed or changing the target after every swing.",
      longContent ? 950 : 400,
    ),
    commonMistake: "Adding speed after one centered strike.",
    stopOrAskRule: "Stop and ask the coach if discomfort appears or the feedback becomes unclear.",
    constraintNote: "Synthetic example only; it is not generic coaching guidance.",
  });
}

async function addEvidence(worker, identity, workspace, expectedRevision, longContent) {
  return addPlanContent(worker, identity, workspace.plan.id, {
    kind: "evidence",
    phaseId: workspace.phases[0].id,
    expectedRevision,
    evidenceType: "comparison",
    contextType: "practice",
    sourceType: "mixed",
    maturity: "early_indication",
    title: longContent
      ? boundedText("Baseline and current centered-contact observation", 156)
      : "Centered-contact comparison",
    claim: boundedText(
      "The current synthetic set contained more centered strikes than the selected baseline set.",
      longContent ? 1_400 : 400,
    ),
    sourceLabel: "Coach-reviewed synthetic practice set",
    observedAt: "2026-08-02",
    interpretation: boundedText(
      "The bounded comparison supports continuing the current practice priority; it does not prove transfer or predict a score.",
      longContent ? 1_900 : 500,
    ),
    limitation: boundedText(
      "Small synthetic samples, selected conditions, and no on-course observation limit the claim.",
      longContent ? 1_400 : 400,
    ),
    nextEvidenceNeeded: "A representative coach-reviewed set under an ordinary target constraint.",
  });
}

async function addPlanContent(worker, identity, planId, payload) {
  const response = await jsonWrite(
    worker,
    identity,
    `/api/plans/${planId}/content`,
    "POST",
    payload,
  );
  const result = await jsonResult(response, 201, `${payload.kind} fixture`);
  return result.plan.revision;
}

async function addReview(worker, identity, workspace, expectedRevision, transition, outcome) {
  return addPlanContent(worker, identity, workspace.plan.id, {
    kind: "review",
    phaseId: workspace.phases[0].id,
    expectedRevision,
    transition,
    outcome,
    originalPurpose: "Establish the current synthetic phase purpose.",
    baselineSummary: "The synthetic baseline showed variable start direction.",
    workCompleted: "The golfer completed representative constrained practice.",
    changeSummary: "The observed window became more predictable.",
    reliabilityLabel: "Repeated in synthetic practice evidence",
    limitations: "No real-world or on-course validation is claimed.",
    golferContribution: "The synthetic golfer reported increased clarity.",
    coachConclusion: "The transition follows the recorded synthetic evidence.",
    remainingOpportunity: "Validate the decision under broader constraints.",
    independentPracticeAlternative: "Continue the documented practice safely.",
  });
}

async function archiveGolfer(worker, identity, golferId) {
  const response = await jsonWrite(
    worker,
    identity,
    `/api/golfers/${golferId}`,
    "DELETE",
    { confirmation: "archive_golfer_and_revoke_access" },
  );
  await statusResult(response, 204, "archive golfer fixture");
}

async function revokeShare(worker, identity, shareId, reason) {
  const response = await jsonWrite(
    worker,
    identity,
    `/api/shares/${shareId}`,
    "DELETE",
    { reason },
  );
  await statusResult(response, 204, "revoke share fixture");
}

async function markPreviewReady(worker, planId, sequence) {
  const timestamp = Date.UTC(2026, 7, 1, 12, sequence, 0);
  await worker.inspect([
    {
      sql: "update development_plans set status = 'preview_ready', previewed_at = ?, updated_at = ? where id = ?",
      params: [timestamp, timestamp, planId],
    },
  ]);
}

function phaseFixture(count, longContent) {
  const shortPhases = [
    ["Own centered contact", "Create a stable strike window at controlled tempo."],
    ["Shape trajectory", "Add launch windows without losing contact quality."],
    ["Choose targets", "Transfer the pattern into representative decisions."],
    ["Perform under pressure", "Test the pattern with scored constraints."],
  ];
  return shortPhases.slice(0, count).map(([title, purpose], index) => ({
    number: index + 1,
    title: longContent ? boundedText(`${title} with representative constraints`, 116) : title,
    purpose: longContent
      ? boundedText(
          `${purpose} Keep the coach-authored narrative visible, preserve honest evidence limits, and explain why later decisions can change as the observed pattern develops.`,
          680,
        )
      : purpose,
    rationale:
      index === 0
        ? longContent
          ? boundedText(
              "Centered contact is the narrowest observed foundation and should be reviewed before trajectory, speed, or transfer decisions add complexity.",
              1_400,
            )
          : "Centered contact is the narrowest observed foundation."
        : null,
    progressSignals:
      index === 0
        ? [
            longContent
              ? boundedText(
                  "Centered contact repeats in a coach-reviewed representative set without adding speed after a single successful strike.",
                  230,
                )
              : "Centered contact repeats in a coach-reviewed set.",
          ]
        : [],
  }));
}

function fixtureHelpers(worker, identity) {
  return Object.freeze({
    jsonWrite: (path, method, body) => jsonWrite(worker, identity, path, method, body),
    addPlanContent: (planId, payload) =>
      addPlanContent(worker, identity, planId, payload),
    publishWorkspace: (workspace, options) =>
      publishWorkspace(worker, identity, workspace, options),
  });
}

function jsonWrite(worker, identity, path, method, body) {
  return worker.dispatch(path, {
    method,
    headers: writeHeaders(identity.email, identity.name),
    body: JSON.stringify(body),
  });
}

async function jsonResult(response, expectedStatus, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} returned ${response.status}; expected ${expectedStatus}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`,
    );
  }
  return body;
}

async function statusResult(response, expectedStatus, label) {
  if (response.status !== expectedStatus) {
    const text = await response.text();
    throw new Error(
      `${label} returned ${response.status}; expected ${expectedStatus}: ${text}`,
    );
  }
}

function boundedText(seed, maximum) {
  const normalized = seed.trim().replace(/\s+/g, " ");
  if (normalized.length >= maximum) return normalized.slice(0, maximum).trimEnd();
  let value = normalized;
  while (value.length + normalized.length + 1 <= maximum) {
    value += ` ${normalized}`;
  }
  return value;
}

function titleCase(value) {
  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
