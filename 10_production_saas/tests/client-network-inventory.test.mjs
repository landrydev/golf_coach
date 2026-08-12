import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("AST inventory contains every browser-capable transport call", async () => {
  const sourceFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat().sort();
  const actual = new Map();

  for (const filename of sourceFiles) {
    const source = await readFile(filename, "utf8");
    const sourceFile = parseSource(filename, source);
    const primitives = transportCalls(sourceFile);
    if (primitives.length > 0) {
      actual.set(relativePath(filename), primitives);
    }
  }

  assert.deepEqual(
    actual,
    new Map([
      ["lib/client-mutation-recovery.ts", ["fetch"]],
      ["lib/client-recovery.ts", ["fetch"]],
      ["lib/client-upload-recovery.ts", ["XMLHttpRequest"]],
      ["lib/instructor-auth-protocol.ts", ["fetch"]],
      ["lib/stripe.ts", ["fetch"]],
      ["lib/synthetic-concurrency-barrier.ts", ["fetch", "fetch"]],
    ]),
  );
});

test("every recovery-managed client mutation endpoint and HTTP method is exactly allowlisted", async () => {
  const sourceFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat();
  const actual = [];
  for (const filename of sourceFiles.sort()) {
    const source = await readFile(filename, "utf8");
    const sourceFile = parseSource(filename, source);
    for (const request of clientMutationRequests(sourceFile)) {
      for (const method of request.methods) {
        actual.push({
          file: relativePath(filename),
          endpoint: request.endpoint,
          method,
        });
      }
    }
  }

  const expected = [
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment/media", "POST"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment/media", "DELETE"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment", "PUT"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills", "POST"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment", "PATCH"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment/duplicate", "POST"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment", "DELETE"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps/:segment", "PUT"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps", "POST"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps/:segment", "PATCH"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps/:segment/duplicate", "POST"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps/:segment", "DELETE"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/practice", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/practice", "PATCH"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/lessons", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/lessons", "PATCH"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/evidence", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/reviews", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/media", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/media", "DELETE"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/launch/sessions", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/launch/imports", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/launch/comparisons", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/milestones", "POST"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/plans/:segment/coaching/milestones", "PATCH"],
    ["app/app/media/MediaLibrary.tsx", "/api/media/:segment", "DELETE"],
    ["components/consent/ConsentPurposeControl.tsx", "/api/consents", "POST"],
    ["components/plan/CloseRoadmap.tsx", "/r/session", "DELETE"],
    ["app/app/settings/ProfileForm.tsx", "/api/profile", "PUT"],
    ["app/app/settings/BrandingMediaForm.tsx", "/api/profile/media", "DELETE"],
    ["app/app/settings/BrandingMediaForm.tsx", "/api/profile/media", "POST"],
    ["app/app/settings/shares/ShareAccessControls.tsx", "/api/account/shares/:segment", "DELETE"],
    ["app/app/packages/PackageForm.tsx", "/api/packages", "POST"],
    ["app/app/settings/data/DataRequestControls.tsx", "/api/data-export", "POST"],
    ["app/app/settings/data/DataRequestControls.tsx", "/api/data-requests", "GET"],
    ["app/app/settings/data/DataRequestControls.tsx", "/api/data-requests", "POST"],
    ["app/app/settings/data/DataRequestControls.tsx", "/api/data-requests", "POST"],
    ["app/app/packages/PackageLifecycleControls.tsx", "/api/packages/:segment", "PUT"],
    ["app/app/packages/PackageLifecycleControls.tsx", "/api/packages/:segment", "DELETE"],
    ["app/app/golfers/[golferId]/LivingPlanForms.tsx", "/api/plans/:segment/content", "POST"],
    ["app/app/golfers/[golferId]/LivingPlanForms.tsx", "/api/plans/:segment/content", "DELETE"],
    ["app/app/golfers/[golferId]/QuickLessonUpdate.tsx", "/api/plans/:segment/coaching/practice", "PATCH"],
    ["app/app/golfers/[golferId]/QuickLessonUpdate.tsx", "/api/plans/:segment/coaching/lessons", "POST"],
    ["app/app/golfers/[golferId]/QuickLessonUpdate.tsx", "/api/plans/:segment/coaching/practice", "POST"],
    ["app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", "/api/golfers/:segment/complete", "POST"],
    ["app/app/golfers/[golferId]/edit/PlanEditorForm.tsx", "/api/plans/:segment", "PUT"],
    ["app/app/golfers/new/StagedGolferForm.tsx", "/api/golfers/staged", "POST"],
    ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", "/api/golfers/:segment", "PUT"],
    ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", "/api/golfers/:segment", "DELETE"],
    ["app/app/golfers/[golferId]/PublishControls.tsx", "/api/plans/:segment/publish", "POST"],
    ["app/app/golfers/[golferId]/PublishControls.tsx", "/api/plans/:segment/publish/replace-inaccessible", "POST"],
    ["app/app/golfers/[golferId]/PublishControls.tsx", "/api/plans/:segment/publish/reissue", "POST"],
    ["app/app/golfers/[golferId]/PublishControls.tsx", "/api/shares/:segment", "DELETE"],
    ["app/app/golfers/new/NewGolferForm.tsx", "/api/golfers", "POST"],
    ["app/app/golfers/new/QuickRoadmapForm.tsx", "/api/golfers", "POST"],
    ["components/plan/PracticeCheckIn.tsx", "/r/practice-check-in", "POST"],
    ["lib/client-recovery.ts", "/r/response", "POST"],
    ["lib/client-recovery.ts", "/r/session", "POST"],
  ].map(([file, endpoint, method]) => ({ file, endpoint, method }));

  assert.deepEqual(actual.sort(compareInventory), expected.sort(compareInventory));
});

test("every bounded client read and upload endpoint is exactly allowlisted", async () => {
  const sourceFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat();
  const actual = [];
  for (const filename of sourceFiles.sort()) {
    const source = await readFile(filename, "utf8");
    const sourceFile = parseSource(filename, source);
    for (const request of clientHelperRequests(sourceFile)) {
      actual.push({ file: relativePath(filename), ...request });
    }
  }

  const expected = [
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills?includeArchived=true&limit=250", "GET"],
    ["app/app/coaching/drills/DrillLibrary.tsx", "/api/coaching/drills/:segment/media", "GET"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/coaching/plans/:segment/workspace", "GET"],
    ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", "/api/coaching/drills?limit=250", "GET"],
    ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", "/api/coaching/roadmaps?includeArchived=true&limit=250", "GET"],
    ["app/app/media/MediaLibrary.tsx", "/api/media", "POST"],
    ["app/app/settings/BrandingMediaForm.tsx", "/api/media", "POST"],
  ].map(([file, endpoint, method]) => ({ file, endpoint, method }));

  assert.deepEqual(actual.sort(compareInventory), expected.sort(compareInventory));
});

test("direct best-effort browser requests are separately and exactly allowlisted", async () => {
  const sourceFiles = (
    await Promise.all(
      ["app", "components", "lib"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat();
  const actual = [];
  for (const filename of sourceFiles.sort()) {
    const source = await readFile(filename, "utf8");
    const sourceFile = parseSource(filename, source);
    for (const request of directStaticFetcherRequests(sourceFile)) {
      for (const method of request.methods) {
        actual.push({
          file: relativePath(filename),
          endpoint: request.endpoint,
          method,
        });
      }
    }
  }
  assert.deepEqual(actual, [
    {
      file: "lib/client-recovery.ts",
      endpoint: "/r/response",
      method: "POST",
    },
  ]);
});

test("forms have exact fallback semantics and no control-level overrides", async () => {
  const sourceFiles = (
    await Promise.all(
      ["app", "components"].map((directory) =>
        discoverSourceFiles(path.join(projectRoot, directory)),
      ),
    )
  ).flat();
  const native = [];
  const intercepted = new Map();
  const overrides = [];
  for (const filename of sourceFiles.sort()) {
    const source = await readFile(filename, "utf8");
    const sourceFile = parseSource(filename, source);
    for (const form of formDeclarations(sourceFile)) {
      if (form.intercepted) {
        assert.equal(
          form.method,
          "post",
          `${relativePath(filename)} intercepted form must use explicit POST fallback semantics`,
        );
        assert.equal(form.action, null, "intercepted forms must not override action");
        const key = relativePath(filename);
        intercepted.set(key, (intercepted.get(key) ?? 0) + 1);
      } else {
        assert.ok(
          form.method === "get" || form.method === "post",
          `${relativePath(filename)} native form must declare GET or POST`,
        );
        assert.equal(typeof form.action, "string", "native POST action must be static");
        native.push({
          file: relativePath(filename),
          action: form.action,
          method: form.method,
        });
      }
    }
    for (const override of formControlOverrides(sourceFile)) {
      overrides.push({ file: relativePath(filename), ...override });
    }
  }

  assert.deepEqual(native, [
    { file: "app/app/billing/page.tsx", action: "/api/billing/checkout", method: "post" },
    { file: "app/app/billing/page.tsx", action: "/api/billing/portal", method: "post" },
    { file: "app/app/billing/page.tsx", action: "/api/billing/reconcile", method: "post" },
    { file: "app/app/golfers/page.tsx", action: "/app/golfers", method: "get" },
    { file: "app/app/layout.tsx", action: "/auth/logout", method: "post" },
    { file: "app/app/layout.tsx", action: "/auth/logout", method: "post" },
  ]);
  assert.deepEqual(
    intercepted,
    new Map([
      ["app/app/coaching/drills/DrillLibrary.tsx", 2],
      ["app/app/coaching/plans/[planId]/RichCoachingWorkspace.tsx", 12],
      ["app/app/coaching/roadmaps/RoadmapTemplateLibrary.tsx", 1],
      ["app/app/golfers/[golferId]/LivingPlanForms.tsx", 4],
      ["app/app/golfers/[golferId]/PublishControls.tsx", 3],
      ["app/app/golfers/[golferId]/QuickLessonUpdate.tsx", 1],
      ["app/app/golfers/[golferId]/complete/StagedCompletionForm.tsx", 1],
      ["app/app/golfers/[golferId]/edit/PlanEditorForm.tsx", 1],
      ["app/app/golfers/[golferId]/settings/GolferSettingsForm.tsx", 1],
      ["app/app/golfers/new/NewGolferForm.tsx", 1],
      ["app/app/golfers/new/QuickRoadmapForm.tsx", 1],
      ["app/app/golfers/new/StagedGolferForm.tsx", 1],
      ["app/app/packages/PackageForm.tsx", 1],
      ["app/app/packages/PackageLifecycleControls.tsx", 1],
      ["app/app/media/MediaLibrary.tsx", 1],
      ["app/app/settings/BrandingMediaForm.tsx", 1],
      ["app/app/settings/ProfileForm.tsx", 1],
      ["app/app/settings/data/DataRequestControls.tsx", 1],
      ["components/plan/PracticeCheckIn.tsx", 1],
    ]),
  );
  assert.deepEqual(overrides, []);
});

test("each allowlisted billing navigation has a bounded replay boundary", async () => {
  const [checkout, portal, reconcile, stripe, reconciliation] = await Promise.all([
    readFile(projectFile("app/api/billing/checkout/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/portal/route.ts"), "utf8"),
    readFile(projectFile("app/api/billing/reconcile/route.ts"), "utf8"),
    readFile(projectFile("lib/stripe.ts"), "utf8"),
    readFile(projectFile("lib/billing-reconciliation.ts"), "utf8"),
  ]);

  assert.match(checkout, /reserveOrLoadCheckoutAttempt/);
  assert.match(checkout, /acquireBillingAccountOperationLease/);
  assert.match(checkout, /idempotencyKey:\s*attempt\.idempotencyKey/);
  assert.match(portal, /createBillingPortalSession/);
  assert.match(portal, /recordHostedBillingSession/);
  assert.match(stripe, /operationKey\("portal",\s*input\.customerId,\s*60 \* 1_000\)/);
  assert.match(reconcile, /reconcileBillingAccount/);
  assert.match(reconciliation, /acquireBillingAccountOperationLease/);
});

function transportCalls(sourceFile) {
  const aliases = new Map();
  for (let pass = 0; pass < 3; pass += 1) {
    walk(sourceFile, (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const primitive = transportExpression(node.initializer, aliases);
        if (primitive) aliases.set(node.name.text, primitive);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        const primitive = transportExpression(node.right, aliases);
        if (primitive) aliases.set(node.left.text, primitive);
      }
    });
  }

  const calls = [];
  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
      const primitive = transportExpression(node.expression, aliases);
      if (primitive === "fetch" || primitive === "sendBeacon") {
        calls.push(primitive);
      }
    }
    if (ts.isNewExpression(node)) {
      const primitive = transportExpression(node.expression, aliases);
      if (primitive === "XMLHttpRequest") calls.push(primitive);
    }
  });
  return calls;
}

function transportExpression(expression, aliases) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    if (
      unwrapped.text === "fetch" ||
      unwrapped.text === "XMLHttpRequest" ||
      unwrapped.text === "sendBeacon"
    ) {
      return unwrapped.text;
    }
    return aliases.get(unwrapped.text) ?? null;
  }
  if (ts.isPropertyAccessExpression(unwrapped)) {
    const name = unwrapped.name.text;
    return name === "fetch" || name === "sendBeacon" ? name : null;
  }
  if (ts.isElementAccessExpression(unwrapped)) {
    const argument = unwrapExpression(unwrapped.argumentExpression);
    if (ts.isStringLiteralLike(argument)) {
      return argument.text === "fetch" || argument.text === "sendBeacon"
        ? argument.text
        : null;
    }
  }
  return null;
}

function clientMutationRequests(sourceFile) {
  const requests = [];
  walk(sourceFile, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(unwrapExpression(node.expression)) ||
      unwrapExpression(node.expression).text !== "requestClientMutation"
    ) {
      return;
    }
    assert.ok(node.arguments[0], "client mutation endpoint is required");
    assert.ok(node.arguments[1], "client mutation init is required");
    requests.push({
      endpoint: endpointPattern(node.arguments[0]),
      methods: requestMethods(node.arguments[1], node),
    });
  });
  return requests;
}

function clientHelperRequests(sourceFile) {
  const requests = [];
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const expression = unwrapExpression(node.expression);
    if (!ts.isIdentifier(expression) || !node.arguments[0]) return;
    if (expression.text === "requestClientRead") {
      const methods = node.arguments[1]
        ? requestMethods(node.arguments[1], node)
        : ["GET"];
      assert.equal(
        methods.every((method) => method === "GET" || method === "HEAD"),
        true,
        "bounded client reads must use GET or HEAD",
      );
      for (const method of methods) {
        requests.push({ endpoint: endpointPattern(node.arguments[0]), method });
      }
    }
    if (expression.text === "requestClientUpload") {
      requests.push({ endpoint: endpointPattern(node.arguments[0]), method: "POST" });
    }
  });
  return requests;
}

function directStaticFetcherRequests(sourceFile) {
  const requests = [];
  walk(sourceFile, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(unwrapExpression(node.expression)) ||
      unwrapExpression(node.expression).text !== "fetcher" ||
      !node.arguments[0] ||
      !isStaticEndpoint(node.arguments[0])
    ) {
      return;
    }
    assert.ok(node.arguments[1], "direct fetch init is required");
    requests.push({
      endpoint: endpointPattern(node.arguments[0]),
      methods: requestMethods(node.arguments[1], node),
    });
  });
  return requests;
}

function isStaticEndpoint(expression) {
  const value = unwrapExpression(expression);
  return ts.isStringLiteralLike(value) || ts.isTemplateExpression(value);
}

function endpointPattern(expression) {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteralLike(value)) return value.text;
  assert.ok(ts.isTemplateExpression(value), "client endpoint must be a static template");
  let pattern = value.head.text;
  for (const span of value.templateSpans) {
    const dynamic = unwrapExpression(span.expression);
    assert.ok(
      ts.isCallExpression(dynamic) &&
        ts.isIdentifier(unwrapExpression(dynamic.expression)) &&
        unwrapExpression(dynamic.expression).text === "encodeURIComponent" &&
        dynamic.arguments.length === 1,
      "dynamic endpoint segments must use encodeURIComponent",
    );
    pattern += `:segment${span.literal.text}`;
  }
  return pattern;
}

function requestMethods(expression, call) {
  const init = unwrapExpression(expression);
  assert.ok(ts.isObjectLiteralExpression(init), "client mutation init must be inline");
  assert.equal(
    init.properties.some((property) => ts.isSpreadAssignment(property)),
    false,
    "client mutation init may not hide method in a spread",
  );
  const property = init.properties.find(
    (candidate) =>
      (ts.isPropertyAssignment(candidate) ||
        ts.isShorthandPropertyAssignment(candidate)) &&
      candidate.name.getText() === "method",
  );
  if (!property) return ["GET"];
  const methodExpression = ts.isPropertyAssignment(property)
    ? unwrapExpression(property.initializer)
    : property.name;
  if (ts.isStringLiteralLike(methodExpression)) {
    return [methodExpression.text.toUpperCase()];
  }
  assert.ok(ts.isIdentifier(methodExpression), "request method must be literal or typed parameter");
  return parameterLiteralValues(call, methodExpression.text);
}

function parameterLiteralValues(node, name) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parameter = current.parameters.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
    );
    if (!parameter?.type) continue;
    const types = ts.isUnionTypeNode(parameter.type)
      ? parameter.type.types
      : [parameter.type];
    const values = types.map((type) => {
      assert.ok(
        ts.isLiteralTypeNode(type) && ts.isStringLiteralLike(type.literal),
        "dynamic request methods require a string-literal parameter union",
      );
      return type.literal.text.toUpperCase();
    });
    return [...new Set(values)].sort();
  }
  assert.fail(`request method parameter ${name} is not bounded`);
}

function formDeclarations(sourceFile) {
  const forms = [];
  walk(sourceFile, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return;
    }
    if (!ts.isIdentifier(node.tagName) || node.tagName.text !== "form") return;
    const method = staticJsxAttribute(node.attributes, "method");
    const action = staticJsxAttribute(node.attributes, "action");
    const intercepted = hasJsxAttribute(node.attributes, "onSubmit");
    forms.push({
      action,
      intercepted,
      method: typeof method === "string" ? method.toLowerCase() : method,
    });
  });
  return forms;
}

function formControlOverrides(sourceFile) {
  const overrides = [];
  walk(sourceFile, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return;
    }
    for (const name of ["formAction", "formMethod"]) {
      if (hasJsxAttribute(node.attributes, name)) {
        overrides.push({ tag: node.tagName.getText(), attribute: name });
      }
    }
  });
  return overrides;
}

function hasJsxAttribute(attributes, expectedName) {
  return attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) &&
      property.name.getText().toLowerCase() === expectedName.toLowerCase(),
  );
}

function staticJsxAttribute(attributes, expectedName) {
  const attribute = attributes.properties.find(
    (property) =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text.toLowerCase() === expectedName.toLowerCase(),
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) return null;
  if (!attribute.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    ts.isStringLiteralLike(attribute.initializer.expression)
  ) {
    return attribute.initializer.expression.text;
  }
  return undefined;
}

function compareInventory(left, right) {
  return `${left.file}\0${left.endpoint}\0${left.method}`.localeCompare(
    `${right.file}\0${right.endpoint}\0${right.method}`,
  );
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function parseSource(filename, source) {
  return ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

async function discoverSourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverSourceFiles(filename)));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(filename);
    }
  }
  return files;
}

function projectFile(relativeFilename) {
  return path.join(projectRoot, relativeFilename);
}

function relativePath(filename) {
  return path.relative(projectRoot, filename).replaceAll("\\", "/");
}
