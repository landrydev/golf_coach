import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const AUTH_ENTRY = "/auth/login?return_to=%2Fapp";
const PUBLIC_ENTRY_SURFACES = new Map([
  ["../app/page.tsx", 3],
  ["../app/_components/SiteHeader.tsx", 2],
  ["../app/_components/SiteFooter.tsx", 1],
  ["../app/support/page.tsx", 2],
]);

test("public workspace CTAs use native top-level authentication anchors", async () => {
  for (const [relativePath, expectedAuthLinks] of PUBLIC_ENTRY_SURFACES) {
    const sourceText = await readFile(
      new URL(relativePath, import.meta.url),
      "utf8",
    );
    const sourceFile = ts.createSourceFile(
      relativePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const links = staticJsxLinks(sourceFile);

    assert.equal(
      links.filter(({ href }) => href === "/app").length,
      0,
      `${relativePath} must not send an anonymous public CTA directly to /app`,
    );

    const authenticationLinks = links.filter(({ href }) => href === AUTH_ENTRY);
    assert.equal(
      authenticationLinks.length,
      expectedAuthLinks,
      `${relativePath} must retain every expected sign-in/start CTA`,
    );
    for (const link of authenticationLinks) {
      assert.equal(
        link.tagName,
        "a",
        `${relativePath}:${link.line} must use a native anchor for top-level authentication navigation`,
      );
    }
  }
});

test("public acquisition explains the unified sign-in and provider signup boundary", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /same secure identity entry handles sign-in and account/);
  assert.match(source, /selected provider enables signup/);
  assert.doesNotMatch(source, /\/auth\/signup|create-account/);
});

function staticJsxLinks(sourceFile) {
  const links = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const href = opening.attributes.properties.find(
        (attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "href",
      );
      if (
        href &&
        ts.isJsxAttribute(href) &&
        href.initializer &&
        ts.isStringLiteral(href.initializer)
      ) {
        links.push({
          href: href.initializer.text,
          line:
            sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile))
              .line + 1,
          tagName: opening.tagName.getText(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return links;
}
