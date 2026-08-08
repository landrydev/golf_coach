import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(projectRoot, "app");
const matrixPath = resolve(projectRoot, "docs/AUDIT_EVENT_MATRIX.md");
const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];

test("the audit-event matrix covers every production mutation route and emitted action", async () => {
  const entries = parseMatrix(await readFile(matrixPath, "utf8"));
  const discovered = await discoverMutationRoutes();
  const discoveredByKey = new Map(
    discovered.map((entry) => [routeKey(entry), entry]),
  );
  const matrixKeys = entries.map(routeKey);

  assert.equal(
    new Set(matrixKeys).size,
    matrixKeys.length,
    "the audit-event matrix contains a duplicate route/method row",
  );
  assert.deepEqual(
    [...matrixKeys].sort(),
    [...discoveredByKey.keys()].sort(),
    "update docs/AUDIT_EVENT_MATRIX.md whenever a production mutation route is added, removed, or renamed",
  );

  const evidenceCache = new Map();
  for (const entry of entries) {
    const discoveredRoute = discoveredByKey.get(routeKey(entry));
    assert.ok(discoveredRoute, `${routeKey(entry)} is not a production route`);
    const routeSource = await readFile(discoveredRoute.filename, "utf8");

    assert.ok(
      entry.producers.length > 0,
      `${routeKey(entry)} must identify at least one route producer marker`,
    );
    for (const producer of entry.producers) {
      assert.match(
        producer,
        /^[A-Za-z_$][A-Za-z0-9_$]*$/,
        `${routeKey(entry)} has an invalid producer marker`,
      );
      assert.match(
        routeSource,
        new RegExp(`\\b${escapeRegExp(producer)}\\b`),
        `${routeKey(entry)} no longer references mapped producer ${producer}`,
      );
    }

    assert.ok(
      entry.actions.length > 0,
      `${routeKey(entry)} must map at least one successful durable mutation action`,
    );
    assert.ok(
      entry.sources.length > 0,
      `${routeKey(entry)} must identify production audit source evidence`,
    );

    const evidence = [];
    for (const sourceName of entry.sources) {
      assert.match(
        sourceName,
        /^lib\/[A-Za-z0-9_./-]+\.ts$/,
        `${routeKey(entry)} audit evidence must be a production lib/*.ts source`,
      );
      const filename = resolve(projectRoot, ...sourceName.split("/"));
      assert.ok(
        !relative(projectRoot, filename).startsWith(`..${sep}`),
        `${routeKey(entry)} audit evidence escapes the production project`,
      );
      let source = evidenceCache.get(filename);
      if (source === undefined) {
        source = await readFile(filename, "utf8");
        evidenceCache.set(filename, source);
      }
      evidence.push({ sourceName, source });
    }

    for (const action of entry.actions) {
      assert.match(
        action,
        /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/,
        `${routeKey(entry)} has a non-canonical audit action`,
      );
      const matches = evidence.filter(({ source }) =>
        containsQuotedLiteral(source, action),
      );
      assert.ok(
        matches.length > 0,
        `${routeKey(entry)} maps ${action}, but that action disappeared from ${entry.sources.join(", ")}`,
      );
      assert.ok(
        matches.some(({ source }) => /\bauditEvents\b|\baudit_events\b/.test(source)),
        `${routeKey(entry)} maps ${action} outside an audit-event persistence source`,
      );
    }
  }

  const transportOnly = entries.filter(({ noAuditBehavior }) =>
    noAuditBehavior.includes("[TRANSPORT-ONLY]"),
  );
  assert.deepEqual(
    transportOnly.map(routeKey).sort(),
    [
      "DELETE /r/session",
      "POST /api/billing/checkout",
      "POST /api/billing/webhook",
    ],
    "deliberate non-audited transport-only behavior must remain explicitly classified",
  );
});

function parseMatrix(markdown) {
  const section = markdown.match(
    /<!-- AUDIT_EVENT_MATRIX_START -->([\s\S]*?)<!-- AUDIT_EVENT_MATRIX_END -->/,
  );
  assert.ok(section, "AUDIT_EVENT_MATRIX markers are missing");

  const tableLines = section[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  assert.ok(tableLines.length >= 3, "AUDIT_EVENT_MATRIX table is missing");

  const header = splitRow(tableLines[0]);
  assert.deepEqual(header, [
    "Method",
    "Route",
    "Route producer marker(s)",
    "Expected success audit action(s)",
    "Audit source(s)",
    "Deliberate no-new-audit behavior",
  ]);
  assert.match(tableLines[1], /^\|(?:\s*:?-+:?\s*\|){6}$/);

  return tableLines.slice(2).map((line) => {
    const cells = splitRow(line);
    assert.equal(cells.length, header.length, `invalid matrix row: ${line}`);
    const [methodCell, routeCell, producersCell, actionsCell, sourcesCell, noAuditBehavior] = cells;
    const method = unquote(methodCell);
    const routePath = unquote(routeCell);
    assert.ok(mutationMethods.includes(method), `invalid mutation method ${method}`);
    assert.match(routePath, /^\//, `invalid route path ${routePath}`);
    return {
      method,
      routePath,
      producers: codeList(producersCell),
      actions: codeList(actionsCell),
      sources: codeList(sourcesCell),
      noAuditBehavior,
    };
  });
}

function splitRow(line) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function codeList(cell) {
  if (cell === "—") return [];
  return cell.split("<br>").map(unquote);
}

function unquote(value) {
  return value.replaceAll("`", "").trim();
}

async function discoverMutationRoutes() {
  const routes = [];
  for (const filename of (await walk(appRoot)).filter((candidate) =>
    candidate.endsWith(`${sep}route.ts`),
  )) {
    const source = await readFile(filename, "utf8");
    const methods = new Set();
    for (const pattern of [
      /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/g,
      /export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=/g,
    ]) {
      for (const match of source.matchAll(pattern)) methods.add(match[1]);
    }
    for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const exported of match[1].split(",")) {
        const method = exported.trim().match(
          /(?:^|\s+as\s+)(POST|PUT|PATCH|DELETE)$/,
        )?.[1];
        if (method) methods.add(method);
      }
    }
    for (const method of methods) {
      routes.push({ filename, method, routePath: routePathFor(filename) });
    }
  }
  return routes.sort((left, right) =>
    routeKey(left).localeCompare(routeKey(right)),
  );
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(filename)));
    else files.push(filename);
  }
  return files;
}

function routePathFor(filename) {
  const segments = relative(appRoot, filename)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function routeKey({ method, routePath }) {
  return `${method} ${routePath}`;
}

function containsQuotedLiteral(source, value) {
  return ["\"", "'", "`"].some((quote) =>
    source.includes(`${quote}${value}${quote}`),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
