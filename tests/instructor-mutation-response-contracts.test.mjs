import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  ClientMutationApiError,
  ClientMutationOutcomeUnknownError,
} from "../lib/client-mutation-recovery.ts";
import {
  isGolferUpdatedResponse,
  isPackageLifecycleMutationResponse,
  isPlanContentCreatedResponse,
  isPlanContentWithdrawnResponse,
  isPlanEditorMutationResponse,
  isProfileMutationResponse,
  isStagedCompletionMutationResponse,
  profileMutationExpectedFromForm,
  requireExactClientMutationJson,
} from "../lib/instructor-mutation-response-contracts.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("exact JSON acknowledgement rejects unexpected and malformed 2xx as outcome unknown", async () => {
  assert.deepEqual(
    await requireExactClientMutationJson(
      jsonResponse({ updated: true }, 200),
      200,
      isGolferUpdatedResponse,
      "save failed",
    ),
    { updated: true },
  );

  for (const response of [
    jsonResponse({ updated: true }, 201),
    new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    new Response(JSON.stringify({ updated: true }), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
    jsonResponse({ updated: false }, 200),
    jsonResponse({ updated: true, ignored: true }, 200),
  ]) {
    await assert.rejects(
      requireExactClientMutationJson(
        response,
        200,
        isGolferUpdatedResponse,
        "save failed",
      ),
      (error) => {
        assert.equal(error instanceof ClientMutationOutcomeUnknownError, true);
        assert.equal(error.reason, "malformed_success_response");
        assert.equal(error.status, response.status);
        return true;
      },
    );
  }
});

test("definitive non-2xx acknowledgements remain API errors", async () => {
  await assert.rejects(
    requireExactClientMutationJson(
      jsonResponse(
        {
          error: {
            code: "stale_plan_revision",
            message: "Reload the latest revision.",
          },
        },
        409,
      ),
      200,
      isGolferUpdatedResponse,
      "save failed",
    ),
    (error) => {
      assert.equal(error instanceof ClientMutationApiError, true);
      assert.equal(error instanceof ClientMutationOutcomeUnknownError, false);
      assert.equal(error.status, 409);
      assert.equal(error.code, "stale_plan_revision");
      return true;
    },
  );
});

test("profile and package contracts require complete bounded impact claims", () => {
  const expectedProfile = profileMutationExpectedFromForm(
    {
      displayName: "  Coach Morgan  ",
      businessName: " Morgan Golf ",
      professionalTitle: " PGA of Canada Instructor ",
      philosophy: "Evidence-led coaching\r\n",
      contactEmail: " MORGAN@EXAMPLE.CA ",
      contactPhone: " +1 403 555 0101 ",
      websiteUrl: "https://coach.example.ca/profile",
      city: " Calgary ",
      provinceOrTerritory: " Alberta ",
      accentColor: "#1b4f40",
    },
    150,
  );
  assert.deepEqual(expectedProfile, {
    displayName: "Coach Morgan",
    businessName: "Morgan Golf",
    professionalTitle: "PGA of Canada Instructor",
    philosophy: "Evidence-led coaching",
    contactEmail: "morgan@example.ca",
    contactPhone: "+1 403 555 0101",
    websiteUrl: "https://coach.example.ca/profile",
    provinceOrTerritory: "Alberta",
    city: "Calgary",
    accentColor: "#1b4f40",
    previousUpdatedAt: 150,
  });
  const profile = {
    profile: {
      displayName: "Coach Morgan",
      businessName: "Morgan Golf",
      professionalTitle: "PGA of Canada Instructor",
      philosophy: "Evidence-led coaching",
      bio: "Evidence-led coaching",
      contactEmail: "morgan@example.ca",
      contactPhone: "+1 403 555 0101",
      websiteUrl: "https://coach.example.ca/profile",
      provinceOrTerritory: "Alberta",
      city: "Calgary",
      location: "Calgary, Alberta",
      accentColor: "#1b4f40",
      setupCompletedAt: 100,
      updatedAt: 200,
    },
    changedFields: ["displayName", "businessName", "philosophy"],
    publicationImpact: {
      invalidated: true,
      affectedPlans: 2,
      revokedShareLinks: 1,
      revokedShareSessions: 3,
    },
  };
  assert.equal(isProfileMutationResponse(profile, expectedProfile), true);
  assert.equal(
    isProfileMutationResponse({
      ...profile,
      profile: { ...profile.profile, displayName: "Receipt mismatch" },
    }, expectedProfile),
    false,
  );
  assert.equal(
    isProfileMutationResponse({
      ...profile,
      changedFields: ["philosophy", "displayName"],
    }, expectedProfile),
    false,
  );
  assert.equal(
    isProfileMutationResponse({
      ...profile,
      publicationImpact: {
        ...profile.publicationImpact,
        affectedPlans: -1,
      },
    }, expectedProfile),
    false,
  );
  const missingSessionCount = structuredClone(profile);
  delete missingSessionCount.publicationImpact.revokedShareSessions;
  assert.equal(
    isProfileMutationResponse(missingSessionCount, expectedProfile),
    false,
  );
  assert.equal(
    isProfileMutationResponse(
      {
        ...profile,
        publicationImpact: {
          invalidated: false,
          affectedPlans: 1,
          revokedShareLinks: 0,
          revokedShareSessions: 0,
        },
      },
      expectedProfile,
    ),
    false,
  );
  assert.equal(
    isProfileMutationResponse(
      {
        ...profile,
        changedFields: ["displayName"],
        publicationImpact: {
          invalidated: false,
          affectedPlans: 0,
          revokedShareLinks: 0,
          revokedShareSessions: 0,
        },
      },
      expectedProfile,
    ),
    false,
  );
  assert.equal(
    isProfileMutationResponse(
      {
        ...profile,
        profile: {
          ...profile.profile,
          setupCompletedAt: 200,
          updatedAt: 200,
        },
        changedFields: [
          "displayName",
          "businessName",
          "professionalTitle",
          "philosophy",
          "contactEmail",
          "contactPhone",
          "websiteUrl",
          "provinceOrTerritory",
          "city",
          "accentColor",
        ],
        publicationImpact: {
          invalidated: false,
          affectedPlans: 0,
          revokedShareLinks: 0,
          revokedShareSessions: 0,
        },
      },
      { ...expectedProfile, previousUpdatedAt: null },
    ),
    true,
  );
  assert.equal(
    isProfileMutationResponse(
      {
        ...profile,
        changedFields: [],
        publicationImpact: {
          invalidated: false,
          affectedPlans: 0,
          revokedShareLinks: 0,
          revokedShareSessions: 0,
        },
        profile: { ...profile.profile, updatedAt: 150 },
      },
      expectedProfile,
    ),
    true,
  );

  const lifecyclePackage = {
    id: "package-1",
    title: "Current offer",
    name: "Current offer",
    description: "Fits the current phase",
    purpose: "Build the current priority",
    fitDescription: "Fits the current phase",
    status: "active",
    priceCents: 12000,
    priceAmountMinor: 12000,
    currency: "CAD",
    currentDetailsText: null,
    inclusions: ["Four lessons"],
    cadence: "Weekly",
    practiceExpectation: "Two sessions",
    evaluationDescription: "Coach review",
    terms: "Current terms",
    termsSummary: "Current terms",
    externalActionType: "booking",
    externalActionLabel: "Book now",
    externalActionUrl: "https://booking.example.ca/",
    isDefault: true,
    createdAt: 100,
    updatedAt: 201,
  };
  const lifecycle = {
    package: lifecyclePackage,
    affectedPlans: 2,
    revokedShareLinks: 1,
  };
  const { updatedAt: previousUpdatedAt, ...expectedLifecyclePackage } =
    lifecyclePackage;
  const lifecycleExpected = {
    package: {
      ...expectedLifecyclePackage,
      previousUpdatedAt: previousUpdatedAt - 1,
    },
  };
  assert.equal(
    isPackageLifecycleMutationResponse(lifecycle, lifecycleExpected),
    true,
  );
  assert.equal(
    isPackageLifecycleMutationResponse(
      { ...lifecycle, package: { ...lifecycle.package, id: "package-2" } },
      lifecycleExpected,
    ),
    false,
  );
  assert.equal(
    isPackageLifecycleMutationResponse(
      { ...lifecycle, revokedShareLinks: Number.NaN },
      lifecycleExpected,
    ),
    false,
  );
  assert.equal(
    isPackageLifecycleMutationResponse(
      { ...lifecycle, package: { ...lifecycle.package, name: "Other offer" } },
      lifecycleExpected,
    ),
    false,
  );
  assert.equal(
    isPackageLifecycleMutationResponse(
      { ...lifecycle, package: { ...lifecycle.package, updatedAt: 200 } },
      lifecycleExpected,
    ),
    false,
  );
  assert.equal(
    isPackageLifecycleMutationResponse(
      { ...lifecycle, affectedPlans: 0, revokedShareLinks: 1 },
      lifecycleExpected,
    ),
    false,
  );
  for (const externalActionUrl of [
    "http://booking.example.ca/",
    "https://user:secret@booking.example.ca/",
    "https://booking.internal/",
    "https://BOOKING.example.ca/",
  ]) {
    assert.equal(
      isPackageLifecycleMutationResponse(
        {
          ...lifecycle,
          package: { ...lifecycle.package, externalActionUrl },
        },
        {
          package: { ...lifecycleExpected.package, externalActionUrl },
        },
      ),
      false,
    );
  }
  assert.equal(
    isPackageLifecycleMutationResponse(
      {
        ...lifecycle,
        package: {
          ...lifecycle.package,
          status: "draft",
          isDefault: true,
        },
      },
      {
        package: {
          ...lifecycleExpected.package,
          status: "draft",
          isDefault: true,
        },
      },
    ),
    false,
  );
});

test("living-plan acknowledgements bind kind, item, and next revision", () => {
  assert.equal(
    isPlanContentCreatedResponse(
      {
        item: { id: "content-1", kind: "lesson" },
        plan: { revision: 8 },
      },
      { kind: "lesson", revision: 8 },
    ),
    true,
  );
  assert.equal(
    isPlanContentCreatedResponse(
      {
        item: { id: "content-1", kind: "evidence" },
        plan: { revision: 8 },
      },
      { kind: "lesson", revision: 8 },
    ),
    false,
  );
  assert.equal(
    isPlanContentCreatedResponse(
      {
        item: { id: "content-1", kind: "lesson" },
        plan: { revision: 7 },
      },
      { kind: "lesson", revision: 8 },
    ),
    false,
  );

  const withdrawn = {
    withdrawn: true,
    item: { id: "content-1", kind: "practice" },
    plan: { revision: 9 },
  };
  assert.equal(
    isPlanContentWithdrawnResponse(withdrawn, {
      itemId: "content-1",
      kind: "practice",
      revision: 9,
    }),
    true,
  );
  assert.equal(
    isPlanContentWithdrawnResponse(
      { ...withdrawn, withdrawn: false },
      { itemId: "content-1", kind: "practice", revision: 9 },
    ),
    false,
  );
});

test("plan edit and staged completion contracts bind authoritative identifiers", () => {
  const planEdit = {
    plan: {
      id: "plan-1",
      status: "draft",
      revision: 4,
      updatedAt: 1_800_000_000_000,
    },
    revokedShareLinks: 2,
  };
  assert.equal(
    isPlanEditorMutationResponse(planEdit, { planId: "plan-1", revision: 4 }),
    true,
  );
  assert.equal(
    isPlanEditorMutationResponse(
      { ...planEdit, plan: { ...planEdit.plan, revision: 3 } },
      { planId: "plan-1", revision: 4 },
    ),
    false,
  );
  assert.equal(
    isPlanEditorMutationResponse(
      { ...planEdit, revokedShareLinks: -1 },
      { planId: "plan-1", revision: 4 },
    ),
    false,
  );

  const completion = validCompletion();
  const expected = {
    golferId: "golfer-1",
    planId: "plan-1",
    revision: 2,
    phaseCount: 3,
  };
  assert.equal(isStagedCompletionMutationResponse(completion, expected), true);
  assert.equal(
    isStagedCompletionMutationResponse(
      { ...completion, plan: { ...completion.plan, id: "plan-2" } },
      expected,
    ),
    false,
  );
  assert.equal(
    isStagedCompletionMutationResponse(
      {
        ...completion,
        phases: completion.phases.map((phase, index) =>
          index === 1 ? { ...phase, status: "active" } : phase,
        ),
      },
      expected,
    ),
    false,
  );
});

test("assigned instructor surfaces lock outcome-unknown mutations behind a real reload", async () => {
  const files = [
    ["app/app/settings/ProfileForm.tsx", "ProfileForm"],
    ["app/app/packages/PackageLifecycleControls.tsx", "PackageLifecycleControls"],
    ["app/app/golfers/[golferId]/LivingPlanForms.tsx", "LivingPlanForms"],
    ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", "GolferSettingsForm"],
    ["app/app/golfers/[golferId]/edit/PlanEditorForm.tsx", "PlanEditorForm"],
    ["app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", "StagedCompletionForm"],
  ];

  for (const [relativePath, componentName] of files) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.match(source, /requireExactClientMutationJson/);
    assert.match(
      source,
      /isClientMutationOutcomeUnknown|requiresAuthoritativeMutationReload/,
    );
    assert.match(source, /reload_required|reloadRequired/);
    if (componentName === "LivingPlanForms") {
      assert.match(source, /mutationInFlightRef\.current/);
      assert.match(source, /disabled=\{reloadRequired \|\| busy !== null\}/);
      assert.match(source, /failure\.status === 409/);
    }
    assert.match(source, /window\.location\.reload\(\)/);

    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const component = namedFunction(sourceFile, componentName);
    assert.ok(component, `${relativePath} must define ${componentName}`);
    const controls = editableControls(component);
    assert.ok(controls.length > 0, `${relativePath} must expose editable controls`);
    for (const control of controls) {
      assert.match(
        lockExpression(control, sourceFile),
        /reload_required|reloadRequired|isLocked/,
        `${relativePath} ${control.tagName.getText(sourceFile)} control at line ${sourceFile.getLineAndCharacterOfPosition(control.getStart(sourceFile)).line + 1} must be reload-locked`,
      );
    }
  }

  const golferSettings = await readFile(
    path.join(
      projectRoot,
      "app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx",
    ),
    "utf8",
  );
  assert.match(
    golferSettings,
    /requireClientMutationSuccess\([\s\S]*?\[204\][\s\S]*?\)/,
  );
});

function jsonResponse(value, status) {
  return Response.json(value, { status });
}

function validCompletion() {
  return {
    completed: true,
    golfer: { id: "golfer-1", displayName: "Morgan" },
    plan: { id: "plan-1", title: "Morgan's roadmap", status: "draft", revision: 2 },
    assessment: { id: "assessment-1" },
    priority: { id: "priority-1" },
    phases: [
      {
        id: "phase-1",
        number: 1,
        title: "Start",
        purpose: "Build a reliable baseline.",
        status: "active",
      },
      {
        id: "phase-2",
        number: 2,
        title: "Develop",
        purpose: "Apply the next pattern.",
        status: "planned",
      },
      {
        id: "phase-3",
        number: 3,
        title: "Transfer",
        purpose: "Observe transfer on course.",
        status: "planned",
      },
    ],
  };
}

function editableControls(rootNode) {
  const controls = [];
  const sourceFile = rootNode.getSourceFile();
  walk(rootNode, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return;
    }
    if (!ts.isIdentifier(node.tagName)) return;
    if (
      ![
        "input",
        "textarea",
        "select",
        "button",
        "Field",
        "TextArea",
        "PhaseSelect",
      ].includes(node.tagName.text)
    ) {
      return;
    }
    if (node.tagName.text === "button" && isReloadButton(node, sourceFile)) {
      return;
    }
    controls.push(node);
  });
  return controls;
}

function namedFunction(sourceFile, name) {
  let match;
  walk(sourceFile, (node) => {
    if (
      !match &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name
    ) {
      match = node;
    }
  });
  return match;
}

function lockExpression(control, sourceFile) {
  const expressions = [];
  const direct = jsxAttributeExpression(control.attributes, "disabled", sourceFile);
  if (direct) expressions.push(direct);

  let ancestor = control.parent;
  while (ancestor) {
    if (
      ts.isJsxElement(ancestor) &&
      ts.isIdentifier(ancestor.openingElement.tagName) &&
      ancestor.openingElement.tagName.text === "fieldset"
    ) {
      const inherited = jsxAttributeExpression(
        ancestor.openingElement.attributes,
        "disabled",
        sourceFile,
      );
      if (inherited) expressions.push(inherited);
    }
    ancestor = ancestor.parent;
  }
  return expressions.join(" || ");
}

function jsxAttributeExpression(attributes, name, sourceFile) {
  const attribute = attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) return "";
  if (!attribute.initializer) return "true";
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression
  ) {
    return attribute.initializer.expression.getText(sourceFile);
  }
  return attribute.initializer.getText(sourceFile);
}

function isReloadButton(control, sourceFile) {
  const element = ts.isJsxElement(control.parent) ? control.parent : control;
  return element.getText(sourceFile).includes("window.location.reload()");
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}
