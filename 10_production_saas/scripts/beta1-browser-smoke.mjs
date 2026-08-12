import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startFunctionalQaServer } from "./functional-qa-server.mjs";

const OUTPUT_DIR = path.resolve("output/beta1-smoke");
const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "mobile-320", width: 320, height: 844 }),
  Object.freeze({ name: "mobile-390", width: 390, height: 844 }),
  Object.freeze({ name: "tablet-768", width: 768, height: 1024 }),
  Object.freeze({ name: "desktop-1440", width: 1440, height: 1000 }),
]);
const STANDARD_SURFACES = Object.freeze([
  Object.freeze({ name: "overview", path: "/app" }),
  Object.freeze({ name: "golfers", path: "/app/golfers" }),
  Object.freeze({ name: "drill-library", path: "/app/coaching/drills" }),
  Object.freeze({ name: "roadmap-templates", path: "/app/coaching/roadmaps" }),
  Object.freeze({ name: "media", path: "/app/media" }),
  Object.freeze({ name: "packages", path: "/app/packages" }),
  Object.freeze({ name: "billing", path: "/app/billing" }),
  Object.freeze({ name: "settings", path: "/app/settings" }),
]);

await mkdir(OUTPUT_DIR, { recursive: true });
const runtime = await startFunctionalQaServer({
  port: 0,
  eagerScenarios: [
    "fresh",
    "standard",
    "three-phase",
    "mixed-30",
    "long-content",
    "expired",
    "revoked",
    "republished",
  ],
});
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  await reviewStandardDesktop();
  await reviewPrimaryResponsiveSurfaces();
  await reviewScenarioStates();
  await reviewPublicDemo();
} finally {
  await browser.close();
  await runtime.close();
}

const summary = Object.freeze({
  candidate: "Roadmap Beta 1 local full-feature experience",
  origin: runtime.origin,
  reviewedAt: new Date().toISOString(),
  resultCount: results.length,
  failureCount: failures.length,
  results,
  failures,
});
await writeFile(
  path.join(OUTPUT_DIR, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

if (failures.length > 0) {
  console.error("Beta 1 browser smoke review failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Beta 1 browser smoke review passed across ${results.length} reviewed surfaces.`);
}

async function reviewStandardDesktop() {
  const viewport = VIEWPORTS.at(-1);
  const context = await browser.newContext({ viewport: playwrightViewport(viewport) });
  const page = await context.newPage();
  attachDiagnostics(page, "desktop-standard");
  await visit(page, "desktop-standard-entry", `${runtime.origin}/__qa/standard/app`, viewport);

  for (const surface of STANDARD_SURFACES) {
    await visit(page, `desktop-${surface.name}`, `${runtime.origin}${surface.path}`, viewport);
  }

  await page.goto(`${runtime.origin}/app/golfers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const golferHref = await firstGolferHref(page);
  if (!golferHref) {
    failures.push("desktop-standard: no seeded golfer link was discoverable from /app/golfers");
  } else {
    await visit(page, "desktop-golfer-hub", `${runtime.origin}${golferHref}`, viewport);
    const golferDestinations = await page
      .locator(`a[href^="${golferHref}"]`)
      .evaluateAll((links) =>
        [...new Set(links.map((link) => link.getAttribute("href")).filter(Boolean))],
      );
    for (const [index, href] of golferDestinations.slice(0, 12).entries()) {
      await visit(
        page,
        `desktop-golfer-destination-${index + 1}`,
        new URL(href, runtime.origin).href,
        viewport,
      );
    }
  }

  await context.close();
}

async function reviewPrimaryResponsiveSurfaces() {
  for (const viewport of VIEWPORTS) {
    const coachContext = await browser.newContext({ viewport: playwrightViewport(viewport) });
    const coachPage = await coachContext.newPage();
    attachDiagnostics(coachPage, `${viewport.name}-coach`);
    await visit(
      coachPage,
      `${viewport.name}-coach-overview`,
      `${runtime.origin}/__qa/standard/app`,
      viewport,
    );
    await visit(
      coachPage,
      `${viewport.name}-coach-media`,
      `${runtime.origin}/app/media`,
      viewport,
    );
    await visit(
      coachPage,
      `${viewport.name}-coach-drills`,
      `${runtime.origin}/app/coaching/drills`,
      viewport,
    );
    await coachContext.close();

    const golferContext = await browser.newContext({ viewport: playwrightViewport(viewport) });
    const golferPage = await golferContext.newPage();
    attachDiagnostics(golferPage, `${viewport.name}-golfer`);
    await visit(
      golferPage,
      `${viewport.name}-golfer-roadmap`,
      `${runtime.origin}/__qa/standard/golfer`,
      viewport,
    );
    await golferContext.close();
  }
}

async function reviewScenarioStates() {
  const viewport = VIEWPORTS.at(-1);
  const entries = [
    ["fresh-coach", "/__qa/fresh/app"],
    ["three-phase-coach", "/__qa/three-phase/app"],
    ["three-phase-golfer", "/__qa/three-phase/golfer"],
    ["mixed-30-coach", "/__qa/mixed-30/app"],
    ["long-content-coach", "/__qa/long-content/app"],
    ["long-content-golfer", "/__qa/long-content/golfer"],
    ["expired-golfer", "/__qa/expired/golfer"],
    ["revoked-golfer", "/__qa/revoked/golfer"],
    ["republished-current", "/__qa/republished/golfer"],
    ["republished-old", "/__qa/republished/old-golfer"],
  ];

  for (const [name, entry] of entries) {
    const context = await browser.newContext({ viewport: playwrightViewport(viewport) });
    const page = await context.newPage();
    attachDiagnostics(page, name);
    await visit(page, name, `${runtime.origin}${entry}`, viewport);
    await context.close();
  }
}

async function reviewPublicDemo() {
  const viewport = VIEWPORTS.at(-1);
  const context = await browser.newContext({ viewport: playwrightViewport(viewport) });
  const page = await context.newPage();
  attachDiagnostics(page, "public-demo");
  await visit(page, "public-demo", `${runtime.origin}/demo`, viewport);
  await context.close();
}

function attachDiagnostics(page, label) {
  page.on("pageerror", (error) => failures.push(`${label}: page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label}: console error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.endsWith("/favicon.ico")) {
      failures.push(`${label}: failed request: ${request.method()} ${url}: ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
}

async function visit(page, name, url, viewport) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await settle(page);
  const status = response?.status() ?? null;
  if (status !== null && status >= 500) failures.push(`${name}: document returned ${status}`);

  const bodyText = (await page.locator("body").innerText()).trim();
  if (bodyText.length < 20) failures.push(`${name}: rendered body was unexpectedly empty`);

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  if (geometry.documentWidth > geometry.viewportWidth + 1) {
    failures.push(
      `${name}: root horizontal overflow ${geometry.documentWidth}px > ${geometry.viewportWidth}px`,
    );
  }

  const fileName = `${safeName(name)}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true,
  });
  results.push({
    name,
    requestedUrl: url,
    finalUrl: page.url(),
    status,
    viewport,
    bodyCharacters: bodyText.length,
    geometry,
    screenshot: fileName,
  });
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(350);
}

async function firstGolferHref(page) {
  const hrefs = await page
    .locator('a[href^="/app/golfers/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter(Boolean));
  return hrefs.find((href) => /^\/app\/golfers\/[^/?#]+$/.test(href)) ?? null;
}

function playwrightViewport(viewport) {
  return { width: viewport.width, height: viewport.height };
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
