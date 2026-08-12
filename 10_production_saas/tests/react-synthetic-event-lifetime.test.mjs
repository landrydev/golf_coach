import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const appRoot = fileURLToPath(new URL("../app", import.meta.url));
const syntheticEventType =
  /(?:Form|Change|Submit|Mouse|Keyboard|Focus|Synthetic)Event\b/;

test("async React handlers do not dereference synthetic events after awaiting", () => {
  const violations = [];

  for (const filePath of tsxFiles(appRoot)) {
    const source = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    visit(sourceFile, (node) => {
      if (!ts.isFunctionLike(node) || !isAsync(node) || !node.body) return;

      for (const parameter of node.parameters) {
        if (!ts.isIdentifier(parameter.name)) continue;
        const parameterName = parameter.name.text;
        const typeText = parameter.type?.getText(sourceFile) ?? "";
        const looksLikeReactEvent =
          parameterName === "event" ||
          parameterName === "e" ||
          syntheticEventType.test(typeText);
        if (!looksLikeReactEvent) continue;

        let firstAwait = Number.POSITIVE_INFINITY;
        visitFunctionBody(node.body, (candidate) => {
          if (ts.isAwaitExpression(candidate)) {
            firstAwait = Math.min(firstAwait, candidate.getStart(sourceFile));
          }
        });
        if (!Number.isFinite(firstAwait)) continue;

        visitFunctionBody(node.body, (candidate) => {
          if (
            ts.isIdentifier(candidate) &&
            candidate.text === parameterName &&
            candidate.getStart(sourceFile) > firstAwait
          ) {
            const location = sourceFile.getLineAndCharacterOfPosition(
              candidate.getStart(sourceFile),
            );
            violations.push(
              `${path.relative(appRoot, filePath)}:${location.line + 1}:${location.character + 1}`,
            );
          }
        });
      }
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Capture event.currentTarget, event.target, or required values before awaiting:\n${violations.join("\n")}`,
  );
});

function isAsync(node) {
  return Boolean(
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
    ),
  );
}

function visitFunctionBody(body, visitor) {
  function walk(node) {
    if (node !== body && ts.isFunctionLike(node)) return;
    visitor(node);
    ts.forEachChild(node, walk);
  }
  walk(body);
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}
